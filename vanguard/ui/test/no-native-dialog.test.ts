import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Every question is asked in Fluent's dialog (vanguard/one/ask.tsx: confirmAsk, textAsk, fieldsAsk), the ERP team's
// screens included, which the lint leaves out: no browser confirm(), prompt() or alert() comes back (2026-11-20).
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === "test" || e.name === "node_modules" ? [] : sources(join(dir, e.name))) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

// confirm( or window.confirm(, not someone's own method (flow.confirm(), confirmAsk()
const NATIVE = /(?<![\w.$])(?:window\.)?(?:confirm|prompt|alert)\(/;

describe("the questions", () => {
  it("are never the browser's confirm, prompt or alert", () => {
    const found = ["vanguard", "app", "components"]
      .flatMap((dir) => sources(join(process.cwd(), dir)))
      .filter((file) => NATIVE.test(readFileSync(file, "utf8")));
    expect(found).toEqual([]);
  });
});
