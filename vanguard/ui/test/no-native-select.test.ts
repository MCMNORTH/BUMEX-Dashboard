import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

// Every dropdown is Vanguard's own (vanguard/ui/Select.tsx), the ERP team's screens included, which the lint leaves
// out: no browser <select> or <datalist> comes back.
function tsx(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (e.name === "test" || e.name === "node_modules" ? [] : tsx(join(dir, e.name))) : e.name.endsWith(".tsx") ? [join(dir, e.name)] : [],
  );
}

describe("the dropdowns", () => {
  it("are never the browser's <select> or <datalist>", () => {
    const found = ["vanguard", "app", "components"]
      .flatMap((dir) => tsx(join(process.cwd(), dir)))
      .filter((file) => !file.endsWith("ui/Select.tsx"))
      .filter((file) => /<(select|datalist)[\s>]/.test(readFileSync(file, "utf8")));
    expect(found).toEqual([]);
  });
});
