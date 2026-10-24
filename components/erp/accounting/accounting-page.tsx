import Link from "next/link";
import type { ReactNode } from "react";

import { AccountingHeader, type AccountingTab } from "@/components/erp/accounting/accounting-header";
import { SetupCard } from "@/components/erp/accounting/setup-card";
import type { AccountingContext } from "@/lib/erp/accounting/context";
import { accountingHref } from "@/lib/erp/accounting/model";

// Header, then the page — or what has to happen first: the entity's chart, then a fiscal year.
export function AccountingPage({ ctx, tab, children, needsYear = true }: { ctx: AccountingContext; tab: AccountingTab | null; children: ReactNode; needsYear?: boolean }) {
  const tr = (fr: string, en: string) => (ctx.locale === "fr" ? fr : en);

  if (!ctx.entity) {
    return <p className="text-sm text-muted-foreground">{tr("Aucune entité ne vous est ouverte dans l'ERP.", "No entity is open to you in the ERP.")}</p>;
  }

  const header = (
    <AccountingHeader
      locale={ctx.locale}
      entities={ctx.entities.map((e) => ({ code: e.code, name: e.name }))}
      entityCode={ctx.entity.code}
      fiscalYears={ctx.fiscalYears.map((f) => f.label)}
      fiscalYear={ctx.fiscalYear?.label ?? null}
      tab={tab}
      hideTabs={!ctx.hasChart}
    />
  );

  if (!ctx.hasChart) {
    return (
      <div className="space-y-6">
        {header}
        <SetupCard locale={ctx.locale} entity={{ code: ctx.entity.code, name: ctx.entity.name, country: ctx.entity.country, template: ctx.entity.chartTemplate }} canSetUp={ctx.can.setUp} year={Number(ctx.today.slice(0, 4))} />
      </div>
    );
  }

  if (needsYear && !ctx.fiscalYear) {
    return (
      <div className="space-y-6">
        {header}
        <div className="rounded-xl border border-border bg-card p-5 text-sm shadow-[var(--shadow-soft)]">
          {tr("Aucun exercice pour cette entité. ", "No fiscal year for this entity. ")}
          <Link className="font-medium text-primary underline-offset-4 hover:underline" href={accountingHref("/erp/accounting/closing", { entity: ctx.entity.code })}>
            {tr("Créer un exercice", "Create a fiscal year")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {header}
      {children}
    </div>
  );
}
