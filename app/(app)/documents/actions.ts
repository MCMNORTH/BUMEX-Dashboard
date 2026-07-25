"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRouteAccess } from "@/lib/auth/server";
import {
  createDocument,
  deleteDocument,
  getDocumentById,
  setDocumentArchiveState,
  updateDocument,
} from "@/lib/documents/service";
import type { AppRole } from "@/types/auth";
import type {
  DocumentFormValues,
  DocumentRelatedType,
  DocumentType,
  DocumentVisibility,
} from "@/types/document";

export type DocumentActionState = {
  error?: string;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseDocumentFormData(formData: FormData): DocumentFormValues {
  return {
    title: getString(formData, "title"),
    description: getString(formData, "description"),
    document_type: getString(formData, "document_type") as DocumentType,
    related_type: getString(formData, "related_type") as DocumentRelatedType,
    related_id: getString(formData, "related_id"),
    visibility: getString(formData, "visibility") as DocumentVisibility,
  };
}

function validate(values: DocumentFormValues) {
  if (!values.title || !values.document_type || !values.related_type || !values.visibility) {
    return "Title, document type, related scope, and visibility are required.";
  }

  if (values.related_type !== "archive" && !values.related_id) {
    return "Please choose a linked record for the selected relation.";
  }

  return null;
}

function canManageDocument(role: AppRole) {
  return role !== "shareholder" && role !== "supervisor";
}

export async function createDocumentAction(
  _prevState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const auth = await requireRouteAccess("documents");

  if (!canManageDocument(auth.role)) {
    return { error: "You do not have permission to upload documents." };
  }

  const values = parseDocumentFormData(formData);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError };
  }

  const file = formData.get("file");

  if (!(file instanceof File)) {
    return { error: "Please choose a file to upload." };
  }

  try {
    await createDocument(values, file, auth.profile.id);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The document could not be uploaded.",
    };
  }

  revalidatePath("/documents");
  redirect("/documents?toast=document-uploaded");
}

export async function updateDocumentAction(
  _prevState: DocumentActionState,
  formData: FormData,
): Promise<DocumentActionState> {
  const auth = await requireRouteAccess("documents");
  const documentId = getString(formData, "document_id");

  if (!documentId) {
    return { error: "Missing document identifier." };
  }

  if (!canManageDocument(auth.role)) {
    return { error: "You do not have permission to update documents." };
  }

  const values = parseDocumentFormData(formData);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError };
  }

  try {
    await updateDocument(documentId, values, auth.profile.id);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "The document could not be updated.",
    };
  }

  revalidatePath("/documents");
  redirect(`/documents?document=${documentId}&toast=document-updated`);
}

export async function toggleDocumentArchiveAction(formData: FormData) {
  const auth = await requireRouteAccess("documents");
  const documentId = getString(formData, "document_id");
  const nextState = getString(formData, "next_state");

  if (!documentId || !canManageDocument(auth.role)) {
    redirect("/documents?toast=document-action-error");
  }

  try {
    await setDocumentArchiveState(documentId, nextState === "archived", auth.profile.id);
  } catch {
    redirect("/documents?toast=document-action-error");
  }

  revalidatePath("/documents");
  redirect(`/documents?document=${documentId}&toast=${nextState === "archived" ? "document-archived" : "document-restored"}`);
}

export async function deleteDocumentAction(formData: FormData) {
  const auth = await requireRouteAccess("documents");
  const documentId = getString(formData, "document_id");

  if (!documentId || !canManageDocument(auth.role)) {
    redirect("/documents?toast=document-action-error");
  }

  const document = await getDocumentById(documentId, auth.role);

  if (!document) {
    redirect("/documents?toast=document-action-error");
  }

  try {
    await deleteDocument(document.id, auth.profile.id);
  } catch {
    redirect(`/documents?document=${document.id}&toast=document-action-error`);
  }

  revalidatePath("/documents");
  redirect("/documents?toast=document-deleted");
}
