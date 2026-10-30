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

  it("counts the hours assigned through every open ticket against the capacity, whatever its due date", () => {
    const load = loadOf([t("urgent", 8, "2026-10-30"), t("high", 8, "2026-11-04"), t("medium", 8, null), t("low", 8, "2026-12-01", "in_progress", 120)], { capacityHours: 40, today });
    expect(load.weekHours).toBe(32);
    expect(load.percent).toBe(80);
    expect(load.level).toBe("balanced");
    expect(load.byPriority).toEqual({ urgent: 8, high: 8, medium: 8, low: 8 });
    expect(load.openHours).toBe(30); // the time logged comes off what remains, not off the load
    expect(load.count).toBe(4);
  });

  it("counts tickets in review; skips done and archived; flags tickets to estimate and two late ones", () => {
    const load = loadOf([t("medium", 6, "2026-11-04", "review"), t("medium", 6, "2026-10-28", "done"), t("medium", 6, null, "archived"), t("medium", null, "2026-10-20"), t("high", 2, "2026-10-21")], { capacityHours: 40, today });
    expect(load.count).toBe(3);
    expect(load.unestimated).toBe(1);
    expect(load.weekHours).toBe(8);
    expect(load.pressure).toBe(true);
  });

  it("is overloaded past 110 % of the capacity", () => {
    const load = loadOf([t("medium", 16, "2026-11-04", "in_progress"), t("medium", 8, "2026-11-04", "review"), t("medium", 24, "2026-11-04")], { capacityHours: 40, today });
    expect(load.percent).toBe(120);
    expect(load.level).toBe("overloaded");
  });

  it("names levels and hours", () => {
    expect([levelOf(10), levelOf(50), levelOf(85), levelOf(111)]).toEqual(["light", "balanced", "high", "overloaded"]);
    expect(formatHours(1.5)).toBe("1,5 h");
    expect(formatHours(0.5, "en")).toBe("30 min");
  });
});
