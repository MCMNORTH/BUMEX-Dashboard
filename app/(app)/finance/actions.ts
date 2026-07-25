"use server";

import { refresh, revalidatePath } from "next/cache";

import { requireRouteAccess } from "@/lib/auth/server";
import { createBankStatement } from "@/lib/finance/service";
import type { BankStatementFormValues } from "@/types/finance";

export type BankStatementActionState = {
  error?: string;
  success?: string;
};

function getString(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

async function getStatementFileContent(formData: FormData) {
  const file = formData.get("statement_file");

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choisis un fichier de relevé bancaire." } as const;
  }

  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".txt") && !lowerName.endsWith(".csv")) {
    return { error: "Utilise un fichier .txt ou .csv pour le relevé bancaire." } as const;
  }

  const rawContent = (await file.text()).trim();
  if (!rawContent) {
    return { error: "Le fichier sélectionné est vide." } as const;
  }

  return {
    rawContent,
    fileName: file.name,
  } as const;
}

function parseBankStatementFormData(formData: FormData, rawContent: string, fileName: string): BankStatementFormValues {
  return {
    account_label: getString(formData, "account_label"),
    statement_label: getString(formData, "statement_label") || fileName,
    statement_date: getString(formData, "statement_date"),
    currency: getString(formData, "currency"),
    raw_content: rawContent,
    notes: getString(formData, "notes"),
  };
}

function validate(values: BankStatementFormValues) {
  if (!values.account_label || !values.statement_label || !values.statement_date || !values.currency || !values.raw_content) {
    return "Compte, libellé, date, devise et lignes du relevé sont requis.";
  }

  if (values.raw_content.split(/\r?\n/).filter((line) => line.trim()).length === 0) {
    return "Ajoute au moins une ligne exploitable dans le relevé.";
  }

  return null;
}

export async function createBankStatementAction(
  _prevState: BankStatementActionState,
  formData: FormData,
): Promise<BankStatementActionState> {
  const auth = await requireRouteAccess("finance");

  if (auth.role === "shareholder") {
    return { error: "You do not have permission to import bank statements." };
  }
  const filePayload = await getStatementFileContent(formData);

  if ("error" in filePayload) {
    return { error: filePayload.error };
  }

  const values = parseBankStatementFormData(formData, filePayload.rawContent, filePayload.fileName);
  const validationError = validate(values);

  if (validationError) {
    return { error: validationError };
  }

  try {
    await createBankStatement(values, auth.profile.id);
    revalidatePath("/finance");
    revalidatePath("/finance/invoices");
    revalidatePath("/finance/payments");
    revalidatePath("/finance/transfers");
    refresh();

    return {
      success: "Relevé importé et rapprochement lancé.",
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Le relevé n'a pas pu être importé.",
    };
  }
}
