import { describe, expect, it } from "vitest";

import { editDuration, formatDuration, parseDuration } from "../duration";

describe("durations as people type them", () => {
  it.each([
    ["2", 120], ["1h30", 90], ["1 h 30", 90], ["1h30m", 90], ["1h", 60], ["1,5", 90], ["1.5", 90], ["1.5h", 90], ["0,25h", 15],
    ["1:30", 90], ["0:45", 45], ["90", 90], ["90m", 90], ["45 min", 45], ["30mn", 30], ["24", 1440], ["7h45", 465],
  ])("%s is %i minutes", (text, minutes) => {
    expect(parseDuration(text)).toBe(minutes);
  });

  it.each(["", "abc", "0", "0h", "25h", "1:75", "-1", "1h99", "2000"])("%s is not a duration", (text) => {
    expect(parseDuration(text)).toBeNull();
  });

  it("writes them back", () => {
    expect(formatDuration(90)).toBe("1 h 30");
    expect(formatDuration(120)).toBe("2 h");
    expect(formatDuration(45)).toBe("45 min");
    expect(editDuration(90)).toBe("1h30");
    expect(editDuration(120)).toBe("2");
    expect(editDuration(45)).toBe("45min");
    expect(parseDuration(editDuration(45))).toBe(45);
  });
});
