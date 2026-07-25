"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { logActivity } from "@/lib/activity/service";
import { requireRouteAccess } from "@/lib/auth/server";
import { getClientById } from "@/lib/clients/service";
import { createDocument } from "@/lib/documents/service";
import { createTransfer, deleteTransfer, getTransferById, updateTransfer } from "@/lib/finance/service";
import { getProjectById } from "@/lib/projects/service";
import type { AppRole } from "@/types/auth";
import type { TransferCategory, TransferEntity, TransferFormValues, TransferStatus } from "@/types/finance";

export type TransferActionState = {
  error?: string;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function getReturnPath(formData: FormData) {
  const returnPath = getString(formData, "return_path");
  if (
    returnPath === "/finance"
    || returnPath === "/finance/outgoing"
    || returnPath === "/finance/transfers"
  ) {
    return returnPath;
  }

  return "/finance/transfers";
}

function isFrenchLocale(formData: FormData) {
  return getString(formData, "ui_locale") === "fr";
}

function getTransferPersistenceErrorMessage(error: unknown, isFr: boolean) {
  const message = error instanceof Error ? error.message : "";

  if (message.includes("transfers_transfer_reference_key") || message.includes("duplicate key value")) {
    return isFr
      ? "Cette référence de facture fournisseur existe déjà. Utilisez une référence différente."
      : "This supplier invoice reference already exists. Use a different reference.";
  }

  return isFr
    ? "Impossible d'enregistrer la facture fournisseur pour le moment."
    : "Unable to save the supplier invoice right now.";
}

function parseTransferFormData(formData: FormData): TransferFormValues {
  return {
    transfer_reference: getString(formData, "transfer_reference"),
    beneficiary_name: getString(formData, "beneficiary_name"),
    beneficiary_bank: getString(formData, "beneficiary_bank"),
    beneficiary_account: getString(formData, "beneficiary_account"),
    amount: getString(formData, "amount"),
    currency: getString(formData, "currency"),
    transfer_date: getString(formData, "transfer_date"),
    status: getString(formData, "status") as TransferStatus,
    category: getString(formData, "category") as TransferCategory,
    entity: getString(formData, "entity") as TransferEntity,
    related_project_id: getString(formData, "related_project_id"),
    related_client_id: getString(formData, "related_client_id"),
    notes: getString(formData, "notes"),
  };
}

function getSupportingFile(formData: FormData) {
  const file = formData.get("supporting_file");
  return file instanceof File && file.size > 0 ? file : null;
}

async function attachTransferSupportingDocument(
  transferId: string,
  values: TransferFormValues,
  actorUserId: string,
  file: File | null,
) {
  if (!file) {
    return;
  }

  await createDocument(
    {
      title: `Transfer proof - ${values.transfer_reference.trim()}`,
      description: values.notes.trim() || "Supporting document attached from the finance transfers workflow.",
      document_type: "bank_transfer",
      related_type: "transfer",
      related_id: transferId,
      visibility: "management",
    },
    file,
    actorUserId,
  ).catch(async (error) => {
    if (!(error instanceof Error) || !error.message.includes("invalid input value for enum document_related_type")) {
      throw error;
    }

    await createDocument(
      {
        title: `Transfer proof - ${values.transfer_reference.trim()}`,
        description: [
          `Fallback archive for transfer ${values.transfer_reference.trim()}.`,
          values.notes.trim(),
        ].filter(Boolean).join("\n"),
        document_type: "bank_transfer",
        related_type: "archive",
        related_id: "",
        visibility: "management",
      },
      file,
      actorUserId,
    );
  });
}

async function runTransferSideEffects(options: {
  transferId: string;
  transferValues: TransferFormValues;
  actorUserId: string;
  supportingFile: File | null;
}) {
  const warnings: string[] = [];

  try {
    await attachTransferSupportingDocument(
      options.transferId,
      options.transferValues,
      options.actorUserId,
      options.supportingFile,
    );
  } catch (error) {
    warnings.push("transfer-supporting-file");
    console.error("Transfer supporting document attachment failed after save.", error);
  }

  if (warnings.length) {
    try {
      await logActivity({
        userId: options.actorUserId,
        action: "Transfer saved with side effect warnings",
        entityType: "transfer",
        entityId: options.transferId,
        metadata: {
          kind: "update",
          summary: `Transfer saved, but follow-up steps failed: ${warnings.join(", ")}`,
        },
      });
    } catch (loggingError) {
      console.error("Transfer warning activity log failed.", loggingError);
    }
  }
}

function validate(values: TransferFormValues) {
  if (
    !values.transfer_reference
    || !values.beneficiary_name
    || !values.amount
    || !values.currency
    || !values.transfer_date
    || !values.status
    || !values.category
    || !values.entity
  ) {
    return "Reference, beneficiary, amount, currency, date, status, category, and entity are required.";
  }

  if (Number.isNaN(Number(values.amount)) || Number(values.amount) <= 0) {
    return "Amount must be a valid positive number.";
  }

  return null;
}

async function canManageScope(
  role: AppRole,
  userId: string,
  clientId?: string | null,
  projectId?: string | null,
) {
  if (role === "admin") {
    return true;
  }

  if (role === "shareholder" || role === "supervisor") {
    return false;
  }

  const client = clientId ? await getClientById(clientId, role) : null;
  const project = projectId ? await getProjectById(projectId) : null;

  return Boolean(client?.account_manager_id === userId || project?.owner_id === userId);
}

export async function createTransferAction(
  _prevState: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const auth = await requireRouteAccess("finance");

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    return { error: "You do not have permission to create transfers." };
  }

  const values = parseTransferFormData(formData);
  const supportingFile = getSupportingFile(formData);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError };
  }

  if (!supportingFile) {
    return { error: "La facture fournisseur ou la pièce justificative est requise." };
  }

  if (!(await canManageScope(auth.role, auth.profile.id, values.related_client_id || null, values.related_project_id || null))) {
    return { error: "Managers and employees can only create transfers for assigned clients or managed projects." };
  }

  const isFr = isFrenchLocale(formData);
  let transferId: string;

  try {
    transferId = await createTransfer(values, auth.profile.id);
  } catch (error) {
    console.error("Transfer creation failed.", error);
    return { error: getTransferPersistenceErrorMessage(error, isFr) };
  }

  await runTransferSideEffects({
    transferId,
    transferValues: values,
    actorUserId: auth.profile.id,
    supportingFile,
  });
  const returnPath = getReturnPath(formData);
  revalidatePath("/finance");
  revalidatePath("/documents");
  revalidatePath("/finance/outgoing");
  revalidatePath("/finance/transfers");
  redirect(`${returnPath}?toast=transfer-created`);
}

