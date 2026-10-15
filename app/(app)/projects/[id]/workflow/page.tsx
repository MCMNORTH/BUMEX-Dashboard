import Link from "next/link";
import { notFound } from "next/navigation";
import { SquareKanban } from "lucide-react";

import { requireRouteAccess } from "@/lib/auth/server";
import { getCurrentLocale } from "@/lib/i18n/server";
import { getProjectById } from "@/lib/projects/service";
import { canManageBoard } from "@/lib/tickets/board-access";
import { countCardsByStage, getProjectTicketStages } from "@/lib/tickets/service";
import { getBoardWorkflow } from "@/lib/tickets/workflow-service";
import { WorkflowSettings } from "@/components/projects/workflow-settings";
import { Button } from "@/components/ui/button";
import { PageRefresh } from "@/components/layout/page-refresh";

// Board settings: cached for 5 minutes; saving them refreshes the page.
export const unstable_dynamicStaleTime = 300;

export default async function ProjectWorkflowPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const auth = await requireRouteAccess("projects");
  const isFr = (await getCurrentLocale()) === "fr";
  const { id } = await params;
  const project = await getProjectById(id);

  if (!project) {
    notFound();
  }

  const [workflow, canManage, ticketStages] = await Promise.all([
    getBoardWorkflow(id),
    canManageBoard(auth.role, auth.profile.id, id),
    getProjectTicketStages(id),
  ]);

  return (
    <div className="space-y-4">
      <PageRefresh tables={["project_workflows", "tasks"]} live="off" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">{isFr ? "Paramètres du workflow" : "Workflow settings"}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">
            {isFr
              ? "Les étapes de ce tableau et la façon dont les cartes passent de l’une à l’autre. Les droits existants décident toujours de qui peut déplacer une carte."
              : "This board's stages and how cards move between them. Existing permissions still decide who may move a card."}
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href={`/tickets?project=${project.id}`}>
            <SquareKanban className="size-4" />
            {isFr ? "Ouvrir le tableau" : "Open the board"}
          </Link>
        </Button>
      </div>

      <WorkflowSettings
        projectId={project.id}
        workflow={workflow}
        cardCounts={countCardsByStage(ticketStages, workflow)}
        readOnly={!canManage}
      />
    </div>
  );
}
