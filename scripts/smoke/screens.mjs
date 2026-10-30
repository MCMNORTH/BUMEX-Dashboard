// The app's screens at a PC's, a tablet's and a phone's size (docs/plans/mobile-tablet.md, step 12): every room and one
// of each detail page, a screenshot of each, and what sticks out sideways. Run by run.mjs:
//
//   npm run smoke -- --screens                    the checks, then the screens at every size
//   npm run smoke -- --screens-only               the screens only (no other check)
//   … --sizes=pc,phone  --label=before            some sizes only; pictures in <tmp>/bumex-smoke/screens/<label>/<size>
//
// On a phone or a tablet nothing may scroll the page sideways: a wide table scrolls inside its card. Until the phone
// layout is built (plan step 5) that is reported, not checked; --strict makes it a check.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { C, M, T, id, uid } from "./seed.mjs";

export const SIZES = {
  pc: { width: 1440, height: 900 },
  phone: { width: 390, height: 844, mobile: true, touch: true },
  "small-phone": { width: 360, height: 740, mobile: true, touch: true },
  tablet: { width: 820, height: 1180, mobile: true, touch: true },
  "tablet-landscape": { width: 1180, height: 820, mobile: true, touch: true },
};

const A = M.audit;
// [file name, address]
export const SCREENS = [
  ["home", "/vanguard"],
  ["overview", "/vanguard?room=overview"],
  ["myday", "/vanguard?room=myday"],
  ["mywork", "/vanguard?room=mywork"],
  ["inbox", "/vanguard?room=inbox"],
  ["tasks", "/vanguard?room=tasks"],
  ["tasks-list", "/vanguard?room=tasks&tab=list"],
  ["ticket", `/vanguard?room=tasks&tab=ticket%3A${T.t1}`],
  ["board", `/vanguard?room=tasks&tab=board%3A${A}`],
  ["time", "/vanguard?room=time"],
  ["missions", "/vanguard?room=missions"],
  ["mission", `/vanguard?room=missions&tab=mission%3A${A}`],
  ["missions-calendar", "/vanguard?room=missions&tab=calendar"],
  ["missions-milestones", "/vanguard?room=missions&tab=milestones"],
  ["missions-week", "/vanguard?room=missions&tab=week"],
  ["missions-planning", "/vanguard?room=missions&tab=planning"],
  ["missions-billing", "/vanguard?room=missions&tab=billing"],
  ["clients", "/vanguard?room=clients"],
  ["clients-customers", "/vanguard?room=clients&tab=customers"],
  ["clients-contracts", "/vanguard?room=clients&tab=contracts"],
  ["client", `/vanguard?room=clients&tab=client%3A${C.snim}`],
  ["contract", `/vanguard?room=clients&tab=contract%3A${id(701)}`],
  ["accounting", "/vanguard?room=accounting"],
  ["bank", "/vanguard?room=bank"],
  ["suppliers", "/vanguard?room=suppliers"],
  ["assets", "/vanguard?room=assets"],
  ["hr", "/vanguard?room=hr"],
  ["hr-people", "/vanguard?room=hr&tab=people"],
  ["person", `/vanguard?room=hr&tab=person%3A${uid.ahmed}`],
  ["tax", "/vanguard?room=tax"],
  ["archives", "/vanguard?room=archives"],
  ["archives-documents", "/vanguard?room=archives&tab=documents"],
  ["reports", "/vanguard?room=reports"],
  ["reports-activity", "/vanguard?room=reports&tab=activity"],
  ["reports-archive", "/vanguard?room=reports&tab=archive"],
  ["settings", "/vanguard?room=settings"],
  ["settings-account", "/vanguard?room=settings&tab=account"],
  ["settings-history", "/vanguard?room=settings&tab=history"],
];

