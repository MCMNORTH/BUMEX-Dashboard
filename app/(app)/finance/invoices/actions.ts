"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireIncomingFinanceOperationsAccess } from "@/lib/auth/server";
import { logActivity } from "@/lib/activity/service";
import { getClientById } from "@/lib/clients/service";
import { createDocument } from "@/lib/documents/service";
import { sendInvoiceToRecipient, ensureInvoicePdfDocument } from "@/lib/finance/invoice-delivery";
import { buildInvoiceNotes } from "@/lib/finance/invoice-metadata";
import { createInvoice, createReceipt, deleteInvoice, getInvoiceById, updateInvoice } from "@/lib/finance/service";
import { isSmtpConfigured } from "@/lib/email/server";
import { parseFormattedNumber } from "@/lib/formatters";
import { getProjectById } from "@/lib/projects/service";
import type { AppRole } from "@/types/auth";
import type {
  InvoiceFormValues,
  InvoiceLineItem,
  InvoiceStatus,
  PaymentMethod,
  ReceiptFormValues,
} from "@/types/finance";

export type InvoiceActionState = {
  error?: string;
  createdInvoiceId?: string;
  previewUrl?: string;
  success?: boolean;
};

export type ReceiptActionState = {
  error?: string;
};

export type SendInvoiceActionState = {
  error?: string;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getFinanceReturnPath(formData: FormData) {
  const returnPath = getString(formData, "return_path");

  if (
    returnPath === "/finance"
    || returnPath === "/finance/incoming"
    || returnPath === "/finance/invoices"
    || returnPath.startsWith("/finance/invoices/")
  ) {
    return returnPath;
  }

  return "/finance/invoices";
}

function isFrenchLocale(formData: FormData) {
  return getString(formData, "ui_locale") === "fr";
}

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseInvoiceFormData(formData: FormData): InvoiceFormValues {
  const notes = getString(formData, "notes");
  const gtaMode = getString(formData, "gta_mode");
  const paymentMethod = getString(formData, "payment_method") as PaymentMethod;
  const items = parseInvoiceItems(formData);

  return {
    invoice_number: getString(formData, "invoice_number"),
    client_id: getString(formData, "client_id"),
    project_id: getString(formData, "project_id"),
    contract_id: getString(formData, "contract_id"),
    issue_date: getString(formData, "issue_date"),
    due_date: getString(formData, "due_date"),
    amount_ht: getString(formData, "amount_ht"),
    tax_amount: getString(formData, "tax_amount"),
    amount_ttc: getString(formData, "amount_ttc"),
    currency: getString(formData, "currency"),
    status: getString(formData, "status") as InvoiceStatus,
    notes: buildInvoiceNotes({
      notes,
      isGta: gtaMode === "gta",
      paymentMethod,
      items,
    }),
  };
}

function parseInvoiceItems(formData: FormData): InvoiceLineItem[] {
  const raw = getString(formData, "invoice_items");
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as InvoiceLineItem[];
    return parsed
      .map((item) => ({
        name: item.name.trim(),
        price: Number(item.price),
      }))
      .filter((item) => item.name && Number.isFinite(item.price) && item.price >= 0);
  } catch {
    return [];
  }
}

function getSupportingFile(formData: FormData) {
  const file = formData.get("supporting_file");
  return file instanceof File && file.size > 0 ? file : null;
}

async function attachInvoiceSupportingDocument(
  invoiceId: string,
  values: InvoiceFormValues,
  actorUserId: string,
  file: File | null,
) {
  if (!file) {
    return;
  }

  const title = values.invoice_number.trim()
    ? `Invoice file - ${values.invoice_number.trim()}`
    : "Invoice file";

  await createDocument(
    {
      title,
      description: values.notes.trim() || "Supporting document attached from the invoice workflow.",
      document_type: "invoice",
      related_type: "invoice",
      related_id: invoiceId,
      visibility: "management",
    },
    file,
    actorUserId,
  );
}

async function runInvoiceSideEffects(options: {
  invoiceId: string;
  invoiceValues: InvoiceFormValues;
  actorUserId: string;
  actorRole: AppRole;
  supportingFile: File | null;
}) {
  const warnings: string[] = [];

  try {
    const invoice = await getInvoiceById(options.invoiceId, options.actorRole);
    if (invoice) {
      await ensureInvoicePdfDocument(invoice, options.actorUserId);
    }
  } catch (error) {
    warnings.push("invoice-pdf");
    console.error("Invoice PDF generation failed after save.", error);
  }

  try {
    await attachInvoiceSupportingDocument(
      options.invoiceId,
      options.invoiceValues,
      options.actorUserId,
      options.supportingFile,
    );
  } catch (error) {
    warnings.push("invoice-supporting-file");
    console.error("Invoice supporting document attachment failed after save.", error);
  }

  if (warnings.length) {
    try {
      await logActivity({
        userId: options.actorUserId,
        action: "Invoice saved with side effect warnings",
        entityType: "invoice",
        entityId: options.invoiceId,
        metadata: {
          kind: "update",
          summary: `Invoice saved, but follow-up steps failed: ${warnings.join(", ")}`,
        },
      });
    } catch (loggingError) {
      console.error("Invoice warning activity log failed.", loggingError);
    }
  }
}

