"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ModernSelect } from "@/components/ui/modern-select";
import { accountingHref } from "@/lib/erp/accounting/model";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

export type AccountingTab = "entries" | "new" | "ledger" | "trial-balance" | "closing" | "chart" | "journals" | "integrity";

const tabs: { key: AccountingTab; path: string; fr: string; en: string }[] = [
  { key: "entries", path: "/erp/accounting", fr: "Écritures", en: "Entries" },
  { key: "new", path: "/erp/accounting/new", fr: "Nouvelle écriture", en: "New entry" },
  { key: "ledger", path: "/erp/accounting/ledger", fr: "Grand livre", en: "General ledger" },
  { key: "trial-balance", path: "/erp/accounting/trial-balance", fr: "Balance", en: "Trial balance" },
  { key: "closing", path: "/erp/accounting/closing", fr: "Clôture", en: "Closing" },
  { key: "chart", path: "/erp/accounting/chart", fr: "Plan comptable", en: "Chart of accounts" },
  { key: "journals", path: "/erp/accounting/journals", fr: "Journaux", en: "Journals" },
  { key: "integrity", path: "/erp/accounting/integrity", fr: "Intégrité", en: "Integrity" },
];

export function AccountingHeader({
  locale,
  entities,
  entityCode,
  fiscalYears,
  fiscalYear,
  tab,
  hideTabs = false,
}: {
  locale: Locale;
  entities: { code: string; name: string }[];
  entityCode: string;
  fiscalYears: string[];
  fiscalYear: string | null;
  tab: AccountingTab | null;
  hideTabs?: boolean;
}) {
  const router = useRouter();
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const current = tabs.find((t) => t.key === tab) ?? tabs[0];
  const entityName = entities.find((e) => e.code === entityCode)?.name ?? entityCode;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">BUMEX ERP</p>
          <h1 className="text-2xl font-semibold tracking-tight">
            {tr("Comptabilité", "Accounting")} · {entityName}
          </h1>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {entities.length > 1 ? (
            <label className="grid gap-1 text-xs text-muted-foreground">
              {tr("Entité", "Entity")}
              <ModernSelect
                name="entity"
                value={entityCode}
                className="w-56"
                searchable
                onValueChange={(code) => router.push(accountingHref(current.path, { entity: code }))}
                options={entities.map((e) => ({ value: e.code, label: e.name }))}
              />
            </label>
          ) : null}
          {fiscalYears.length ? (
            <label className="grid gap-1 text-xs text-muted-foreground">
              {tr("Exercice", "Fiscal year")}
              <ModernSelect
                name="fy"
                value={fiscalYear ?? ""}
                className="w-32"
                onValueChange={(label) => router.push(accountingHref(current.path, { entity: entityCode, fy: label }))}
                options={fiscalYears.map((label) => ({ value: label, label }))}
              />
            </label>
          ) : null}
        </div>
      </div>
      {hideTabs ? null : (
        <nav aria-label={tr("Comptabilité", "Accounting")} className="flex gap-1 overflow-x-auto rounded-xl border border-border bg-card p-1">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={accountingHref(t.path, { entity: entityCode, fy: fiscalYear })}
              aria-current={t.key === tab ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                t.key === tab ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {tr(t.fr, t.en)}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
