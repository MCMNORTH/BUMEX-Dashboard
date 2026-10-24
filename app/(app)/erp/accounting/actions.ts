"use server";

import { revalidatePath } from "next/cache";

import { applyImport, discardImport, exportChart, readChartFile, saveAccount, stageImport, validateImport, type AccountInput } from "@/lib/erp/accounting/chart";
import { createYear, setPeriodStatus, setYearClosed } from "@/lib/erp/accounting/closing";
import { entityByCode } from "@/lib/erp/accounting/context";
import { deleteDraft, postEntry, reverseEntry, saveDraft } from "@/lib/erp/accounting/entries";
import { AccountingError, accountingErrorMessage } from "@/lib/erp/accounting/errors";
import { deleteJournal, saveJournal } from "@/lib/erp/accounting/journals";
import { PARTNER_ROLES, type ActionResult, type ChartTemplate, type EntryInput, type ErpEntity, type JournalKind, type PeriodStatus } from "@/lib/erp/accounting/model";
import { applyChartTemplate } from "@/lib/erp/accounting/setup";
import { withErpSession, type ErpTransaction } from "@/lib/erp/db";
import { requireErpAccess } from "@/lib/erp/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import type { Locale } from "@/lib/i18n/config";
import type { ErpRole } from "@/types/erp";

type Work<T> = (tx: ErpTransaction, entity: ErpEntity, role: ErpRole, locale: Locale) => Promise<T>;

const say = (locale: Locale, fr: string, en: string) => (locale === "fr" ? fr : en);
const failed = { fr: "L'opération n'a pas abouti.", en: "The operation did not go through." };

// Access, entity and one transaction in the person's ERP session; refusals come back as sentences.
async function run<T>(entityCode: string, work: Work<T>, message: (result: T, locale: Locale) => string): Promise<ActionResult<T>> {
  const { auth, access } = await requireErpAccess("accounting");
  const locale = await getCurrentLocale();
  try {
    const result = await withErpSession(auth.profile.id, async (tx) => {
      const entity = await entityByCode(tx, entityCode);
      if (!entity) throw new AccountingError(say(locale, "Entité inaccessible.", "Entity not available."));
      return work(tx, entity, access.role, locale);
    });
    revalidatePath("/erp", "layout");
    return { ok: true, message: message(result, locale), data: result };
  } catch (error) {
    return { ok: false, error: accountingErrorMessage(error, locale, failed) };
  }
}

async function entryOf(tx: ErpTransaction, entryId: string, entityId: string, locale: Locale) {
  const found = await tx.query("select 1 from erp.journal_entry where id = $1 and entity_id = $2", [entryId, entityId]);
  if (!found.length) throw new AccountingError(say(locale, "Écriture introuvable.", "Entry not found."));
}

// ---- setup -----------------------------------------------------------------------------------------------------

export async function setUpChartAction(entityCode: string, template: ChartTemplate, years: number[]) {
  return run(
    entityCode,
    async (tx, entity, role, locale) => {
      if (!PARTNER_ROLES.includes(role)) throw new AccountingError(say(locale, "Mettre en place le plan comptable : associés, RAF et administrateur.", "Setting up the chart: partners, finance lead and administrator."));
      return applyChartTemplate(tx, entity, template, years.filter((y) => Number.isInteger(y)).slice(0, 5));
    },
    (s, locale) => say(locale, `Plan comptable en place · ${s.accounts} comptes, ${s.journals} journaux, ${s.taxCodes} codes taxe, ${s.fiscalYears} exercice(s).`, `Chart set up · ${s.accounts} accounts, ${s.journals} journals, ${s.taxCodes} tax codes, ${s.fiscalYears} fiscal year(s).`),
  );
}

export async function completeChartAction(entityCode: string, template: ChartTemplate) {
  return run(
    entityCode,
    async (tx, entity, role, locale) => {
      if (!PARTNER_ROLES.includes(role)) throw new AccountingError(say(locale, "Compléter le plan : associés, RAF et administrateur.", "Completing the chart: partners, finance lead and administrator."));
      return applyChartTemplate(tx, entity, template, []);
    },
    (s, locale) => say(locale, `${s.accounts} compte(s) ajouté(s) depuis le modèle.`, `${s.accounts} account(s) added from the template.`),
  );
}

// ---- entries ---------------------------------------------------------------------------------------------------

export async function saveEntryAction(input: EntryInput, post: boolean) {
  return run(
    input.entityCode,
    async (tx, entity, role, locale) => {
      const entryId = await saveDraft(tx, entity, input, locale);
      const posted = post ? await postEntry(tx, entryId, role, locale) : null;
      return { entryId, posted };
    },
    (r, locale) =>
      r.posted
        ? say(locale, `Comptabilisée · ${r.posted.journalCode} n° ${r.posted.entryNo}`, `Posted · ${r.posted.journalCode} no. ${r.posted.entryNo}`)
        : say(locale, "Brouillon enregistré.", "Draft saved."),
  );
}

export async function postDraftAction(entityCode: string, entryId: string) {
  return run(
    entityCode,
    async (tx, entity, role, locale) => {
      await entryOf(tx, entryId, entity.id, locale);
      return postEntry(tx, entryId, role, locale);
    },
    (p, locale) => say(locale, `Comptabilisée · ${p.journalCode} n° ${p.entryNo}`, `Posted · ${p.journalCode} no. ${p.entryNo}`),
  );
}