export async function updateTransferAction(
  _prevState: TransferActionState,
  formData: FormData,
): Promise<TransferActionState> {
  const auth = await requireRouteAccess("finance");
  const transferId = getString(formData, "transfer_id");

  if (!transferId) {
    return { error: "Missing transfer identifier." };
  }

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    return { error: "You do not have permission to edit transfers." };
  }

  const values = parseTransferFormData(formData);
  const supportingFile = getSupportingFile(formData);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError };
  }

  if (!(await canManageScope(auth.role, auth.profile.id, values.related_client_id || null, values.related_project_id || null))) {
    return { error: "Managers and employees can only edit transfers for assigned clients or managed projects." };
  }

  const isFr = isFrenchLocale(formData);

  try {
    await updateTransfer(transferId, values, auth.profile.id);
  } catch (error) {
    console.error("Transfer update failed.", error);
    return { error: getTransferPersistenceErrorMessage(error, isFr) };
  }

  await runTransferSideEffects({
    transferId,
    transferValues: values,
    actorUserId: auth.profile.id,
    supportingFile,
  });
  const returnPath = getReturnPath(formData);
  revalidatePath("/finance");
  revalidatePath("/documents");
  revalidatePath("/finance/outgoing");
  revalidatePath("/finance/transfers");
  redirect(`${returnPath}?toast=transfer-updated`);
}

export async function deleteTransferAction(formData: FormData) {
  const auth = await requireRouteAccess("finance");
  const transferId = getString(formData, "transfer_id");
  const returnPath = getReturnPath(formData);

  if (!transferId) {
    redirect(`${returnPath}?toast=transfer-delete-error`);
  }

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    redirect(`${returnPath}?toast=transfer-delete-error`);
  }

  const transfer = await getTransferById(transferId, auth.role);

  if (!transfer) {
    redirect(`${returnPath}?toast=transfer-delete-error`);
  }

  if (!(await canManageScope(auth.role, auth.profile.id, transfer.related_client_id, transfer.related_project_id))) {
    redirect(`${returnPath}?toast=transfer-delete-error`);
  }

  await deleteTransfer(transferId);
  revalidatePath("/finance");
  revalidatePath("/finance/outgoing");
  revalidatePath("/finance/transfers");
  redirect(`${returnPath}?toast=transfer-deleted`);
}
