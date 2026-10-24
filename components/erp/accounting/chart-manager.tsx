"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";

import {
  applyChartImportAction,
  completeChartAction,
  discardChartImportAction,
  exportChartAction,
  saveAccountAction,
  uploadChartAction,
  type ImportPreview,
} from "@/app/(app)/erp/accounting/actions";
import { ActionNotice, useAccountingAction } from "@/components/erp/accounting/action-notice";
import { downloadCsv } from "@/components/erp/accounting/csv-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ModernSelect } from "@/components/ui/modern-select";
import {
  accountKindLabels,
  accountingHref,
  chartTemplateLabels,
  dimensionLabels,
  formatAmount,
  type AccountKind,
  type ChartTemplate,
  type Dimension,
} from "@/lib/erp/accounting/model";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

type Row = {
  accountId: string;
  code: string;
  name: string;
  nameEn: string | null;
  kind: AccountKind;
  isPostable: boolean;
  active: boolean;
  isStatutory: boolean;
  isAuxiliary: boolean;
  dimension: Dimension;
  collectiveCode: string | null;
  debit: number;
  credit: number;
  balance: number;
  entries: number;
};
type View = "moving" | "unused" | "auxiliary" | "all";
type Editing = { accountId?: string; code: string; name: string; nameEn: string; kind: AccountKind; isPostable: boolean; active: boolean; dimension: Dimension; isStatutory: boolean };

const blank: Editing = { code: "", name: "", nameEn: "", kind: "expense", isPostable: true, active: true, dimension: "", isStatutory: false };

