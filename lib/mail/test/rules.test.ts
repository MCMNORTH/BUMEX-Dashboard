import { describe, expect, it } from "vitest";

import type { GraphMessage } from "@/lib/mail/graph";
import { cleanSubject, ownSenderAddresses, pickAssignee, replyText, skipReason, threadIds } from "@/lib/mail/rules";

const who = (address: string, name = "") => ({ emailAddress: { address, name } });
const mail = (over: Partial<GraphMessage> = {}, headers: Record<string, string> = {}): GraphMessage => ({
  id: "g1",
  internetMessageId: "<a@client.com>",
  subject: "Mise à jour du rapport",
  from: who("Awa@Client.com", "Awa Client"),
  toRecipients: [who("sidi@bumex.mr")],
  body: { contentType: "text", content: "Pouvez-vous mettre à jour le rapport avant vendredi ?" },
  internetMessageHeaders: Object.entries(headers).map(([name, value]) => ({ name, value })),
  ...over,
});
const own = ownSenderAddresses(["BUMEX Dashboard <notifications@verify.bumex.mr>", "bumex@bumex.mr", undefined, "not an address"]);

describe("the free rules", () => {
  it("reads the app's own senders, named or bare", () => {
    expect(own).toEqual(["notifications@verify.bumex.mr", "bumex@bumex.mr"]);
  });

  it("lets a person's request through", () => {
    expect(skipReason(mail(), own)).toBeNull();
  });

  it("leaves out what is never a task", () => {
    expect(skipReason(mail({ from: who("notifications@verify.bumex.mr") }), own)).toBe("vanguard");
    expect(skipReason(mail({}, { "Auto-Submitted": "auto-replied" }), own)).toBe("automatic");
    expect(skipReason(mail({}, { "Auto-Submitted": "no" }), own)).toBeNull();
    expect(skipReason(mail({ subject: "Réponse automatique : absent" }), own)).toBe("automatic");
    expect(skipReason(mail({ from: who("no-reply@tool.com") }), own)).toBe("automatic");
    expect(skipReason(mail({}, { "List-Unsubscribe": "<mailto:x@y>" }), own)).toBe("newsletter");
    expect(skipReason(mail({}, { Precedence: "bulk" }), own)).toBe("newsletter");
    expect(skipReason(mail({ from: who("MAILER-DAEMON@mx.client.com") }), own)).toBe("bounce");
    expect(skipReason(mail({ subject: "Undeliverable: Devis" }), own)).toBe("bounce");
    expect(skipReason(mail({ "@odata.type": "#microsoft.graph.eventMessageRequest" }), own)).toBe("calendar");
    expect(skipReason(mail({ body: { content: "  " }, hasAttachments: false }), own)).toBe("empty");
    expect(skipReason(mail({ body: { content: "" }, hasAttachments: true }), own)).toBeNull();
  });
});

describe("whose ticket", () => {
  const connected = new Map([["sidi@bumex.mr", "sidi"], ["awa@bumex.mr", "awa"]]);

  it("goes to the first connected person in To, else in copy", () => {
    expect(pickAssignee(mail({ toRecipients: [who("other@bumex.mr"), who("Awa@bumex.mr")], ccRecipients: [who("sidi@bumex.mr")] }), connected)).toEqual({ personId: "awa", via: "to" });
    expect(pickAssignee(mail({ toRecipients: [who("other@bumex.mr")], ccRecipients: [who("sidi@bumex.mr")] }), connected)).toEqual({ personId: "sidi", via: "cc" });
  });

  it("is nobody's when it reached the inbox through a group", () => {
    expect(pickAssignee(mail({ toRecipients: [who("equipe@bumex.mr")], ccRecipients: [] }), connected)).toBeNull();
  });
});

describe("threads and subjects", () => {
  it("reads the e-mails a reply answers", () => {
    expect(threadIds(mail({}, { "In-Reply-To": "<a@client.com>", References: "<z@client.com> <a@client.com>" }))).toEqual(["<a@client.com>", "<z@client.com>"]);
    expect(threadIds(mail())).toEqual([]);
  });

  it("keeps a reply's own words", () => {
    expect(replyText(mail({ uniqueBody: { content: " Merci, c'est noté. " } }))).toBe("Merci, c'est noté.");
    expect(replyText(mail({ uniqueBody: { content: "" } }))).toBe("Pouvez-vous mettre à jour le rapport avant vendredi ?");
  });

  it("drops the reply and forward prefixes", () => {
    expect(cleanSubject("RE: TR: Fwd:  Devis 2026")).toBe("Devis 2026");
    expect(cleanSubject("Re[2]: Devis")).toBe("Devis");
    expect(cleanSubject("Revue du contrat")).toBe("Revue du contrat");
  });
});