function parseReceiptFormData(formData: FormData): ReceiptFormValues {
  return {
    receipt_number: getString(formData, "receipt_number"),
    payment_id: getString(formData, "payment_id"),
    issue_date: getString(formData, "issue_date"),
    amount: getString(formData, "amount"),
    document_id: getString(formData, "document_id"),
    notes: getString(formData, "notes"),
  };
}

function validateInvoice(values: InvoiceFormValues, options: { requireInvoiceNumber?: boolean; isFr?: boolean } = {}) {
  const requireInvoiceNumber = options.requireInvoiceNumber ?? true;
  const isFr = options.isFr ?? false;

  if (
    (requireInvoiceNumber && !values.invoice_number)
    || !values.client_id
    || !values.issue_date
    || !values.due_date
    || !values.amount_ht
    || !values.tax_amount
    || !values.amount_ttc
    || !values.currency
    || !values.status
  ) {
    return requireInvoiceNumber
      ? (isFr
        ? "Le numéro de facture, le client, les dates, les montants, la devise et le statut sont requis."
        : "Invoice number, client, dates, amounts, currency, and status are required.")
      : (isFr
        ? "Le client, les dates, les montants, la devise et le statut sont requis."
        : "Client, dates, amounts, currency, and status are required.");
  }

  const amountHt = parseFormattedNumber(values.amount_ht);
  const taxAmount = parseFormattedNumber(values.tax_amount);
  const amountTtc = parseFormattedNumber(values.amount_ttc);
  const items = parseInvoiceItemsFromNotes(values.notes);

  if ([amountHt, taxAmount, amountTtc].some((value) => value === null || value < 0)) {
    return isFr ? "Les montants de la facture doivent être des nombres positifs valides." : "Invoice amounts must be valid positive numbers.";
  }

  if (amountHt === null || taxAmount === null || amountTtc === null) {
    return isFr ? "Les montants de la facture doivent être des nombres positifs valides." : "Invoice amounts must be valid positive numbers.";
  }

  if (!items.length) {
    return isFr ? "Ajoutez au moins un article à la facture." : "Add at least one invoice item.";
  }

  if (Number((amountHt + taxAmount).toFixed(2)) !== Number(amountTtc.toFixed(2))) {
    return isFr ? "Le montant TTC doit être égal au sous-total plus la taxe." : "Gross amount must equal net amount plus tax.";
  }

  if (values.due_date < values.issue_date) {
    return isFr ? "La date d'échéance doit être identique ou postérieure à la date d'émission." : "Due date must be on or after issue date.";
  }

  return null;
}

function parseInvoiceItemsFromNotes(notes: string) {
  const match = notes.match(/\[INVOICE_META\]([\s\S]*?)\[\/INVOICE_META\]/i);
  if (!match?.[1]) {
    return [];
  }

  try {
    const parsed = JSON.parse(match[1]) as { items?: InvoiceLineItem[] };
    return Array.isArray(parsed.items) ? parsed.items : [];
  } catch {
    return [];
  }
}

function validateReceipt(values: ReceiptFormValues) {
  if (!values.receipt_number || !values.payment_id || !values.issue_date || !values.amount) {
    return "Receipt number, payment, issue date, and amount are required.";
  }

  if (Number.isNaN(Number(values.amount)) || Number(values.amount) <= 0) {
    return "Receipt amount must be a valid positive number.";
  }

  return null;
}

async function canManageScope(
  role: AppRole,
  userId: string,
  clientId: string,
  projectId?: string | null,
) {
  if (role === "admin" || role === "employee") {
    return true;
  }

  if (role !== "manager") {
    return false;
  }

  const client = await getClientById(clientId, role);
  const project = projectId ? await getProjectById(projectId) : null;

  return Boolean(client?.account_manager_id === userId || project?.owner_id === userId);
}

export async function createInvoiceAction(
  _prevState: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  try {
    const auth = await requireIncomingFinanceOperationsAccess();

    if (auth.role === "shareholder" || auth.role === "supervisor") {
      return { error: "You do not have permission to create invoices." };
    }

    const values = parseInvoiceFormData(formData);
    const supportingFile = getSupportingFile(formData);
    const validationError = validateInvoice(values, { requireInvoiceNumber: false, isFr: isFrenchLocale(formData) });

    if (validationError) {
      return { error: validationError };
    }

    if (!(await canManageScope(auth.role, auth.profile.id, values.client_id, values.project_id || null))) {
      return { error: "You can only create invoices for clients or projects assigned to you." };
    }

    const invoiceId = await createInvoice(values, auth.profile.id);
    await runInvoiceSideEffects({
      invoiceId,
      invoiceValues: values,
      actorUserId: auth.profile.id,
      actorRole: auth.role,
      supportingFile,
    });
    revalidatePath("/documents");
    revalidatePath("/finance");
    revalidatePath("/finance/invoices");
    revalidatePath("/finance/payments");
    return {
      success: true,
      createdInvoiceId: invoiceId,
      previewUrl: `/finance/invoices/${invoiceId}/preview`,
    };
  } catch (error) {
    console.error("Invoice creation failed.", error);

    const message = error instanceof Error ? error.message : "Unable to create the invoice right now.";
    if (message.includes("invoices_invoice_number_key")) {
      return { error: "A unique invoice number could not be generated. Please try again." };
    }

    return { error: message };
  }
}

