import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import ts from "typescript";
import { describe, expect, it } from "vitest";

import { englishMessage } from "../engine-messages";

// What the finance engine says when it refuses an action is said in English when the person reads English
// (vanguard/one/engine-messages.ts; asked on 2026-11-21). These tests read every message the engine can throw: a new one
// without its English fails here.
const ENGINE = join(process.cwd(), "lib/erp/engine");
const SERVER = join(process.cwd(), "lib/erp/vanguard");

function parse(file: string) {
  return ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
}

function each(node: ts.Node, visit: (node: ts.Node) => void) {
  visit(node);
  ts.forEachChild(node, (child) => each(child, visit));
}

const product = (heads: string[], tails: string[]) => heads.flatMap((h) => tails.map((t) => h + t));

// A message as the sentences it can be: each `${…}` a sample value (X1, X2…), each choice (a ? 'client' : 'fournisseur')
// both ways, each 'text ' + value + ' text' joined. A message that is no text at all (a variable) has no sample.
function samples(message: ts.Expression): string[] {
  let values = 0;
  const value = () => `X${++values}`;
  const texts = (node: ts.Expression): string[] => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
    if (ts.isParenthesizedExpression(node)) return texts(node.expression);
    if (ts.isConditionalExpression(node)) return [...texts(node.whenTrue), ...texts(node.whenFalse)];
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return product(texts(node.left), texts(node.right));
    if (ts.isTemplateExpression(node)) return node.templateSpans.reduce((out, span) => product(product(out, texts(span.expression)), [span.literal.text]), [node.head.text]);
    return [value()];
  };
  const worded = (node: ts.Expression): boolean =>
    ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node) || ts.isConditionalExpression(node) || ts.isBinaryExpression(node) || (ts.isParenthesizedExpression(node) && worded(node.expression));
  return worded(message) ? texts(message) : [];
}

// every `new DomainError(code, message)` of the engine, and the posting checks and import lines (`message: …`) that it
// throws joined or shows as they are
function engineMessages(): string[] {
  const out = new Set<string>();
  for (const name of readdirSync(ENGINE).filter((f) => f.endsWith(".ts"))) {
    each(parse(join(ENGINE, name)), (node) => {
      if (ts.isNewExpression(node) && node.expression.getText() === "DomainError" && node.arguments?.[1]) samples(node.arguments[1]).forEach((s) => out.add(s));
      if (ts.isPropertyAssignment(node) && node.name.getText() === "message") samples(node.initializer).forEach((s) => out.add(s));
    });
  }
  return [...out];
}

describe("the engine's refusals, in English", () => {
  const messages = engineMessages();

  it("finds the messages the engine throws", () => {
    expect(messages.length).toBeGreaterThan(250);
  });

  it("has an English sentence for each", () => {
    expect(messages.filter((m) => englishMessage(m) === m)).toEqual([]);
  });

  it("leaves no French behind", () => {
    const french = /[àâçéèêëîïôûùœ«»]|\b(le|la|les|une?|des|du|est|pas|ou|et|déjà|inconnue?)\b/i;
    expect(messages.map((m) => englishMessage(m)).filter((e) => french.test(e.replace(/\bX\d+\b/g, "")))).toEqual([]);
  });

  it("says what a role does not allow", () => {
    const actions = new Set(["cette opération"]);
    for (const name of readdirSync(ENGINE).filter((f) => f.endsWith(".ts"))) {
      each(parse(join(ENGINE, name)), (node) => {
        if (ts.isCallExpression(node) && node.expression.getText() === "requireRole" && node.arguments[2]) samples(node.arguments[2]).forEach((s) => actions.add(s));
      });
    }
    expect(actions.size).toBeGreaterThan(20);
    expect([...actions].filter((what) => englishMessage(`Votre rôle ne permet pas ${what}`).includes(what))).toEqual([]);
  });

  it("keeps the values and says each posting check", () => {
    expect(englishMessage("Facture inconnue")).toBe("Unknown invoice");
    expect(englishMessage("Compte 411000 absent du plan de l'entité")).toBe("Account 411000 is not in the entity's chart");
    expect(englishMessage("Le journal VT porte 1 écriture(s) comptabilisée(s) : conservation obligatoire, il ne peut pas être supprimé")).toBe("Journal VT carries 1 posted entry: it must be kept and cannot be deleted");
    expect(englishMessage("Le code CLI01 existe déjà pour un fournisseur")).toBe("Code CLI01 already exists for a supplier");
    expect(englishMessage("MRU n'est la devise d'aucune entité : saisir le taux vers EUR ou XOF")).toBe("MRU is not the currency of any entity: enter the rate to EUR or XOF");
    expect(englishMessage("Votre rôle ne permet pas de créer un compte bancaire")).toBe("Your role does not allow creating a bank account");
    expect(englishMessage("Aucune ligne · Ligne 2 : 411000 exige un client · Période manquante")).toBe("No lines · Line 2: 411000 requires a customer · Missing period");
  });

  it("returns a sentence nobody listed as it is", () => {
    expect(englishMessage("Something new happened")).toBe("Something new happened");
    expect(englishMessage("")).toBe("");
  });
});

describe("the server's refusals, in English", () => {
  it("says each database guard as errors.ts says it in English", () => {
    const rules = [...readFileSync(join(SERVER, "errors.ts"), "utf8").matchAll(/fr: "([^"]+)", en: "([^"]+)"/g)];
    expect(rules.length).toBeGreaterThan(30);
    expect(rules.filter(([, fr, en]) => englishMessage(fr) !== en)).toEqual([]);
    expect(englishMessage("La modification n'a pas pu être enregistrée.")).toBe("The change could not be saved.");
  });

  it("has an English sentence for each refusal of the replay, the save and the tables", () => {
    const out = new Set<string>();
    for (const name of ["replay.ts", "save.ts", "tables.ts", "record.ts"]) {
      each(parse(join(SERVER, name)), (node) => {
        if (ts.isNewExpression(node) && /^(ReplayError|VanguardSaveError|TableRefusal|Error)$/.test(node.expression.getText()) && node.arguments?.[0]) samples(node.arguments[0]).forEach((s) => out.add(s));
        if (ts.isPropertyAssignment(node) && /^(add|remove)$/.test(node.name.getText())) samples(node.initializer).forEach((s) => out.add(s));
      });
    }
    const french = [...out].filter((m) => /[àâçéèêëîïôûùœ]|\b(le|la|les|une?|des|ce|cette|est|pas)\b/i.test(m));
    expect(french.length).toBeGreaterThan(10);
    expect(french.filter((m) => englishMessage(m) === m)).toEqual([]);
  });
});
