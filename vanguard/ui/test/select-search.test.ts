import { describe, expect, it } from "vitest";

import { highlights, rank, score, termsOf } from "@/vanguard/ui/select-search";

// The dropdowns' search (vanguard/ui/Select.tsx).
const accounts = [
  { label: "401100 Fournisseurs", keywords: "" },
  { label: "411000 Clients", keywords: "" },
  { label: "4110 Clients douteux" },
  { label: "512000 Banque BMCI" },
  { label: "6411 Salaires" },
];

describe("the dropdowns' search", () => {
  it("ignores accents and case, and takes the words in any order", () => {
    expect(termsOf("  Équipe  RÉUNION ")).toEqual(["equipe", "reunion"]);
    expect(rank([{ label: "Compte principal BMCI" }, { label: "Caisse" }], "bmci compte").map((x) => x.label)).toEqual(["Compte principal BMCI"]);
    expect(rank([{ label: "Société Générale" }], "societe gen")).toHaveLength(1);
  });

  it("puts an exact code first, then the label's start, a word's start, anywhere", () => {
    expect(rank(accounts, "411").map((x) => x.label)).toEqual(["411000 Clients", "4110 Clients douteux", "6411 Salaires"]);
    expect(rank(accounts, "4110").map((x) => x.label)[0]).toBe("4110 Clients douteux");
    expect(rank([{ label: "Mission Banque" }, { label: "Banque Populaire" }, { label: "Fabanque" }], "banque").map((x) => x.label)).toEqual(["Banque Populaire", "Mission Banque", "Fabanque"]);
  });

  it("finds hidden keywords, after the labels that match", () => {
    const people = [{ label: "Mariem Sow", keywords: "mariem.sow@bumex.mr Manager BUMEX Audit" }, { label: "Audit Bot" }];
    expect(rank(people, "audit").map((x) => x.label)).toEqual(["Audit Bot", "Mariem Sow"]);
    expect(score({ label: "Mariem Sow", keywords: "manager" }, ["sow", "manager"])).toBe(4);
    expect(score({ label: "Mariem Sow" }, ["xyz"])).toBeNull();
  });

  it("keeps the list's own order without a query", () => {
    expect(rank(accounts, "  ").map((x) => x.label)).toEqual(accounts.map((x) => x.label));
  });

  it("marks where the label matched, accented letters included", () => {
    expect(highlights("Équipe Générale", "equipe gen")).toEqual([[0, 6], [7, 10]]);
    expect(highlights("411000 Clients", "1")).toEqual([[1, 2]]);
    expect(highlights("Finance & administration lead", "a")).toEqual([[10, 11]]);
    expect(highlights("abc", "")).toEqual([]);
  });
});
