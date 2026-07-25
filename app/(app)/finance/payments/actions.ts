"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireIncomingFinanceOperationsAccess } from "@/lib/auth/server";
import { getClientById } from "@/lib/clients/service";
import { createDocument } from "@/lib/documents/service";
import { deletePayment, getPaymentById, updatePayment, createPayment } from "@/lib/finance/service";
import { getProjectById } from "@/lib/projects/service";
import type { AppRole } from "@/types/auth";
import type { PaymentFormValues, PaymentMethod, PaymentStatus } from "@/types/finance";

export type PaymentActionState = {
  error?: string;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getReturnPath(formData: FormData) {
  const returnPath = getString(formData, "return_path");
  return returnPath === "/finance/incoming" ? returnPath : "/finance/payments";
}

function parsePaymentFormData(formData: FormData): PaymentFormValues {
  return {
    client_id: getString(formData, "client_id"),
    project_id: getString(formData, "project_id"),
    contract_id: getString(formData, "contract_id"),
    invoice_id: getString(formData, "invoice_id"),
    amount: getString(formData, "amount"),
    currency: getString(formData, "currency"),
    due_date: getString(formData, "due_date"),
    payment_date: getString(formData, "payment_date"),
    method: getString(formData, "method") as PaymentMethod,
    status: getString(formData, "status") as PaymentStatus,
    reference: getString(formData, "reference"),
    notes: getString(formData, "notes"),
  };
}

function getSupportingFile(formData: FormData) {
  const file = formData.get("supporting_file");
  return file instanceof File && file.size > 0 ? file : null;
}

async function attachPaymentSupportingDocument(
  paymentId: string,
  values: PaymentFormValues,
  actorUserId: string,
  file: File | null,
) {
  if (!file) {
    return;
  }

  const title = values.reference.trim()
    ? `Payment proof - ${values.reference.trim()}`
    : `Payment proof - ${values.client_id}`;

  await createDocument(
    {
      title,
      description: values.notes.trim() || "Supporting document attached from the finance payments workflow.",
      document_type: "receipt",
      related_type: "payment",
      related_id: paymentId,
      visibility: "management",
    },
    file,
    actorUserId,
  );
}

function validate(values: PaymentFormValues) {
  if (!values.client_id || !values.amount || !values.currency || !values.method || !values.status) {
    return "Client, amount, currency, method, and status are required.";
  }

  if (Number.isNaN(Number(values.amount)) || Number(values.amount) <= 0) {
    return "Amount must be a valid positive number.";
  }

  if (values.payment_date && values.due_date && values.payment_date < values.due_date && values.status === "reconciled") {
    return null;
  }

  if ((values.status === "received" || values.status === "reconciled") && !values.payment_date) {
    return "Payment date is required when marking a payment as received or reconciled.";
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

  return client?.account_manager_id === userId || project?.owner_id === userId;
}

export async function createPaymentAction(
  _prevState: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const auth = await requireIncomingFinanceOperationsAccess();

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    return { error: "You do not have permission to create payments." };
  }

  const values = parsePaymentFormData(formData);
  const supportingFile = getSupportingFile(formData);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError };
  }

  if (!(await canManageScope(auth.role, auth.profile.id, values.client_id, values.project_id || null))) {
    return { error: "You can only create payments for clients or projects assigned to you." };
  }

  const paymentId = await createPayment(values, auth.profile.id);
  await attachPaymentSupportingDocument(paymentId, values, auth.profile.id, supportingFile);
  const returnPath = getReturnPath(formData);
  revalidatePath("/documents");
  revalidatePath("/finance");
  revalidatePath("/finance/incoming");
  revalidatePath("/finance/invoices");
  revalidatePath("/finance/payments");
  redirect(`${returnPath}?toast=payment-created`);
}

export async function updatePaymentAction(
  _prevState: PaymentActionState,
  formData: FormData,
): Promise<PaymentActionState> {
  const auth = await requireIncomingFinanceOperationsAccess();
  const paymentId = getString(formData, "payment_id");

  if (!paymentId) {
    return { error: "Missing payment identifier." };
  }

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    return { error: "You do not have permission to edit payments." };
  }

  const values = parsePaymentFormData(formData);
  const supportingFile = getSupportingFile(formData);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError };
  }

  if (!(await canManageScope(auth.role, auth.profile.id, values.client_id, values.project_id || null))) {
    return { error: "You can only edit payments for clients or projects assigned to you." };
  }

  await updatePayment(paymentId, values, auth.profile.id);
  await attachPaymentSupportingDocument(paymentId, values, auth.profile.id, supportingFile);
  const returnPath = getReturnPath(formData);
  revalidatePath("/documents");
  revalidatePath("/finance");
  revalidatePath("/finance/incoming");
  revalidatePath("/finance/invoices");
  revalidatePath("/finance/payments");
  redirect(`${returnPath}?toast=payment-updated`);
}

export async function deletePaymentAction(formData: FormData) {
  const auth = await requireIncomingFinanceOperationsAccess();
  const paymentId = getString(formData, "payment_id");

  if (!paymentId) {
    redirect("/finance/payments?toast=payment-delete-error");
  }

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    redirect("/finance/payments?toast=payment-delete-error");
  }

  const payment = await getPaymentById(paymentId, auth.role);

  if (!payment) {
    redirect("/finance/payments?toast=payment-delete-error");
  }

  if (!(await canManageScope(auth.role, auth.profile.id, payment.client_id, payment.project_id))) {
    redirect("/finance/payments?toast=payment-delete-error");
  }

  await deletePayment(paymentId);
  revalidatePath("/finance");
  revalidatePath("/finance/incoming");
  revalidatePath("/finance/invoices");
  revalidatePath("/documents");
  revalidatePath("/finance/payments");
  redirect("/finance/payments?toast=payment-deleted");
}
