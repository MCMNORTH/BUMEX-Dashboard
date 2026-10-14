import { Check } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { findStage, getActiveStages, getLegacyWorkflow, sortStages } from "@/lib/tickets/workflow";
import { cn } from "@/lib/utils";
import type { TicketRecord } from "@/types/ticket";
import type { BoardWorkflow } from "@/types/workflow";

/** The ticket's place on its board, as the board's stages joined by a progress bar. */
export function TicketJourney({
  ticket,
  workflow: boardWorkflow,
  isFr,
}: {
  ticket: Pick<TicketRecord, "project_id" | "stage_id" | "status">;
  workflow?: BoardWorkflow;
  isFr: boolean;
}) {
  const tr = (fr: string, en: string) => (isFr ? fr : en);
  const workflow = boardWorkflow ?? getLegacyWorkflow(ticket.project_id, isFr ? "fr" : "en");
  const stage = findStage(workflow, ticket.stage_id);
  // "Blocked" stages interrupt progress rather than being a step of it, so they stay off the track.
  const steps = getActiveStages(workflow).filter((step) => step.is_completed || step.category !== "blocked");
  const blocked = Boolean(stage && !stage.is_completed && stage.category === "blocked");
  const anchor = blocked
    ? [...sortStages(steps)].reverse().find((step) => step.position < stage!.position) ?? steps[0]
    : stage;
  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === anchor?.id));
  const finished = Boolean(stage?.is_completed);
  const archived = ticket.status === "archived";

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{tr("Parcours du ticket", "Ticket journey")}</h2>
            <p className="text-xs text-muted-foreground">
              {blocked
                ? tr(`Progression interrompue : ${stage!.name}`, `Progress interrupted: ${stage!.name}`)
                : archived
                  ? tr("Ticket archivé, hors du tableau", "Archived ticket, off the board")
                  : tr("Où en est la demande", "Where the request stands")}
            </p>
          </div>
          {blocked ? (
            <span className="rounded-md bg-danger/10 px-2 py-1 text-xs font-medium text-danger">
              {tr("Action requise", "Action required")}
            </span>
          ) : null}
        </div>

        <ol
          className="relative isolate mt-5 grid"
          style={{ gridTemplateColumns: `repeat(${Math.max(steps.length, 1)}, minmax(0, 1fr))` }}
        >
          {steps.map((step, index) => {
            const done = index < currentIndex || (finished && index === currentIndex);
            const active = index === currentIndex && !finished;

            return (
              <li key={step.id} className="relative flex min-w-0 flex-col items-center text-center" aria-current={active ? "step" : undefined}>
                {index < steps.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute top-[14px] left-[calc(50%+1.125rem)] h-1 w-[calc(100%-2.25rem)] rounded-full",
                      index < currentIndex ? "bg-success" : "bg-muted-foreground/20",
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
                    "mt-2 max-w-full break-words px-1 text-xs font-medium",
                    active ? (blocked ? "text-danger" : "text-primary") : done ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {step.name}
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
