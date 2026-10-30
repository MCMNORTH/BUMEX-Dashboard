// Two sets of screenshots of screens.mjs compared pixel by pixel: what changed, and a picture of where (changed pixels
// in red over a faded copy). Used to prove the PC screens did not change (docs/plans/mobile-tablet.md, step 12).
//
//   node scripts/smoke/diff-screens.mjs <before dir> <after dir> [<size>]     e.g. …/screens/before …/screens/latest pc
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PNG } from "pngjs";

const [before, after, size = "pc"] = process.argv.slice(2);
if (!before || !after) {
  console.log("usage: node scripts/smoke/diff-screens.mjs <before dir> <after dir> [size]");
  process.exit(2);
}
const a = join(before, size);
const b = join(after, size);
const out = join(after, `diff-${size}`);
mkdirSync(out, { recursive: true });

let changed = 0;
for (const file of readdirSync(a).filter((f) => f.endsWith(".png")).sort()) {
  if (!existsSync(join(b, file))) {
    console.log(`  ${file}: missing after`);
    changed += 1;
    continue;
  }
  const x = PNG.sync.read(readFileSync(join(a, file)));
  const y = PNG.sync.read(readFileSync(join(b, file)));
  if (x.width !== y.width || x.height !== y.height) {
    console.log(`  ${file}: size ${x.width}×${x.height} → ${y.width}×${y.height}`);
    changed += 1;
    continue;
  }
  const d = new PNG({ width: x.width, height: x.height });
  let n = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    const same = x.data[i] === y.data[i] && x.data[i + 1] === y.data[i + 1] && x.data[i + 2] === y.data[i + 2];
    if (!same) n += 1;
    d.data[i] = same ? 255 - (255 - y.data[i]) / 4 : 230;
    d.data[i + 1] = same ? 255 - (255 - y.data[i + 1]) / 4 : 0;
    d.data[i + 2] = same ? 255 - (255 - y.data[i + 2]) / 4 : 0;
    d.data[i + 3] = 255;
  }
  if (n) {
    writeFileSync(join(out, file), PNG.sync.write(d));
    console.log(`  ${file}: ${n} pixels changed (${((100 * n) / (x.width * x.height)).toFixed(2)} %)`);
    changed += 1;
  }
}
console.log(changed ? `${changed} screens changed; pictures in ${out}` : "identical");
process.exit(changed ? 1 : 0);
