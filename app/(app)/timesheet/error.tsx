"use client";

import { Button } from "@/components/ui/button";
import { useI18n } from "@/components/layout/i18n-provider";

export default function TimesheetError({ reset }: { reset: () => void }) {
  const { locale } = useI18n();
  const fr = locale === "fr";
  return <div role="alert" className="space-y-4 rounded-xl border border-border bg-card p-6">
    <h1 className="text-xl font-semibold">{fr ? "Feuille de temps indisponible" : "Timesheet unavailable"}</h1>
    <p className="text-muted-foreground">{fr ? "Vos saisies n’ont pas pu être chargées. Réessayez dans un instant." : "Your entries could not be loaded. Please try again shortly."}</p>
    <Button onClick={reset}>{fr ? "Réessayer" : "Try again"}</Button>
  </div>;
}
