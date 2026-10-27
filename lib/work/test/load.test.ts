import { describe, expect, it } from "vitest";

import { formatHours, levelOf, loadOf, remainingHours, weekEnd } from "../load";

// Monday 2026-10-26 … Sunday 2026-11-01
const today = "2026-10-28";
const t = (priority: string, estimated_hours: number | null, due_date: string | null, status = "todo", logged_minutes = 0) => ({ priority, estimated_hours, due_date, status, logged_minutes });

describe("load", () => {
  it("ends the week on Sunday", () => {
    expect(weekEnd("2026-10-26")).toBe("2026-11-01");
    expect(weekEnd("2026-11-01")).toBe("2026-11-01");
  });

  it("counts the hours left, never below 0", () => {
    expect(remainingHours({ estimated_hours: 4, logged_minutes: 90 })).toBe(2.5);
    expect(remainingHours({ estimated_hours: 1, logged_minutes: 600 })).toBe(0);
    expect(remainingHours({ estimated_hours: null })).toBe(0);
  });

  it("weights this week's tickets by priority against the capacity", () => {
    const load = loadOf([t("urgent", 8, "2026-10-30"), t("high", 8, "2026-10-29"), t("medium", 8, "2026-10-27"), t("low", 8, "2026-11-01")], { capacityHours: 40, today });
    expect(load.weekHours).toBe(36); // 12 + 10 + 8 + 6
    expect(load.rawWeekHours).toBe(32);
    expect(load.percent).toBe(90);
    expect(load.level).toBe("high");
    expect(load.byPriority).toEqual({ urgent: 12, high: 10, medium: 8, low: 6 });
    expect(load.overdue).toBe(1);
  });

  it("leaves later tickets out of the week but in the open hours; undated ones count when in progress", () => {
    const load = loadOf([t("medium", 10, "2026-11-12"), t("medium", 3, null), t("medium", 5, null, "in_progress")], { capacityHours: 40, today });
    expect(load.weekHours).toBe(5);
    expect(load.openHours).toBe(18);
    expect(load.count).toBe(3);
    expect(load.weekCount).toBe(1);
  });

  it("skips review, done and archived; flags tickets to estimate and two late ones", () => {
    const load = loadOf([t("medium", 6, "2026-10-28", "review"), t("medium", 6, "2026-10-28", "done"), t("medium", null, "2026-10-20"), t("high", 2, "2026-10-21")], { capacityHours: 40, today });
    expect(load.count).toBe(2);
    expect(load.unestimated).toBe(1);
    expect(load.weekHours).toBe(2.5);
    expect(load.pressure).toBe(true);
  });

  it("names levels and hours", () => {
    expect([levelOf(10), levelOf(50), levelOf(85), levelOf(111)]).toEqual(["light", "balanced", "high", "overloaded"]);
    expect(formatHours(1.5)).toBe("1,5 h");
    expect(formatHours(0.5, "en")).toBe("30 min");
  });
});
