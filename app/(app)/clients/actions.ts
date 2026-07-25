"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRouteAccess } from "@/lib/auth/server";
import { archiveClient, createClientRecord, getClientById, updateClient } from "@/lib/clients/service";
import type { AppRole } from "@/types/auth";
import type { ClientFormValues, ClientStatus, ClientType } from "@/types/client";

export type ClientActionState = {
  error?: string;
  values?: ClientFormValues;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseClientFormData(formData: FormData): ClientFormValues {
  return {
    name: getString(formData, "name"),
    legal_name: getString(formData, "legal_name"),
    type: getString(formData, "type") as ClientType,
    industry: getString(formData, "industry"),
    contact_email: getString(formData, "contact_email"),
    contact_phone: getString(formData, "contact_phone"),
    address: getString(formData, "address"),
    country: getString(formData, "country"),
    city: getString(formData, "city"),
    website: getString(formData, "website"),
    tax_id: getString(formData, "tax_id"),
    status: getString(formData, "status") as ClientStatus,
    account_manager_id: getString(formData, "account_manager_id"),
    notes: getString(formData, "notes"),
  };
}

function validate(values: ClientFormValues) {
  if (!values.name || !values.type || !values.status) {
    return "Client name, type, and status are required.";
  }

  if (values.contact_email) {
    try {
      const email = values.contact_email;

      if (!email.includes("@")) {
        return "Contact email must be valid.";
      }
    } catch {
      return "Contact email must be valid.";
    }
  }

  if (values.website) {
    try {
      const url = new URL(values.website);

      if (!["http:", "https:"].includes(url.protocol)) {
        return "Website must be a valid web address.";
      }
    } catch {
      return "Website must be a valid web address.";
    }
  }

  return null;
}

function canManageClient(accountManagerId: string, currentUserId: string, role: AppRole) {
  if (role === "admin") {
    return true;
  }

  return (role === "manager" || role === "employee") && accountManagerId === currentUserId;
}

function normalizeClientOwnership(values: ClientFormValues, currentUserId: string, role: AppRole): ClientFormValues {
  if ((role === "manager" || role === "employee") && !values.account_manager_id) {
    return {
      ...values,
      account_manager_id: currentUserId,
    };
  }

  return values;
}

function getClientMutationErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Unable to save client right now.";

  if (message.toLowerCase().includes("row-level security")) {
    return "This client cannot be saved with the current ownership settings. Choose an account manager or use your own manager profile.";
  }

  return message;
}

export async function createClientAction(
  _prevState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const auth = await requireRouteAccess("clients");

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    return { error: "You do not have permission to create clients.", values: parseClientFormData(formData) };
  }

  const values = normalizeClientOwnership(parseClientFormData(formData), auth.profile.id, auth.role);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError, values };
  }

  if (!canManageClient(values.account_manager_id, auth.profile.id, auth.role)) {
    return { error: "Managers and employees can only create clients assigned to themselves.", values };
  }

  try {
    await createClientRecord(values, auth.profile.id);
  } catch (error) {
    return { error: getClientMutationErrorMessage(error), values };
  }

  revalidatePath("/clients");
  redirect("/clients?toast=client-created");
}

export async function updateClientAction(
  _prevState: ClientActionState,
  formData: FormData,
): Promise<ClientActionState> {
  const auth = await requireRouteAccess("clients");
  const clientId = getString(formData, "client_id");

  if (!clientId) {
    return { error: "Missing client identifier.", values: parseClientFormData(formData) };
  }

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    return { error: "You do not have permission to edit clients.", values: parseClientFormData(formData) };
  }

  const values = normalizeClientOwnership(parseClientFormData(formData), auth.profile.id, auth.role);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError, values };
  }

  if (!canManageClient(values.account_manager_id, auth.profile.id, auth.role)) {
    return { error: "Managers and employees can only update clients assigned to themselves.", values };
  }

  try {
    await updateClient(clientId, values, auth.profile.id);
  } catch (error) {
    return { error: getClientMutationErrorMessage(error), values };
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  redirect(`/clients/${clientId}?toast=client-updated`);
}

export async function archiveClientAction(formData: FormData) {
  const auth = await requireRouteAccess("clients");
  const clientId = getString(formData, "client_id");

  if (!clientId) {
    redirect("/clients?toast=client-archive-error");
  }

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    redirect(`/clients/${clientId}?toast=client-archive-error`);
  }

  const client = await getClientById(clientId, auth.role);

  if (!client) {
    redirect("/clients?toast=client-archive-error");
  }

  if (!canManageClient(client.account_manager_id ?? "", auth.profile.id, auth.role)) {
    redirect(`/clients/${clientId}?toast=client-archive-error`);
  }

  await archiveClient(clientId, auth.profile.id);
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  redirect("/clients?toast=client-archived");
}