export function ChartManager({
  locale,
  entity,
  view,
  rows,
  summary,
  can,
}: {
  locale: Locale;
  entity: { code: string; name: string; template: ChartTemplate; codeLength: number };
  view: View;
  rows: Row[];
  summary: { accounts: number; postable: number };
  can: { settings: boolean; setUp: boolean };
}) {
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const { pending, notice, dismiss, run } = useAccountingAction();
  const [query, setQuery] = useState("");
  const [cls, setCls] = useState("");
  const [editing, setEditing] = useState<Editing | null>(null);
  const [template, setTemplate] = useState<ChartTemplate>(entity.template);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const q = query.trim().toLowerCase();
  const shown = rows.filter((r) => (!q || r.code.startsWith(q) || r.name.toLowerCase().includes(q)) && (!cls || r.code.startsWith(cls)));
  const classes = [...new Set(rows.map((r) => r.code[0]).filter((c) => /\d/.test(c)))].sort();
  const views: { key: View; fr: string; en: string }[] = [
    { key: "moving", fr: "Comptes mouvementés", en: "Accounts with entries" },
    { key: "unused", fr: "Non mouvementés", en: "Without entries" },
    { key: "auxiliary", fr: "Comptes auxiliaires", en: "Auxiliary accounts" },
    { key: "all", fr: "Tout le plan", en: "Whole chart" },
  ];

  const exportChart = () =>
    run(
      () => exportChartAction(entity.code),
      (result) => downloadCsv(`plan-comptable-${entity.code}.csv`, result.data ?? []),
    );

  const upload = (file: File | undefined) => {
    if (!file) return;
    const form = new FormData();
    form.set("entity", entity.code);
    form.set("file", file);
    run(() => uploadChartAction(form), (result) => setPreview(result.data ?? null));
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
        <div className="min-w-0">
          <p className="font-semibold">{chartTemplateLabels[entity.template][locale]}</p>
          <p className="text-sm text-muted-foreground">
            {tr(`${summary.accounts} comptes présentés sur ${entity.codeLength} chiffres · ${summary.postable} imputables`, `${summary.accounts} accounts on ${entity.codeLength} digits · ${summary.postable} postable`)}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {can.setUp ? (
            <>
              <ModernSelect name="template" className="w-64" value={template} onValueChange={(v) => setTemplate(v as ChartTemplate)} options={(Object.keys(chartTemplateLabels) as ChartTemplate[]).map((t) => ({ value: t, label: chartTemplateLabels[t][locale] }))} />
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => completeChartAction(entity.code, template))}>
                {tr("Compléter avec ce plan", "Complete with this chart")}
              </Button>
            </>
          ) : null}
          <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={exportChart}>
            {tr("Exporter (Excel)", "Export (Excel)")}
          </Button>
          {can.settings ? (
            <>
              <Button type="button" size="sm" disabled={pending} onClick={() => fileRef.current?.click()}>
                <Upload className="size-3.5" />
                {tr("Importer un fichier…", "Import a file…")}
              </Button>
              <input ref={fileRef} type="file" accept=".xlsx,.csv" className="hidden" aria-label={tr("Fichier du plan comptable", "Chart of accounts file")} onChange={(e) => upload(e.target.files?.[0])} />
              <Button type="button" size="sm" variant="secondary" onClick={() => setEditing(blank)}>
                {tr("Nouveau compte", "New account")}
              </Button>
            </>
          ) : null}
        </div>
        <p className="basis-full text-xs text-muted-foreground">
          {tr(
            "Exporter → compléter dans Excel → réimporter : les comptes existants sont mis à jour, les nouveaux créés, les anomalies bloquées avant toute écriture. Colonnes : Numéro, Intitulé, Intitulé (EN), Classe, Type, Imputable, Dimension, Actif.",
            "Export → complete in Excel → import again: existing accounts are updated, new ones created, problems blocked before anything is written. Columns: Numéro, Intitulé, Intitulé (EN), Classe, Type, Imputable, Dimension, Actif.",
          )}
        </p>
      </section>

      {preview ? (
        <section className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-semibold">{tr(`Contrôle de l'import · ${preview.fileName}`, `Import check · ${preview.fileName}`)}</h2>
            <Badge>{tr(`${preview.toCreate} à créer`, `${preview.toCreate} to create`)}</Badge>
            <Badge variant="secondary">{tr(`${preview.toUpdate} à modifier`, `${preview.toUpdate} to update`)}</Badge>
            <Badge variant="outline">{tr(`${preview.unchanged} inchangés`, `${preview.unchanged} unchanged`)}</Badge>
            <Badge variant={preview.errors.length ? "secondary" : "outline"} className={preview.errors.length ? "text-danger" : undefined}>
              {tr(`${preview.errors.length} erreur(s)`, `${preview.errors.length} error(s)`)}
            </Badge>
            <Badge variant="outline">{tr(`${preview.warnings.length} avertissement(s)`, `${preview.warnings.length} warning(s)`)}</Badge>
          </div>
          {[
            { list: preview.errors, title: tr("Erreurs bloquantes", "Blocking errors"), tone: "text-danger" },
            { list: preview.warnings, title: tr("Avertissements", "Warnings"), tone: "text-muted-foreground" },
          ].map(({ list, title, tone }) =>
            list.length ? (
              <div key={title} className="max-h-60 overflow-y-auto rounded-lg border border-border">
                <table className="min-w-full text-sm">
                  <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">{tr("Ligne", "Row")}</th>
                      <th className="px-3 py-2 text-left font-medium">{tr("Compte", "Account")}</th>
                      <th className="px-3 py-2 text-left font-medium">{title}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((item, i) => (
                      <tr key={i} className="border-t border-border/60">
                        <td className="px-3 py-1.5 font-mono text-xs">{item.line}</td>
                        <td className="px-3 py-1.5 font-mono text-xs">{item.code}</td>
                        <td className={cn("px-3 py-1.5", tone)}>{item.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null,
          )}
          {!preview.errors.length && preview.changes.length ? (
            <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
              <table className="min-w-full text-sm">
                <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">{tr("Action", "Action")}</th>
                    <th className="px-3 py-2 text-left font-medium">{tr("Compte", "Account")}</th>
                    <th className="px-3 py-2 text-left font-medium">{tr("Intitulé", "Name")}</th>
                    <th className="px-3 py-2 text-left font-medium">{tr("Nature", "Kind")}</th>
                    <th className="px-3 py-2 text-left font-medium">{tr("Imputable", "Postable")}</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.changes.map((c) => (
                    <tr key={c.line} className="border-t border-border/60">
                      <td className="px-3 py-1.5">{c.action === "create" ? tr("créer", "create") : tr("modifier", "update")}</td>
                      <td className="px-3 py-1.5 font-mono text-xs">{c.code}</td>
                      <td className="px-3 py-1.5">{c.name}</td>
                      <td className="px-3 py-1.5">{accountKindLabels[c.kind as AccountKind]?.[locale] ?? c.kind}</td>
                      <td className="px-3 py-1.5">{c.isPostable ? tr("oui", "yes") : tr("non", "no")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" disabled={pending} onClick={() => run(() => discardChartImportAction(entity.code, preview.importId), () => setPreview(null))}>
              {tr("Annuler", "Cancel")}
            </Button>
            <Button
              type="button"
              disabled={pending || preview.errors.length > 0 || preview.toCreate + preview.toUpdate === 0}
              onClick={() => run(() => applyChartImportAction(entity.code, preview.importId), () => setPreview(null))}
            >
              {tr(`Appliquer ${preview.toCreate + preview.toUpdate} changement(s)`, `Apply ${preview.toCreate + preview.toUpdate} change(s)`)}
            </Button>
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-soft)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
          {views.map((v) => (
            <Link
              key={v.key}
              href={accountingHref("/erp/accounting/chart", { entity: entity.code, view: v.key === "moving" ? null : v.key })}
              className={cn("rounded-lg px-3 py-1.5 text-sm font-medium", v.key === view ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground")}
            >
              {tr(v.fr, v.en)}
            </Link>
          ))}
          <Input className="ml-auto w-56" placeholder={tr("Filtrer par numéro ou intitulé", "Filter by number or name")} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={tr("Filtrer", "Filter")} />
          <ModernSelect name="class" className="w-36" value={cls} onValueChange={setCls} options={[{ value: "", label: tr("Toutes classes", "All classes") }, ...classes.map((c) => ({ value: c, label: tr(`Classe ${c}`, `Class ${c}`) }))]} />
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-border bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">{tr("Compte", "Account")}</th>
                <th className="px-4 py-3 font-medium">{tr("Intitulé", "Name")}</th>
                <th className="px-4 py-3 font-medium">{tr("Nature", "Kind")}</th>
                {view === "auxiliary" ? <th className="px-4 py-3 font-medium">{tr("Collectif", "Collective")}</th> : null}
                <th className="px-4 py-3 text-right font-medium">{tr("Débit", "Debit")}</th>
                <th className="px-4 py-3 text-right font-medium">{tr("Crédit", "Credit")}</th>
                <th className="px-4 py-3 text-right font-medium">{tr("Solde", "Balance")}</th>
              </tr>
            </thead>
            <tbody>
              {shown.length ? (
                shown.map((r) => {
                  const editable = can.settings && !r.isAuxiliary;
                  return (
                    <tr
                      key={r.accountId}
                      className={cn("border-b border-border/60 last:border-b-0", editable && "cursor-pointer hover:bg-muted/40", !r.active && "opacity-60")}
                      onClick={() => editable && setEditing({ accountId: r.accountId, code: r.code, name: r.name, nameEn: r.nameEn ?? "", kind: r.kind, isPostable: r.isPostable, active: r.active, dimension: r.dimension, isStatutory: r.isStatutory })}
                    >
                      <td className="px-4 py-2 font-mono">{r.code}</td>
                      <td className="px-4 py-2">
                        {r.name}
                        {r.nameEn ? <span className="text-xs text-muted-foreground"> · {r.nameEn}</span> : null}
                        {!r.active ? <span className="text-xs text-muted-foreground"> · {tr("inactif", "inactive")}</span> : null}
                        {!r.isPostable && !r.isStatutory ? <span className="text-xs text-muted-foreground"> · {tr("regroupement", "grouping")}</span> : null}
                        {r.isStatutory ? <span className="text-xs text-muted-foreground"> · {tr("racine", "root")}</span> : null}
                        {r.dimension ? <span className="text-xs text-muted-foreground"> · {dimensionLabels[r.dimension][locale]}</span> : null}
                      </td>
                      <td className="px-4 py-2">{accountKindLabels[r.kind][locale]}</td>
                      {view === "auxiliary" ? <td className="px-4 py-2 font-mono text-xs">{r.collectiveCode ?? "—"}</td> : null}
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{r.entries ? formatAmount(r.debit, locale, 0) : ""}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{r.entries ? formatAmount(r.credit, locale, 0) : ""}</td>
                      <td className="px-4 py-2 text-right font-mono tabular-nums">{r.entries ? formatAmount(r.balance, locale, 0) : ""}</td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {view === "moving" ? tr("Aucun compte mouvementé pour l'instant : voir « Tout le plan ».", "No account with entries yet: see “Whole chart”.") : tr("Aucun compte dans cette vue.", "No account in this view.")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <AccountDialog locale={locale} entityCode={entity.code} codeLength={entity.codeLength} editing={editing} onClose={() => setEditing(null)} run={run} pending={pending} />
      <ActionNotice notice={notice} onDismiss={dismiss} />
    </div>
  );
}

function AccountDialog({
  locale,
  entityCode,
  codeLength,
  editing,
  onClose,
  run,
  pending,
}: {
  locale: Locale;
  entityCode: string;
  codeLength: number;
  editing: Editing | null;
  onClose: () => void;
  run: ReturnType<typeof useAccountingAction>["run"];
  pending: boolean;
}) {
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  return (
    <Dialog open={editing !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{editing ? <AccountForm key={editing.accountId ?? "new"} locale={locale} entityCode={entityCode} codeLength={codeLength} initial={editing} onSaved={onClose} run={run} pending={pending} tr={tr} /> : null}</DialogContent>
    </Dialog>
  );
}

function AccountForm({
  locale,
  entityCode,
  codeLength,
  initial,
  onSaved,
  run,
  pending,
  tr,
}: {
  locale: Locale;
  entityCode: string;
  codeLength: number;
  initial: Editing;
  onSaved: () => void;
  run: ReturnType<typeof useAccountingAction>["run"];
  pending: boolean;
  tr: (fr: string, en: string) => string;
}) {
  const [value, setValue] = useState<Editing>(initial);
  const set = (patch: Partial<Editing>) => setValue((v) => ({ ...v, ...patch }));
  const isNew = !initial.accountId;
  return (
    <form
      className="grid gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => saveAccountAction(entityCode, { accountId: value.accountId, code: value.code, name: value.name, nameEn: value.nameEn, kind: value.kind, isPostable: value.isPostable, active: value.active, dimension: value.dimension }), onSaved);
      }}
    >
      <DialogHeader>
        <DialogTitle>{isNew ? tr("Nouveau compte", "New account") : tr(`Compte ${initial.code}`, `Account ${initial.code}`)}</DialogTitle>
        <DialogDescription>
          {isNew
            ? tr(`Un numéro court est présenté sur ${codeLength} chiffres (4100 → 410000). Un compte utilisé par des écritures se désactive, il ne se supprime pas.`, `A short number is presented on ${codeLength} digits (4100 → 410000). An account used by entries is deactivated, never deleted.`)
            : initial.isStatutory
              ? tr("Compte racine du référentiel : numéro et nature verrouillés, l'intitulé reste modifiable.", "Root account of the standard chart: number and kind are locked, the name stays editable.")
              : tr("Numéro fixe ; intitulé, nature, dimension et statut modifiables.", "Fixed number; name, kind, dimension and status can change.")}
        </DialogDescription>
      </DialogHeader>
      {isNew ? (
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{tr("Numéro (3 à 8 chiffres)", "Number (3 to 8 digits)")}</span>
          <Input className="font-mono" value={value.code} onChange={(e) => set({ code: e.target.value })} placeholder="7017121" required />
        </label>
      ) : null}
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">{tr("Intitulé", "Name")}</span>
        <Input value={value.name} onChange={(e) => set({ name: e.target.value })} required />
      </label>
      <label className="grid gap-1.5 text-sm">
        <span className="font-medium">{tr("Intitulé (EN)", "Name (EN)")}</span>
        <Input value={value.nameEn} onChange={(e) => set({ nameEn: e.target.value })} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{tr("Nature", "Kind")}</span>
          <ModernSelect name="kind" value={value.kind} disabled={initial.isStatutory} onValueChange={(k) => set({ kind: k as AccountKind })} options={(Object.keys(accountKindLabels) as AccountKind[]).map((k) => ({ value: k, label: accountKindLabels[k][locale] }))} />
        </label>
        <label className="grid gap-1.5 text-sm">
          <span className="font-medium">{tr("Dimension requise", "Required dimension")}</span>
          <ModernSelect
            name="dimension"
            value={value.dimension}
            onValueChange={(d) => set({ dimension: d as Dimension })}
            options={[{ value: "", label: tr("aucune", "none") }, ...(["customer", "supplier", "engagement"] as const).map((d) => ({ value: d, label: dimensionLabels[d][locale] }))]}
          />
        </label>
      </div>
      {!initial.isStatutory ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={value.isPostable} onChange={(e) => set({ isPostable: e.target.checked })} />
          {tr("Imputable (accepte des écritures)", "Postable (accepts entries)")}
        </label>
      ) : null}
      {!isNew ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={value.active} onChange={(e) => set({ active: e.target.checked })} />
          {tr("Actif (proposé dans les saisies)", "Active (offered when entering)")}
        </label>
      ) : null}
      <DialogFooter>
        <Button type="submit" disabled={pending || !value.name.trim() || (isNew && !value.code.trim())}>
          {isNew ? tr("Créer", "Create") : tr("Enregistrer", "Save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
