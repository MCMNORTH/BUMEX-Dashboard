"use client";

import { useState } from "react";

import { setUpChartAction } from "@/app/(app)/erp/accounting/actions";
import { ActionNotice, useAccountingAction } from "@/components/erp/accounting/action-notice";
import { Button } from "@/components/ui/button";
import { ModernSelect } from "@/components/ui/modern-select";
import { chartTemplateLabels, type ChartTemplate } from "@/lib/erp/accounting/model";
import type { Locale } from "@/lib/i18n/config";

// First visit to an entity's accounting: choose the standard chart and the fiscal years to open.
export function SetupCard({
  locale,
  entity,
  canSetUp,
  year,
}: {
  locale: Locale;
  entity: { code: string; name: string; country: string; template: ChartTemplate };
  canSetUp: boolean;
  year: number;
}) {
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const [template, setTemplate] = useState<ChartTemplate>(entity.country === "MA" ? "CGNC" : entity.template === "SYSCOHADA" ? "SYSCOHADA" : "PCM");
  const [years, setYears] = useState<number[]>([year]);
  const { pending, notice, dismiss, run } = useAccountingAction();
  const toggle = (y: number) => setYears((ys) => (ys.includes(y) ? ys.filter((x) => x !== y) : [...ys, y].sort()));

  return (
    <section className="max-w-2xl space-y-5 rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-soft)]">
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">{tr(`Mettre en place la comptabilité de ${entity.name}`, `Set up ${entity.name}'s accounting`)}</h2>
        <p className="text-sm text-muted-foreground">
          {tr(
            "Le plan comptable du référentiel, ses codes taxe (TVA, retenues à la source), les comptes de paramétrage et les journaux (VT, AC, BQ, CA, OD, IM, CL) sont créés. Le plan complet se charge ensuite depuis Excel, dans l'onglet Plan comptable.",
            "The standard chart, its tax codes (VAT, withholding), the posting accounts and the journals (VT, AC, BQ, CA, OD, IM, CL) are created. The full chart is then loaded from Excel, in the Chart of accounts tab.",
          )}
        </p>
      </div>

      <label className="grid gap-1.5">
        <span className="text-sm font-medium">{tr("Référentiel", "Standard chart")}</span>
        <ModernSelect
          name="template"
          value={template}
          onValueChange={(value) => setTemplate(value as ChartTemplate)}
          options={(Object.keys(chartTemplateLabels) as ChartTemplate[]).map((t) => ({ value: t, label: chartTemplateLabels[t][locale] }))}
        />
      </label>

      <fieldset className="grid gap-2">
        <legend className="mb-1.5 text-sm font-medium">{tr("Exercices à ouvrir (12 périodes mensuelles chacun)", "Fiscal years to open (12 monthly periods each)")}</legend>
        {[year - 1, year, year + 1].map((y) => (
          <label key={y} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={years.includes(y)} onChange={() => toggle(y)} className="size-4 accent-[var(--primary)]" />
            {y}
          </label>
        ))}
      </fieldset>

      {canSetUp ? (
        <Button type="button" disabled={pending} onClick={() => run(() => setUpChartAction(entity.code, template, years))}>
          {pending ? tr("Mise en place…", "Setting up…") : tr("Mettre en place", "Set up")}
        </Button>
      ) : (
        <p className="text-sm text-muted-foreground">
          {tr("Un associé, le RAF ou l'administrateur ERP met en place la comptabilité de l'entité.", "A partner, the finance lead or the ERP administrator sets up the entity's accounting.")}
        </p>
      )}
      <ActionNotice notice={notice} onDismiss={dismiss} />
    </section>
  );
}
