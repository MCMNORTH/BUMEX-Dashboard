import "server-only";

import type { ErpTransaction } from "@/lib/erp/db";
import { AccountingError } from "@/lib/erp/accounting/errors";
import { SETTINGS_ROLES, journalKindLabels, type JournalKind } from "@/lib/erp/accounting/model";
import type { Locale } from "@/lib/i18n/config";
import type { ErpRole } from "@/types/erp";

const say = (locale: Locale, fr: string, en: string) => (locale === "fr" ? fr : en);

export type JournalRow = { id: string; code: string; name: string; kind: JournalKind; posted: number; drafts: number; banks: number; loans: number };

export async function listJournalUsage(tx: ErpTransaction, entityId: string): Promise<JournalRow[]> {
  return tx.query<JournalRow>(
    `select j.id, j.code, j.name, j.kind::text as kind,
            (select count(*)::int from erp.journal_entry e where e.journal_id = j.id and e.status <> 'draft') as posted,
            (select count(*)::int from erp.journal_entry e where e.journal_id = j.id and e.status = 'draft') as drafts,
            (select count(*)::int from erp.bank_account b where b.journal_id = j.id) as banks,
            (select count(*)::int from erp.loan l where l.journal_id = j.id) as loans
       from erp.journal j where j.entity_id = $1 order by j.code`,
    [entityId],
  );
}

// Codes, names and kinds are free; a journal carrying posted entries keeps its kind and is never deleted
// (the database's journal_guard, 0003, says the same).
export async function saveJournal(tx: ErpTransaction, entityId: string, input: { journalId?: string; code: string; name: string; kind: JournalKind }, role: ErpRole, locale: Locale) {
  if (!SETTINGS_ROLES.includes(role)) {
    throw new AccountingError(say(locale, "Votre rôle ERP ne permet pas de paramétrer les journaux.", "Your ERP role cannot manage journals."));
  }
  const code = input.code.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,6}$/.test(code)) throw new AccountingError(say(locale, "Code de journal : 1 à 6 lettres ou chiffres.", "Journal code: 1 to 6 letters or digits."));
  if (!input.name.trim()) throw new AccountingError(say(locale, "L'intitulé est obligatoire.", "The name is required."));
  if (!(input.kind in journalKindLabels)) throw new AccountingError(say(locale, "Type de journal inconnu.", "Unknown journal kind."));
  const clash = await tx.query("select 1 from erp.journal where entity_id = $1 and code = $2 and id is distinct from $3::uuid", [entityId, code, input.journalId ?? null]);
  if (clash.length) throw new AccountingError(say(locale, `Le journal ${code} existe déjà.`, `Journal ${code} already exists.`));
  if (input.journalId) {
    const updated = await tx.query("update erp.journal set code = $3, name = $4, kind = $5::erp.journal_kind where id = $1 and entity_id = $2 returning id", [input.journalId, entityId, code, input.name.trim(), input.kind]);
    if (!updated.length) throw new AccountingError(say(locale, "Journal introuvable.", "Journal not found."));
  } else {
    await tx.query("insert into erp.journal (entity_id, code, name, kind) values ($1, $2, $3, $4::erp.journal_kind)", [entityId, code, input.name.trim(), input.kind]);
  }
}

export async function deleteJournal(tx: ErpTransaction, entityId: string, journalId: string, role: ErpRole, locale: Locale) {
  if (!SETTINGS_ROLES.includes(role)) {
    throw new AccountingError(say(locale, "Votre rôle ERP ne permet pas de supprimer un journal.", "Your ERP role cannot delete a journal."));
  }
  const deleted = await tx.query("delete from erp.journal where id = $1 and entity_id = $2 returning id", [journalId, entityId]);
  if (!deleted.length) throw new AccountingError(say(locale, "Journal introuvable.", "Journal not found."));
}
