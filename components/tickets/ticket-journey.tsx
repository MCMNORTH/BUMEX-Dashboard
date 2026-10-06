import { Check } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { TicketStatus } from "@/types/ticket";

const steps: Array<{ key: TicketStatus; fr: string; en: string }> = [
  { key: "backlog", fr: "En attente", en: "Backlog" },
  { key: "todo", fr: "À faire", en: "To do" },
  { key: "in_progress", fr: "En cours", en: "In progress" },
  { key: "review", fr: "En révision", en: "Review" },
  { key: "done", fr: "Terminé", en: "Done" },
];

/** The ticket's place in the workflow, as steps joined by a progress bar. */
export function TicketJourney({ status, isFr }: { status: TicketStatus; isFr: boolean }) {
  const tr = (fr: string, en: string) => (isFr ? fr : en);
  const blocked = status === "blocked";
  // A blocked ticket stays "in progress" on the track; archived counts as done.
  const current = blocked ? "in_progress" : status === "archived" ? "done" : status;
  const currentIndex = steps.findIndex((step) => step.key === current);
  const finished = current === "done";

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{tr("Parcours du ticket", "Ticket journey")}</h2>
            <p className="text-xs text-muted-foreground">
              {blocked
                ? tr("Progression interrompue par un blocage", "Progress interrupted by a blocker")
                : tr("Où en est la demande", "Where the request stands")}
            </p>
          </div>
          {blocked ? (
            <span className="rounded-md bg-danger/10 px-2 py-1 text-xs font-medium text-danger">
              {tr("Action requise", "Action required")}
            </span>
          ) : null}
        </div>

        <ol className="relative isolate mt-5 grid grid-cols-5">
          {steps.map((step, index) => {
            const done = index < currentIndex || finished;
            const active = index === currentIndex && !finished;
            const label = tr(step.fr, step.en);

            return (
              <li key={step.key} className="relative flex flex-col items-center text-center" aria-current={active ? "step" : undefined}>
                {index < steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-[14px] left-[calc(50%+1.125rem)] h-1 w-[calc(100%-2.25rem)] rounded-full",
                      index < currentIndex || finished ? "bg-success" : "bg-muted-foreground/20",
                    )}
                  />
                ) : null}
                <span
                  className={cn(
                    "relative z-10 grid size-8 place-items-center rounded-full border-2 text-xs font-semibold",
                    done && "border-success bg-success text-white",
                    active && (blocked ? "border-danger bg-danger text-white ring-4 ring-danger/15" : "border-primary bg-primary text-primary-foreground ring-4 ring-primary/15"),
                    !done && !active && "border-border bg-card text-muted-foreground",
                  )}
                >
                  {done ? <Check className="size-4" strokeWidth={3} aria-hidden="true" /> : index + 1}
                </span>
                <span
                  className={cn(
                    "mt-2 text-xs font-medium",
                    active ? (blocked ? "text-danger" : "text-primary") : done ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {label}
                  {done ? <span className="sr-only"> ({tr("terminé", "completed")})</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
      </CardContent>
    </Card>
  );
}
