"use client";

import { createYearAction, setPeriodStatusAction, setYearClosedAction } from "@/app/(app)/erp/accounting/actions";
import { ActionNotice, useAccountingAction } from "@/components/erp/accounting/action-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { periodStatusLabels, type PeriodStatus } from "@/lib/erp/accounting/model";
import type { Locale } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

type Period = { id: string; periodNo: number; start: string; status: PeriodStatus; drafts: number };
type Year = { id: string; label: string; isClosed: boolean; drafts: number; locked: number; periods: Period[] };

export function ClosingBoard({ locale, entityCode, years, can }: { locale: Locale; entityCode: string; years: Year[]; can: { post: boolean; lock: boolean; settings: boolean } }) {
  const tr = (fr: string, en: string) => (locale === "fr" ? fr : en);
  const { pending, notice, dismiss, run } = useAccountingAction();
  const labels = years.map((y) => Number(y.label));
  const next = labels.length ? Math.max(...labels) + 1 : new Date().getFullYear();
  const previous = labels.length ? Math.min(...labels) - 1 : new Date().getFullYear() - 1;
  const month = (iso: string) => new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", { month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4">
        {years.map((year) => (
          <section key={year.id} className="space-y-3 rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-soft)]">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-lg font-semibold">{tr(`Exercice ${year.label}`, `Fiscal year ${year.label}`)}</h2>
              <Badge variant={year.isClosed ? "secondary" : "default"}>{year.isClosed ? tr("Clôturé", "Closed") : tr("Ouvert", "Open")}</Badge>
              <span className="text-sm text-muted-foreground">
                {tr(`${year.drafts} brouillon(s) · ${year.locked}/12 périodes verrouillées`, `${year.drafts} draft(s) · ${year.locked}/12 periods locked`)}
              </span>
              {can.lock ? (
                <Button type="button" size="sm" variant="secondary" className="ml-auto" disabled={pending} onClick={() => run(() => setYearClosedAction(entityCode, year.id, !year.isClosed))}>
                  {year.isClosed ? tr("Rouvrir l'exercice", "Reopen the year") : tr("Clôturer l'exercice", "Close the year")}
                </Button>
              ) : null}
            </div>
            <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
              {year.periods.map((p) => (
                <div key={p.id} className={cn("space-y-2 rounded-lg border border-border p-2.5 text-xs", p.status === "locked" ? "bg-muted/60" : "bg-background")}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold capitalize">{month(p.start)}</span>
                    <span className={cn("rounded-full px-1.5 py-0.5", p.status === "open" ? "bg-success/15 text-success" : p.status === "soft_closed" ? "bg-warning/15 text-warning" : "bg-muted text-muted-foreground")}>
                      {periodStatusLabels[p.status][locale]}
                    </span>
                  </div>
                  <p className="text-muted-foreground">{tr(`${p.drafts} brouillon(s)`, `${p.drafts} draft(s)`)}</p>
                  {!year.isClosed ? (
                    <div className="flex flex-wrap gap-1">
                      {p.status !== "open" && (p.status !== "locked" || can.lock) && can.post ? (
                        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setPeriodStatusAction(entityCode, p.id, "open"))}>
                          {tr("Ouvrir", "Open")}
                        </Button>
                      ) : null}
                      {p.status === "open" && can.post ? (
                        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setPeriodStatusAction(entityCode, p.id, "soft_closed"))}>
                          {tr("Douce", "Soft")}
                        </Button>
                      ) : null}
                      {p.status !== "locked" && can.lock ? (
                        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => setPeriodStatusAction(entityCode, p.id, "locked"))}>
                          {tr("Verrouiller", "Lock")}
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <aside className="space-y-4">
        <section className="space-y-2 rounded-xl border border-border bg-card p-4 text-sm shadow-[var(--shadow-soft)]">
          <h2 className="font-semibold">{tr("Règles", "Rules")}</h2>
          <ul className="list-disc space-y-1.5 pl-5 text-muted-foreground">
            <li>{tr("Une écriture se comptabilise dans toute période ouverte, quel que soit le jour : les exercices passés se saisissent ici.", "An entry posts in any open period, whatever today's date: past years are keyed in here.")}</li>
            <li>{tr("Clôture douce : seuls les associés, le RAF et l'administrateur comptabilisent dans la période.", "Soft close: only partners, the finance lead and the administrator post in the period.")}</li>
            <li>{tr("Verrouiller une période : associé, RAF ou administrateur, et zéro brouillon.", "Locking a period: partner, finance lead or administrator, and no draft left.")}</li>
            <li>{tr("Clôturer un exercice : ses 12 périodes verrouillées, zéro brouillon. Le rouvrir est journalisé.", "Closing a year: all 12 periods locked, no draft. Reopening it is logged.")}</li>
            <li>{tr("Les numéros d'écriture sont continus par journal et par exercice ; la chaîne d'intégrité suit l'ordre de comptabilisation.", "Entry numbers run without gaps per journal and year; the integrity chain follows the posting order.")}</li>
          </ul>
        </section>
        {can.settings ? (
          <section className="space-y-3 rounded-xl border border-border bg-card p-4 text-sm shadow-[var(--shadow-soft)]">
            <h2 className="font-semibold">{tr("Exercices", "Fiscal years")}</h2>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => createYearAction(entityCode, previous))}>
                + {previous}
              </Button>
              <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(() => createYearAction(entityCode, next))}>
                + {next}
              </Button>
            </div>
          </section>
        ) : null}
      </aside>
      <ActionNotice notice={notice} onDismiss={dismiss} />
    </div>
  );
}
