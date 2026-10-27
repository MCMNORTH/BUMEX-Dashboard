// [bumex-one] The dropdowns' search (ui/Select.tsx): accents and case ignored, the words in any order, the best
// matches first (an exact code, then the label's start, a word's start, anywhere in the label, then only in the hidden
// keywords: an e-mail, a code, a city…), and where the label matched, for the highlight.

export type SearchItem = { label: string; keywords?: string };

/** Lowercase, without accents, character by character, with where each character came from in the label. */
function fold(text: string): { folded: string; from: number[] } {
  let folded = '';
  const from: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const c = text[i].normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase();
    for (const ch of c) {
      folded += ch;
      from.push(i);
    }
  }
  return { folded, from };
}

export const normalize = (text: string) => fold(text).folded.trim();
export const termsOf = (query: string) => normalize(query).split(/\s+/).filter(Boolean);

const wordStart = (text: string, at: number) => at === 0 || /[^\p{L}\p{N}]/u.test(text[at - 1]);

/** 0 best … 4 keywords only; null when a word of the query is nowhere. */
export function score(item: SearchItem, terms: string[]): number | null {
  if (!terms.length) return 0;
  const label = fold(item.label).folded;
  const extra = item.keywords ? fold(item.keywords).folded : '';
  if (!terms.every((t) => label.includes(t) || extra.includes(t))) return null;
  const whole = terms.join(' ');
  const first = label.split(/[\s·—–-]+/).find(Boolean) ?? '';
  if (first === whole || label.trim() === whole) return 0;
  if (label.startsWith(whole)) return 1;
  const inLabel = terms.every((t) => label.includes(t));
  if (inLabel && terms.every((t) => { for (let at = label.indexOf(t); at >= 0; at = label.indexOf(t, at + 1)) if (wordStart(label, at)) return true; return false; })) return 2;
  if (inLabel) return 3;
  return 4;
}

/** The items that match, best first, ties in their own order. */
export function rank<T extends SearchItem>(items: readonly T[], query: string): T[] {
  const terms = termsOf(query);
  if (!terms.length) return [...items];
  return items
    .map((item, i) => ({ item, i, s: score(item, terms) }))
    .filter((x): x is { item: T; i: number; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || a.i - b.i)
    .map((x) => x.item);
}

/** The label's [start, end) ranges the query's words cover (each once), merged. */
export function highlights(label: string, query: string): [number, number][] {
  const terms = termsOf(query);
  if (!terms.length) return [];
  const { folded, from } = fold(label);
  const ranges: [number, number][] = [];
  // each word once: where a word of the label starts with it, else its first place
  for (const t of terms) {
    let at = folded.indexOf(t);
    for (let i = at; i >= 0; i = folded.indexOf(t, i + 1)) if (wordStart(folded, i)) { at = i; break; }
    if (at >= 0) ranges.push([from[at], from[at + t.length - 1] + 1]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else merged.push([...r]);
  }
  return merged;
}