// what sticks out of the screen sideways, outside any parent that scrolls or clips it; and whether the room itself
// scrolls sideways
const MEASURE = `(() => {
  const W = window.innerWidth;
  // a parent that scrolls or clips keeps it inside (if that parent sticks out, it is reported itself); the app's
  // container (.vanguard) and the room's scroll area are not such parents: they are the page
  const clipped = (el) => { for (let p = el.parentElement; p && !p.matches('.vanguard, .page-main, .sheet-body, .sheet, .app, .main, .page'); p = p.parentElement) { if (getComputedStyle(p).overflowX !== 'visible') return true; } return false; };
  const name = (el) => el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\\s+/).slice(0, 2).join('.') : '');
  const out = [];
  for (const el of document.querySelectorAll('.vanguard *')) {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height || r.right <= W + 1) continue;
    if (getComputedStyle(el).position === 'fixed' || clipped(el)) continue;
    out.push(name(el) + ' ' + Math.round(r.right - W) + 'px');
    if (out.length >= 4) break;
  }
  const room = document.querySelector('.page-main, .sheet-body');
  const roomOverflow = room ? room.scrollWidth - room.clientWidth : 0;
  return { out, roomOverflow };
})()`;

export async function runScreens({ openBrowser, cookies, check, dir, sizes = Object.keys(SIZES), strict = false, who = "mohamed.cheikh" }) {
  const tab = await openBrowser();
  const report = {};
  try {
    await tab.webgl(false); // the flat rooms; a phone never draws the building (plan step 2)
    await tab.signIn(cookies[who]);
    for (const size of sizes) {
      const s = SIZES[size];
      if (!s) throw new Error(`unknown size ${size} (${Object.keys(SIZES).join(", ")})`);
      await tab.viewport(s.width, s.height, s);
      const folder = join(dir, size);
      mkdirSync(folder, { recursive: true });
      const wide = [];
      const errors = [];
      for (const [file, path] of SCREENS) {
        await tab.go(path);
        const shown = await tab.until("document.readyState === 'complete' && document.body.innerText.length > 60 && !document.querySelector('.loading')", 25_000);
        await new Promise((resolve) => setTimeout(resolve, 900));
        // the same picture each time: no caret, no animation in flight
        await tab.evaluate("document.activeElement?.blur?.(), document.getAnimations().forEach((a) => a.finish?.()), true").catch(() => undefined);
        await tab.screenshot(join(folder, `${file}.png`));
        const m = await tab.evaluate(MEASURE).catch(() => null);
        const errs = tab.takeErrors();
        if (!shown || errs.length) errors.push({ file, shown, errors: errs.slice(0, 2) });
        if (size !== "pc" && m && (m.out.length || m.roomOverflow > 1)) wide.push({ file, roomOverflow: m.roomOverflow, out: m.out });
      }
      // a phone: its bar at the bottom, no rail; Back goes back one screen, inside the same page (plan step 4)
      if (s.mobile && s.width <= 640) {
        await tab.go("/vanguard");
        await tab.until("Boolean(document.querySelector('.pnav'))", 20_000);
        const shell = await tab.evaluate("({ bar: Boolean(document.querySelector('.pnav')), rail: getComputedStyle(document.querySelector('.rail')).display !== 'none' })");
        await tab.evaluate("window.__probe = 1, [...document.querySelectorAll('.pnav button')][2].click(), true");
        const inTasks = await tab.until("document.querySelector('.pnav button.on')?.innerText.includes('Tâches')", 10_000);
        await tab.evaluate("history.back(), true");
        const back = await tab.until("window.__probe === 1 && document.querySelector('.pnav button.on')?.innerText.includes('Ma journée')", 10_000);
        check(`${size}: the bar at the bottom, no rail; Back from Tâches returns to Ma journée in the same page`, shell.bar && !shell.rail && inTasks && back, { ...shell, inTasks, back });
      }
      report[size] = { wide, errors };
      check(`screens at ${size} (${s.width}×${s.height}): ${SCREENS.length} open without an error`, errors.length === 0, errors.slice(0, 3));
      if (size !== "pc") {
        if (strict) check(`screens at ${size}: nothing scrolls the page sideways`, wide.length === 0, wide.slice(0, 4));
        else console.log(`  · ${size}: ${wide.length}/${SCREENS.length} screens stick out sideways${wide.length ? ` (${wide.slice(0, 6).map((w) => w.file).join(", ")}…)` : ""}`);
      }
    }
  } finally {
    await tab.close();
  }
  writeFileSync(join(dir, "report.json"), JSON.stringify(report, null, 2));
  console.log(`  · screenshots: ${dir}`);
}
