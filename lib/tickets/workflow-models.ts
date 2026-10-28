// A board starts from a model or from another mission's board (asked on 2026-10-28), in the workflow editor
// (vanguard/one/Workflow.tsx). Applying one changes the draft only; the editor's save checks it as any other.
// Stages are never deleted (tickets and history keep resolving): a stage of the model that the board already has, by
// name, keeps its id; the board's other stages are archived when empty and kept at the end when they hold cards.

import { createStageId, sortStages, type WorkflowDraft } from "@/lib/tickets/workflow";
import { stageKey } from "@/lib/tickets/stage-columns";
import type { BoardWorkflow, StageCategory, WorkflowSettings, WorkflowStage } from "@/types/workflow";

export type ModelStage = { name: string; category: StageCategory; completed?: boolean; default?: boolean };
export type WorkflowModel = { id: string; fr: string; en: string; hint: [string, string]; stages: ModelStage[]; settings: WorkflowSettings };

const FREE: WorkflowSettings = { allow_backward: true, allow_skip_forward: true, allow_reopen: true, require_reason: false, custom_transitions_enabled: false };

export const WORKFLOW_MODELS: WorkflowModel[] = [
  {
    id: "standard",
    fr: "Standard",
    en: "Standard",
    hint: ["À faire, En cours, En revue, Terminé", "To do, In progress, In review, Done"],
    stages: [
      { name: "À faire", category: "todo", default: true },
      { name: "En cours", category: "in_progress" },
      { name: "En revue", category: "review" },
      { name: "Terminé", category: "in_progress", completed: true },
    ],
    settings: FREE,
  },
  {
    id: "dev",
    fr: "Développement",
    en: "Development",
    hint: ["To Do → Code review → Test → To merge → Done", "To Do → Code review → Test → To merge → Done"],
    stages: [
      { name: "To Do", category: "todo", default: true },
      { name: "Ready to implement", category: "todo" },
      { name: "Pending", category: "blocked" },
      { name: "In progress", category: "in_progress" },
      { name: "Code review", category: "review" },
      { name: "Ready for test", category: "review" },
      { name: "Test", category: "review" },
      { name: "To merge", category: "review" },
      { name: "Done", category: "in_progress", completed: true },
    ],
    settings: FREE,
  },
  {
    id: "audit",
    fr: "Audit",
    en: "Audit",
    hint: ["Planification, Terrain, Revue, Rapport, Terminé", "Planning, Fieldwork, Review, Report, Done"],
    stages: [
      { name: "Planification", category: "todo", default: true },
      { name: "Terrain", category: "in_progress" },
      { name: "Revue", category: "review" },
      { name: "Rapport", category: "review" },
      { name: "Terminé", category: "in_progress", completed: true },
    ],
    settings: FREE,
  },
];

/** The stages of another board, as a model: its active stages in order, and its settings. */
export function modelOfBoard(workflow: BoardWorkflow): Pick<WorkflowModel, "stages" | "settings"> {
  const stages = sortStages(workflow.stages).filter((s) => !s.archived_at);
  return {
    stages: stages.map((s) => ({ name: s.name, category: s.category, completed: s.is_completed, default: s.is_default })),
    settings: {
      allow_backward: workflow.allow_backward,
      allow_skip_forward: workflow.allow_skip_forward,
      allow_reopen: workflow.allow_reopen,
      require_reason: workflow.require_reason,
      custom_transitions_enabled: false, // the copied board's transitions name its own stage ids
    },
  };
}

/**
 * The draft with the model's stages. `cardCounts` is the number of tickets per stage id: a stage of the board that the
 * model does not have stays (at the end) while it holds cards, and is archived otherwise.
 */
export function applyModel(draft: WorkflowDraft, model: Pick<WorkflowModel, "stages" | "settings">, cardCounts: Record<string, number>, now = new Date().toISOString()): WorkflowDraft {
  const byKey = new Map(draft.stages.map((s) => [stageKey(s.name), s]));
  const used = new Set<string>();
  const hasDefault = model.stages.some((s) => s.default);
  const stages: WorkflowStage[] = model.stages.map((m, i) => {
    const existing = byKey.get(stageKey(m.name));
    if (existing) used.add(existing.id);
    return {
      id: existing?.id ?? createStageId(),
      name: m.name,
      position: i,
      is_default: hasDefault ? Boolean(m.default) : i === 0,
      is_completed: Boolean(m.completed),
      category: m.category,
      archived_at: null,
    };
  });
  for (const s of draft.stages) {
    if (used.has(s.id)) continue;
    const keep = (cardCounts[s.id] ?? 0) > 0 && !s.archived_at;
    stages.push({ ...s, position: stages.length, is_default: false, archived_at: keep ? null : s.archived_at ?? now });
  }
  return { ...draft, ...model.settings, stages, transitions: {} };
}
