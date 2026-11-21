import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { localizeNotification, notificationTypeLabel } from "@/lib/notifications/localize";
import { activityDetail, activityText, valueLabel } from "../labels";

// What the application stores in English (the activity log's sentences, the notifications) is said in French when
// the person reads French (vanguard/one/labels.ts, lib/notifications/localize.ts; asked on 2026-11-20). These tests
// read every sentence the code writes: a new one without its French fails here.
const fr = (f: string) => f;
const en = (_f: string, e: string) => e;

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? (["test", "node_modules", "engine"].includes(e.name) ? [] : sources(join(dir, e.name))) : /\.tsx?$/.test(e.name) && !e.name.endsWith(".test.ts") ? [join(dir, e.name)] : [],
  );
}

// a template as a sample sentence: `Created project ${payload.name}` → "Created project Audit 2026"
function samples(key: "action" | "title" | "body", only?: RegExp): string[] {
  const out = new Set<string>();
  const line = new RegExp(`\\b${key}:\\s*(.+)$`);
  for (const file of ["lib", "app"].flatMap((d) => sources(join(process.cwd(), d)))) {
    const text = readFileSync(file, "utf8");
    if (only && !only.test(text)) continue;
    for (const row of text.split("\n")) {
      const m = line.exec(row);
      if (!m) continue;
      for (const literal of m[1].match(/`[^`]*`|"[^"]*"/g) ?? []) {
        const sample = literal
          .slice(1, -1)
          .replace(/\$\{[^}]*\?\s*"([^"]+)"[^}]*\}/g, "$1")
          .replace(/\$\{[^}]*\}/g, "Audit 2026");
        if (/[A-Za-z]{3}/.test(sample) && !/^(read|create|update|unchanged|I|U|D)$/.test(sample)) out.add(sample);
      }
    }
  }
  return [...out];
}

describe("the activity log, in French", () => {
  const actions = samples("action", /activity|logActivity|recordActivity|action:/).filter((a) => /^[A-Z]/.test(a));

  it("finds the sentences the application writes", () => {
    expect(actions.length).toBeGreaterThan(40);
  });

  it("has a French sentence for each", () => {
    expect(actions.filter((a) => activityText(a, fr) === a)).toEqual([]);
  });

  it("says a change of field with its labels, never its code", () => {
    expect(activityText("Changed estimated_hours", fr)).toBe("Estimation modifiée");
    expect(activityText("Changed estimated_hours", en)).toBe("Estimate changed");
    expect(activityDetail({ field: "priority", from: "low", to: "high" }, fr)).toBe("Priorité : Basse → Haute");
    expect(activityDetail({ field: "status", from: "in_progress", to: "done" }, en)).toBe("Status: In progress → Done");
    expect(activityText("Moved ticket to in_progress", fr)).toBe("Ticket déplacé vers En cours");
  });

  it("shows the person's own words, not the services' fixed English", () => {
    expect(activityDetail({ summary: "Client created" }, fr)).toBe("");
    expect(activityDetail({ summary: "Ahmed Ba (BUMEX IT) joined the team" }, fr)).toBe("");
    expect(activityDetail({ summary: "Le client attend la maquette" }, fr)).toBe("Le client attend la maquette");
  });
});

describe("the stored codes", () => {
  it("are labels in the person's language", () => {
    expect(valueLabel("invoice", "partially_paid", fr)).toBe("Partiellement payée");
    expect(valueLabel("member", "employee", fr)).toBe("Collaborateur");
    expect(valueLabel("project", "active", en)).toBe("Active");
    expect(valueLabel("contract", "weird_new_code", fr)).toBe("Weird new code");
  });
});

describe("the notifications, in French", () => {
  const notifying = /createNotifications|createAssignmentNotification|notify/;
  const titles = samples("title", notifying).filter((t) => /^[A-Z]/.test(t) && !/^Audit 2026/.test(t));
  const bodies = samples("body", notifying).filter((b) => /[a-z]{3}/.test(b));

  it("have a French title for each", () => {
    const known = titles.filter((t) => localizeNotification({ title: t, body: "" }, "fr").title !== t);
    expect(titles.filter((t) => /assignment|ticket|Milestone|Outlook|e-mail|project|mentioned/i.test(t) && !known.includes(t))).toEqual([]);
  });

  it("have a French text for each", () => {
    const english = /\b(was|were|are|you|has|moved|replied|from)\b/i;
    expect(bodies.filter((b) => english.test(b) && localizeNotification({ title: "", body: b }, "fr").body === b)).toEqual([]);
  });

  it("say their kind as a label", () => {
    expect(notificationTypeLabel("payment_due", "fr")).toBe("Paiement");
    expect(notificationTypeLabel("payment_due", "en")).toBe("Payment due");
  });
});
