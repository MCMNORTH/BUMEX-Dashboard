import { describe, expect, it } from "vitest";

import { estimateHours, evaluateTransition, missingEstimate, normalizeWorkflowDraft, resolveCategoryTarget, strandedStages, toWorkflowDraft, transitionsFromSettings, validateWorkflowDraft } from "../workflow";
import type { BoardWorkflow, StageCategory } from "@/types/workflow";

// The board's move rules (asked on 2026-10-28: "the moves section bugs out with custom moves or reasons").
const stage = (id: string, position: number, category: StageCategory, more: { completed?: boolean; default?: boolean } = {}) => ({
  id, name: id, position, category, is_completed: Boolean(more.completed), is_default: Boolean(more.default), archived_at: null,
});
const board = (more: Partial<BoardWorkflow> = {}): BoardWorkflow => ({
  project_id: "p",
  stages: [stage("todo", 0, "todo", { default: true }), stage("doing", 1, "in_progress"), stage("review", 2, "review"), stage("done", 3, "in_progress", { completed: true })],
  transitions: {},
  allow_backward: false,
  allow_skip_forward: false,
  allow_reopen: false,
  require_reason: false,
  custom_transitions_enabled: false,
  is_configured: true,
  updated_at: null,
  ...more,
});

describe("moves by the settings", () => {
  it("one step forward only, no way back, no reopening", () => {
    const b = board();
    expect(evaluateTransition(b, "todo", "doing").ok).toBe(true);
    expect(evaluateTransition(b, "todo", "review")).toMatchObject({ ok: false, error: { code: "skip" } });
    expect(evaluateTransition(b, "review", "doing")).toMatchObject({ ok: false, error: { code: "backward" } });
    expect(evaluateTransition(b, "done", "review")).toMatchObject({ ok: false, error: { code: "reopen" } });
  });

  it("a reason for a move back or a reopening, when the board asks", () => {
    const b = board({ allow_backward: true, allow_reopen: true, require_reason: true });
    expect(evaluateTransition(b, "review", "doing")).toMatchObject({ ok: false, error: { code: "reason_required", needsReasonFor: "backward" } });
    expect(evaluateTransition(b, "review", "doing", "client asked").ok).toBe(true);
    expect(evaluateTransition(b, "done", "review")).toMatchObject({ ok: false, error: { code: "reason_required", needsReasonFor: "reopen" } });
    expect(evaluateTransition(b, "todo", "doing").ok).toBe(true);
  });
});

describe("custom transitions", () => {
  it("the list alone says which moves exist, whatever the settings", () => {
    const b = board({ custom_transitions_enabled: true, transitions: { todo: ["review"], review: ["doing"], done: ["doing"] } });
    expect(evaluateTransition(b, "todo", "review").ok).toBe(true); // a skip, listed
    expect(evaluateTransition(b, "review", "doing").ok).toBe(true); // backward, listed
    expect(evaluateTransition(b, "done", "doing").ok).toBe(true); // a reopening, listed
    expect(evaluateTransition(b, "todo", "doing")).toMatchObject({ ok: false, error: { code: "not_listed" } }); // the next one, not listed
  });

  it("still asks a reason for a listed move back, and keeps completion to the reporter", () => {
    const b = board({ custom_transitions_enabled: true, require_reason: true, transitions: { review: ["doing", "done"] } });
    expect(evaluateTransition(b, "review", "doing")).toMatchObject({ ok: false, error: { code: "reason_required" } });
    expect(evaluateTransition(b, "review", "doing", "x").ok).toBe(true);
    expect(evaluateTransition(b, "review", "done", null, { canComplete: false, hasReporter: true })).toMatchObject({ ok: false, error: { code: "reporter_only" } });
  });

  it("starts from the settings", () => {
    expect(transitionsFromSettings(board())).toEqual({ todo: ["doing"], doing: ["review"], review: ["done"], done: [] });
    expect(transitionsFromSettings(board({ allow_backward: true })).review).toEqual(["todo", "doing", "done"]);
  });

  it("says which stages no card can leave or reach", () => {
    const b = board({ custom_transitions_enabled: true, transitions: { todo: ["doing"], doing: ["done"] } });
    const { noWayOut, noWayIn } = strandedStages(b);
    expect(noWayOut.map((s) => s.id)).toEqual(["review"]);
    expect(noWayIn.map((s) => s.id)).toEqual(["review"]);
  });

  it("is refused when nothing is ticked: no card could move", () => {
    const b = board();
    const draft = { ...toWorkflowDraft(b), custom_transitions_enabled: true, transitions: {} };
    expect(validateWorkflowDraft(draft, b, {}, "en")).toMatch(/no move is ticked/);
    expect(validateWorkflowDraft({ ...draft, transitions: { todo: ["doing"] } }, b, {}, "en")).toBeNull();
  });
});

