"use client";

import { useEffect } from "react";
import { RotateCcw, TriangleAlert } from "lucide-react";

import { useI18n } from "@/components/layout/i18n-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export type ModuleErrorKey =
  | "section"
  | "tickets"
  | "projects"
  | "myWork"
  | "planning"
  | "calendar"
  | "roadmap"
  | "staffing"
  | "timesheet";

const englishTitles: Record<ModuleErrorKey, string> = {
  section: "This page couldn’t be loaded",
  tickets: "Tickets couldn’t be loaded",
  projects: "Projects couldn’t be loaded",
  myWork: "My Work couldn’t be loaded",
  planning: "Planning couldn’t be loaded",
  calendar: "The calendar couldn’t be loaded",
  roadmap: "The roadmap couldn’t be loaded",
  staffing: "Staffing couldn’t be loaded",
  timesheet: "Your timesheet couldn’t be loaded",
};

/** The one error panel used by every route's error boundary, in the user's language. */
export function ModuleError({
  module,
  error,
  retry,
}: {
  module: ModuleErrorKey;
  error?: Error & { digest?: string };
  retry: () => void;
}) {
  const { t } = useI18n();

  useEffect(() => {
    if (error) {
      console.error(error);
    }
  }, [error]);

  return (
    <Card role="alert">
      <CardContent className="flex flex-col items-center gap-4 px-6 py-12 text-center">
        <div className="flex size-12 items-center justify-center rounded-xl bg-danger/10 text-danger">
          <TriangleAlert className="size-6" />
        </div>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold">{t(`errors.modules.${module}`, englishTitles[module])}</h2>
          <p className="max-w-xl text-sm text-muted-foreground">
            {t("errors.description", "Something went wrong while loading this page. Try again; if it keeps happening, contact an administrator.")}
          </p>
          {error?.digest ? (
            <p className="text-xs text-muted-foreground">
              {t("errors.reference", "Reference")}: <span className="font-mono">{error.digest}</span>
            </p>
          ) : null}
        </div>
        <Button onClick={() => retry()}>
          <RotateCcw />
          {t("errors.retry", "Try again")}
        </Button>
      </CardContent>
    </Card>
  );
}
