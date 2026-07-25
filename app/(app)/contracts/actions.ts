"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireRouteAccess } from "@/lib/auth/server";
import { getClientById } from "@/lib/clients/service";
import { archiveContract, createContract, getContractById, updateContract } from "@/lib/contracts/service";
import { getProjectById } from "@/lib/projects/service";
import type { AppRole } from "@/types/auth";
import type { ContractFormValues, ContractStatus, ContractType } from "@/types/contract";

export type ContractActionState = {
  error?: string;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function parseContractFormData(formData: FormData): ContractFormValues {
  return {
    title: getString(formData, "title"),
    contract_number: getString(formData, "contract_number"),
    client_id: getString(formData, "client_id"),
    project_id: getString(formData, "project_id"),
    status: getString(formData, "status") as ContractStatus,
    contract_type: getString(formData, "contract_type") as ContractType,
    start_date: getString(formData, "start_date"),
    end_date: getString(formData, "end_date"),
    signed_date: getString(formData, "signed_date"),
    renewal_date: getString(formData, "renewal_date"),
    amount: getString(formData, "amount"),
    currency: getString(formData, "currency"),
    payment_terms: getString(formData, "payment_terms"),
    responsible_user_id: getString(formData, "responsible_user_id"),
    notes: getString(formData, "notes"),
  };
}

function validate(values: ContractFormValues) {
  if (!values.title || !values.client_id || !values.status || !values.contract_type || !values.currency) {
    return "Title, client, status, contract type, and currency are required.";
  }

  if (values.amount && (Number.isNaN(Number(values.amount)) || Number(values.amount) < 0)) {
    return "Amount must be a valid positive number.";
  }

  if (values.start_date && values.end_date && values.end_date < values.start_date) {
    return "End date must be after start date.";
  }

  if (values.signed_date && values.start_date && values.signed_date > values.start_date) {
    return "Signed date should not be after the start date.";
  }

  return null;
}

async function canManageScope(
  role: AppRole,
  userId: string,
  clientId: string,
  projectId?: string | null,
  responsibleUserId?: string | null,
) {
  if (role === "admin") {
    return true;
  }

  if (role === "shareholder" || role === "supervisor") {
    return false;
  }

  const client = await getClientById(clientId, role);
  const project = projectId ? await getProjectById(projectId) : null;

  return (
    client?.account_manager_id === userId
    || project?.owner_id === userId
    || responsibleUserId === userId
  );
}

export async function createContractAction(
  _prevState: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  const auth = await requireRouteAccess("contracts");

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    return { error: "You do not have permission to create contracts." };
  }

  const values = parseContractFormData(formData);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError };
  }

  if (!(await canManageScope(auth.role, auth.profile.id, values.client_id, values.project_id || null))) {
    return { error: "Managers and employees can only create contracts for assigned clients or managed projects." };
  }

  await createContract(values, auth.profile.id);
  revalidatePath("/contracts");
  redirect("/contracts?toast=contract-created");
}

export async function updateContractAction(
  _prevState: ContractActionState,
  formData: FormData,
): Promise<ContractActionState> {
  const auth = await requireRouteAccess("contracts");
  const contractId = getString(formData, "contract_id");

  if (!contractId) {
    return { error: "Missing contract identifier." };
  }

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    return { error: "You do not have permission to edit contracts." };
  }

  const values = parseContractFormData(formData);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError };
  }

  const existingContract = await getContractById(contractId, auth.role);

  if (!existingContract) {
    return { error: "Contract not found." };
  }

  if (!(await canManageScope(
    auth.role,
    auth.profile.id,
    values.client_id,
    values.project_id || null,
    existingContract.responsible_user_id,
  ))) {
    return { error: "Managers and employees can only update contracts for assigned clients or managed projects." };
  }

  await updateContract(contractId, values, auth.profile.id);
  revalidatePath("/contracts");
  revalidatePath(`/contracts/${contractId}`);
  redirect(`/contracts/${contractId}?toast=contract-updated`);
}

export async function archiveContractAction(formData: FormData) {
  const auth = await requireRouteAccess("contracts");
  const contractId = getString(formData, "contract_id");

  if (!contractId) {
    redirect("/contracts?toast=contract-archive-error");
  }

  if (auth.role === "shareholder" || auth.role === "supervisor") {
    redirect(`/contracts/${contractId}?toast=contract-archive-error`);
  }

  const contract = await getContractById(contractId, auth.role);

  if (!contract) {
    redirect("/contracts?toast=contract-archive-error");
  }

  if (!(await canManageScope(
    auth.role,
    auth.profile.id,
    contract.client_id,
    contract.project_id,
    contract.responsible_user_id,
  ))) {
    redirect(`/contracts/${contractId}?toast=contract-archive-error`);
  }

  await archiveContract(contractId, auth.profile.id);
  revalidatePath("/contracts");
  revalidatePath(`/contracts/${contractId}`);
  redirect("/contracts?toast=contract-archived");
}