// A stage that forces a time estimate (asked on 2026-11-02).
describe("forced estimates", () => {
  const forced = () => {
    const b = board({ allow_backward: true, allow_skip_forward: true, allow_reopen: true, require_reason: true });
    return { ...b, stages: b.stages.map((s) => (s.id === "doing" ? { ...s, force_estimate: true } : s)) };
  };

  it("a ticket without an estimate cannot enter the stage; with one, or unknown, it can", () => {
    const b = forced();
    expect(evaluateTransition(b, "todo", "doing", null, { hasEstimate: false })).toMatchObject({ ok: false, error: { code: "estimate_required", to: "doing" } });
    expect(evaluateTransition(b, "todo", "doing", null, { hasEstimate: true }).ok).toBe(true);
    expect(evaluateTransition(b, "todo", "doing").ok).toBe(true);
    expect(evaluateTransition(b, "todo", "review", null, { hasEstimate: false }).ok).toBe(true);
    expect(evaluateTransition(b, "doing", "doing", null, { hasEstimate: false })).toMatchObject({ ok: true, noop: true });
  });

  it("the board's own rules come first: a reason before the estimate, a refused move never asks one", () => {
    const b = forced();
    expect(evaluateTransition(b, "review", "doing", null, { hasEstimate: false })).toMatchObject({ ok: false, error: { code: "reason_required" } });
    expect(evaluateTransition(b, "review", "doing", "back", { hasEstimate: false })).toMatchObject({ ok: false, error: { code: "estimate_required" } });
    const strict = { ...b, allow_skip_forward: false };
    expect(evaluateTransition({ ...strict, stages: strict.stages.map((s) => (s.id === "review" ? { ...s, force_estimate: true } : s)) }, "todo", "review", null, { hasEstimate: false })).toMatchObject({ ok: false, error: { code: "skip" } });
  });

  it("a column of a mixed board asks the estimate of the stage it would pick", () => {
    expect(resolveCategoryTarget(forced(), "todo", "in_progress", "en", null, { hasEstimate: false })).toMatchObject({ ok: false, error: { code: "estimate_required" }, stageId: "doing" });
  });

  it("the setting is kept when saved, and the default stage cannot force one", () => {
    const b = forced();
    const draft = normalizeWorkflowDraft(toWorkflowDraft(b));
    expect(draft.stages.find((s) => s.id === "doing")?.force_estimate).toBe(true);
    expect(draft.stages.find((s) => s.id === "review")?.force_estimate).toBe(false);
    expect(validateWorkflowDraft(draft, b, {}, "en")).toBeNull();
    const onDefault = { ...draft, stages: draft.stages.map((s) => (s.id === "todo" ? { ...s, force_estimate: true } : s)) };
    expect(validateWorkflowDraft(onDefault, b, {}, "en")).toMatch(/cannot force an estimate/);
  });

  it("an estimate is above 0 hours", () => {
    expect(estimateHours("4")).toBe(4);
    expect(estimateHours("2,5")).toBe(2.5);
    expect(estimateHours(0)).toBeNull();
    expect(estimateHours("")).toBeNull();
    expect(missingEstimate({ force_estimate: true }, null)).toBe(true);
    expect(missingEstimate({ force_estimate: true }, 3)).toBe(false);
    expect(missingEstimate({}, null)).toBe(false);
  });
});
