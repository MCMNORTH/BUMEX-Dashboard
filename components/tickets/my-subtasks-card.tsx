import Link from "next/link";
import { ArrowRight, ListChecks } from "lucide-react";

import { getMySubtasks } from "@/lib/tickets/subtasks";
import { TicketDue } from "@/components/tickets/ticket-meta";
import { Card, CardContent } from "@/components/ui/card";

const VISIBLE_LIMIT = 8;

/** Open sub-tasks the viewer owns across tickets; renders nothing when there are none. */
export async function MySubtasksCard({ userId, locale }: { userId: string; locale: "en" | "fr" }) {
  // A failure here should not take down the rest of My Work.
  const subtasks = await getMySubtasks(userId).catch(() => []);

  if (!subtasks.length) {
    return null;
  }

  const isFr = locale === "fr";
  const hidden = subtasks.length - VISIBLE_LIMIT;

  return (
    <Card className="border-border/70 bg-card shadow-[var(--shadow-soft)]">
      <CardContent className="space-y-4 px-5 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">{isFr ? "Mes sous-tâches" : "My sub-tasks"}</p>
            <h3 className="mt-2 text-lg font-semibold tracking-tight">{isFr ? "Étapes qui vous sont confiées" : "Steps you own"}</h3>
          </div>
          <span className="text-sm font-medium tabular-nums text-muted-foreground">{subtasks.length}</span>
        </div>

        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border/65">
          {subtasks.slice(0, VISIBLE_LIMIT).map((subtask) => (
            <li key={subtask.id}>
              <Link
                href={`/tickets/${subtask.task_id}`}
                className="group flex min-w-0 items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
              >
                <ListChecks className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{subtask.title}</span>
                  <span className="block truncate text-xs text-muted-foreground">{subtask.task?.title}</span>
                </span>
                <TicketDue ticket={{ due_date: subtask.due_date, status: "todo" }} locale={locale} className="text-xs" />
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>

        {hidden > 0 ? (
          <p className="text-xs text-muted-foreground">
            {isFr ? `+ ${hidden} autre(s) sous-tâche(s) ouverte(s)` : `+ ${hidden} more open sub-task${hidden === 1 ? "" : "s"}`}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
