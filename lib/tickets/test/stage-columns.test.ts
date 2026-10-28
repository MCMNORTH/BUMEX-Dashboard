import { describe, expect, it } from "vitest";

import { getLegacyWorkflow, normalizeWorkflowDraft, toWorkflowDraft, validateWorkflowDraft, draftToWorkflow } from "../workflow";
import { columnOfTicket, mergeStageColumns, stageForColumn, stageKey } from "../stage-columns";
import { WORKFLOW_MODELS, applyModel, modelOfBoard } from "../workflow-models";
import type { BoardWorkflow, WorkflowStage } from "@/types/workflow";

const stage = (id: string, name: string, position: number, category: WorkflowStage["category"], extra: Partial<WorkflowStage> = {}): WorkflowStage =>
  ({ id, name, position, category, is_default: position === 0, is_completed: false, archived_at: null, ...extra });
const board = (project_id: string, stages: WorkflowStage[]): BoardWorkflow => ({
  project_id, stages, transitions: {}, allow_backward: true, allow_skip_forward: true, allow_reopen: true, require_reason: false,
  custom_transitions_enabled: false, is_configured: true, updated_at: null,
});

const dev = board("p-dev", [
  stage("a", "To Do", 0, "todo"), stage("b", "In progress", 1, "in_progress"), stage("c", "Code review", 2, "review"),
  stage("d", "To merge", 3, "review"), stage("e", "Done", 4, "in_progress", { is_completed: true }),
  stage("z", "Old", 5, "todo", { archived_at: "2026-10-01T00:00:00Z" }),
]);
const audit = board("p-aud", [
  stage("x", "to do", 0, "todo"), stage("y", "Terrain", 1, "in_progress"), stage("w", "Code  Review", 2, "review"), stage("v", "Done", 3, "in_progress", { is_completed: true }),
]);

describe("stage columns across boards", () => {
  it("folds names", () => {
    expect(stageKey(" Côde  Review ")).toBe("code review");
  });

  it("merges stages by name, in status then board order", () => {
    const columns = mergeStageColumns([dev, audit]);
    expect(columns.map((c) => c.name)).toEqual(["To Do", "In progress", "Terrain", "Code review", "To merge", "Done"]);
    expect(columns.find((c) => c.key === "done")).toMatchObject({ status: "done", completed: true });
  });

  it("shows an archived stage only while it holds cards, dashed and last", () => {
    expect(mergeStageColumns([dev]).some((c) => c.key === "old")).toBe(false);
    const columns = mergeStageColumns([dev], (p, s) => p === "p-dev" && s === "z");
    expect(columns.at(-1)).toMatchObject({ key: "old", archived: true });
  });

  it("puts a card in its stage's column and a drop on the same-named stage of its own board", () => {
    expect(columnOfTicket(audit, { stage_id: "w", status: "review" })).toBe("code review");
    expect(stageForColumn(audit, "code review")?.id).toBe("w");
    expect(stageForColumn(audit, "to merge")).toBeUndefined();
    expect(stageForColumn(dev, "old")).toBeUndefined(); // archived: nothing moves there
  });

  it("resolves a ticket from before workflows by its status", () => {
    const legacy = getLegacyWorkflow("p-old", "fr");
    expect(columnOfTicket(legacy, { stage_id: null, status: "in_progress" })).toBe("en cours");
  });
});

describe("board models", () => {
  it("every model is a board the editor accepts", () => {
    for (const model of WORKFLOW_MODELS) {
      const empty = { ...toWorkflowDraft(board("p", [])), stages: [] };
      const draft = normalizeWorkflowDraft(applyModel(empty, model, {}));
      expect(validateWorkflowDraft(draft, board("p", []), {}, "fr"), model.id).toBeNull();
    }
  });

  it("keeps the ids of stages of the same name, archives the empty others and keeps those with cards", () => {
    const model = WORKFLOW_MODELS.find((m) => m.id === "dev")!;
    const draft = applyModel(toWorkflowDraft(audit), model, { y: 2 }, "2026-10-28T00:00:00Z");
    expect(draft.stages.find((s) => s.name === "To Do")?.id).toBe("x");
    expect(draft.stages.find((s) => s.name === "Code review")?.id).toBe("w");
    expect(draft.stages.find((s) => s.name === "Done")?.id).toBe("v");
    expect(draft.stages.find((s) => s.id === "y")).toMatchObject({ archived_at: null, is_default: false });
    const normalized = normalizeWorkflowDraft(draft);
    expect(validateWorkflowDraft(normalized, audit, { y: 2 }, "fr")).toBeNull();
    expect(draftToWorkflow(normalized, "p-aud").stages.filter((s) => s.is_default)).toHaveLength(1);
  });

  it("copies another board's active stages and settings, not its transitions", () => {
    const copy = modelOfBoard({ ...dev, custom_transitions_enabled: true, transitions: { a: ["b"] } });
    expect(copy.stages.map((s) => s.name)).toEqual(["To Do", "In progress", "Code review", "To merge", "Done"]);
    expect(copy.settings.custom_transitions_enabled).toBe(false);
  });
});