export async function updateInvoiceAction(
  _prevState: InvoiceActionState,
  formData: FormData,
): Promise<InvoiceActionState> {
  const auth = await requireIncomingFinanceOperationsAccess();
  const invoiceId = getString(formData, "invoice_id");

  if (!invoiceId) {
    return { error: "Missing invoice identifier." };
  }

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    return { error: "You do not have permission to edit invoices." };
  }

  const values = parseInvoiceFormData(formData);
  const supportingFile = getSupportingFile(formData);
  const validationError = validateInvoice(values, { isFr: isFrenchLocale(formData) });

  if (validationError) {
    return { error: validationError };
  }

  if (!(await canManageScope(auth.role, auth.profile.id, values.client_id, values.project_id || null))) {
    return { error: "You can only edit invoices for clients or projects assigned to you." };
  }

  await updateInvoice(invoiceId, values, auth.profile.id);
  const returnPath = getFinanceReturnPath(formData);
  await runInvoiceSideEffects({
    invoiceId,
    invoiceValues: values,
    actorUserId: auth.profile.id,
    actorRole: auth.role,
    supportingFile,
  });
  revalidatePath("/documents");
  revalidatePath("/finance");
  revalidatePath("/finance/invoices");
  revalidatePath("/finance/payments");
  redirect(`${returnPath}?toast=invoice-updated`);
}

export async function deleteInvoiceAction(formData: FormData) {
  const auth = await requireIncomingFinanceOperationsAccess();
  const invoiceId = getString(formData, "invoice_id");
  const returnPath = getFinanceReturnPath(formData);

  if (!invoiceId) {
    redirect(`${returnPath}?toast=invoice-delete-error`);
  }

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    redirect(`${returnPath}?toast=invoice-delete-error`);
  }

  const invoice = await getInvoiceById(invoiceId, auth.role);

  if (!invoice) {
    redirect(`${returnPath}?toast=invoice-delete-error`);
  }

  if (!(await canManageScope(auth.role, auth.profile.id, invoice.client_id, invoice.project_id))) {
    redirect(`${returnPath}?toast=invoice-delete-error`);
  }

  await deleteInvoice(invoiceId);
  revalidatePath("/finance");
  revalidatePath("/finance/invoices");
  revalidatePath("/finance/payments");
  redirect(`${returnPath}?toast=invoice-deleted`);
}

export async function createReceiptAction(
  _prevState: ReceiptActionState,
  formData: FormData,
): Promise<ReceiptActionState> {
  const auth = await requireIncomingFinanceOperationsAccess();
  const returnPath = getFinanceReturnPath(formData);

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    return { error: "You do not have permission to create receipts." };
  }

  const values = parseReceiptFormData(formData);
  const validationError = validateReceipt(values);

  if (validationError) {
    return { error: validationError };
  }

  await createReceipt(values, auth.profile.id);
  revalidatePath("/documents");
  revalidatePath("/finance");
  revalidatePath("/finance/incoming");
  revalidatePath("/finance/invoices");
  revalidatePath("/finance/payments");
  redirect(`${returnPath}?toast=receipt-created`);
}

export async function sendInvoiceEmailAction(
  _prevState: SendInvoiceActionState,
  formData: FormData,
): Promise<SendInvoiceActionState> {
  const auth = await requireIncomingFinanceOperationsAccess();
  const invoiceId = getString(formData, "invoice_id");
  const recipientEmail = getString(formData, "recipient_email").toLowerCase();

  if (!invoiceId) {
    return { error: "Missing invoice identifier." };
  }

  if (!recipientEmail || !isValidEmail(recipientEmail)) {
    return { error: "Please enter a valid recipient email address." };
  }

  if (!isSmtpConfigured()) {
    return { error: "SMTP is not configured yet. Add the SMTP environment variables before sending invoices." };
  }

  const invoice = await getInvoiceById(invoiceId, auth.role);

  if (!invoice) {
    return { error: "Invoice not found." };
  }

  if (!(await canManageScope(auth.role, auth.profile.id, invoice.client_id, invoice.project_id))) {
    return { error: "You do not have permission to send this invoice." };
  }

  await sendInvoiceToRecipient(invoice, recipientEmail, auth.profile.id);
  revalidatePath("/documents");
  revalidatePath("/finance");
  revalidatePath("/finance/invoices");
  redirect(`${getFinanceReturnPath(formData)}?toast=invoice-sent`);
}