export async function deleteDraftAction(entityCode: string, entryId: string) {
  return run(
    entityCode,
    async (tx, entity, _role, locale) => {
      await entryOf(tx, entryId, entity.id, locale);
      await deleteDraft(tx, entryId, locale);
    },
    (_r, locale) => say(locale, "Brouillon supprimé.", "Draft deleted."),
  );
}

export async function reverseEntryAction(entityCode: string, entryId: string, date: string, reason: string) {
  return run(
    entityCode,
    async (tx, entity, role, locale) => {
      await entryOf(tx, entryId, entity.id, locale);
      return reverseEntry(tx, entryId, date, reason, role, locale);
    },
    (p, locale) => say(locale, `Extournée · ${p.journalCode} n° ${p.entryNo}`, `Reversed · ${p.journalCode} no. ${p.entryNo}`),
  );
}

// ---- closing ---------------------------------------------------------------------------------------------------

export async function setPeriodStatusAction(entityCode: string, periodId: string, status: PeriodStatus) {
  return run(
    entityCode,
    (tx, entity, role, locale) => setPeriodStatus(tx, entity.id, periodId, status, role, locale),
    (_r, locale) => say(locale, "Période mise à jour.", "Period updated."),
  );
}

export async function setYearClosedAction(entityCode: string, yearId: string, closed: boolean) {
  return run(
    entityCode,
    (tx, entity, role, locale) => setYearClosed(tx, entity.id, yearId, closed, role, locale),
    (_r, locale) => (closed ? say(locale, "Exercice clôturé.", "Fiscal year closed.") : say(locale, "Exercice rouvert.", "Fiscal year reopened.")),
  );
}

export async function createYearAction(entityCode: string, year: number) {
  return run(
    entityCode,
    (tx, entity, role, locale) => createYear(tx, entity.id, year, role, locale),
    (_r, locale) => say(locale, `Exercice ${year} créé avec ses 12 périodes.`, `Fiscal year ${year} created with its 12 periods.`),
  );
}

// ---- chart -----------------------------------------------------------------------------------------------------

export async function saveAccountAction(entityCode: string, input: AccountInput) {
  return run(
    entityCode,
    (tx, entity, role, locale) => saveAccount(tx, entity, input, role, locale),
    (_r, locale) => (input.accountId ? say(locale, "Compte modifié.", "Account updated.") : say(locale, "Compte créé.", "Account created.")),
  );
}

export async function exportChartAction(entityCode: string) {
  return run(entityCode, (tx, entity) => exportChart(tx, entity.id), (_r, locale) => say(locale, "Plan exporté.", "Chart exported."));
}

export type ImportPreview = {
  importId: string;
  fileName: string;
  toCreate: number;
  toUpdate: number;
  unchanged: number;
  errors: { line: number; code: string; message: string }[];
  warnings: { line: number; code: string; message: string }[];
  changes: { line: number; action: "create" | "update"; code: string; name: string; kind: string; isPostable: boolean; active: boolean }[];
};

export async function uploadChartAction(formData: FormData) {
  const entityCode = String(formData.get("entity") ?? "");
  const file = formData.get("file");
  return run<ImportPreview>(
    entityCode,
    async (tx, entity, _role, locale) => {
      if (!(file instanceof File) || !file.size) throw new AccountingError(say(locale, "Choisissez un fichier.", "Choose a file."));
      const rows = await readChartFile(file, locale);
      const report = await validateImport(tx, entity, rows);
      const importId = await stageImport(tx, entity, file.name, rows, report);
      return {
        importId,
        fileName: file.name,
        toCreate: report.toCreate,
        toUpdate: report.toUpdate,
        unchanged: report.unchanged,
        errors: report.errors.slice(0, 200),
        warnings: report.warnings.slice(0, 200),
        changes: report.rows
          .filter((r) => r.action !== "unchanged")
          .slice(0, 200)
          .map((r) => ({ line: r.line, action: r.action as "create" | "update", code: r.code, name: r.nameFr, kind: r.kind, isPostable: r.isPostable, active: r.active })),
      };
    },
    (p, locale) => say(locale, `Fichier contrôlé · ${p.toCreate} à créer, ${p.toUpdate} à modifier, ${p.errors.length} erreur(s).`, `File checked · ${p.toCreate} to create, ${p.toUpdate} to update, ${p.errors.length} error(s).`),
  );
}

export async function applyChartImportAction(entityCode: string, importId: string) {
  return run(
    entityCode,
    (tx, entity, role, locale) => applyImport(tx, entity, importId, role, locale),
    (r, locale) => say(locale, `Plan importé · ${r.created} créé(s), ${r.updated} mis à jour.`, `Chart imported · ${r.created} created, ${r.updated} updated.`),
  );
}

export async function discardChartImportAction(entityCode: string, importId: string) {
  return run(entityCode, (tx, entity) => discardImport(tx, entity.id, importId), (_r, locale) => say(locale, "Import abandonné.", "Import discarded."));
}

// ---- journals --------------------------------------------------------------------------------------------------

export async function saveJournalAction(entityCode: string, input: { journalId?: string; code: string; name: string; kind: JournalKind }) {
  return run(
    entityCode,
    (tx, entity, role, locale) => saveJournal(tx, entity.id, input, role, locale),
    (_r, locale) => (input.journalId ? say(locale, "Journal modifié.", "Journal updated.") : say(locale, "Journal créé.", "Journal created.")),
  );
}

export async function deleteJournalAction(entityCode: string, journalId: string) {
  return run(
    entityCode,
    (tx, entity, role, locale) => deleteJournal(tx, entity.id, journalId, role, locale),
    (_r, locale) => say(locale, "Journal supprimé.", "Journal deleted."),
  );
}
