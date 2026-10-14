// Text matching shared by the global search and the in-page filters (client and server safe).

/** Lowercases and strips accents, so "Équipe" and "equipe" compare equal. */
export function normalizeSearchText(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleLowerCase()
    .trim();
}

/** Splits a query into normalized words. */
export function searchTerms(query: string) {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

/** True when every word of the query appears somewhere in the given values, in any order. */
export function matchesSearchTerms(terms: string[], values: Array<string | null | undefined>) {
  if (!terms.length) return true;
  const haystack = normalizeSearchText(values.filter(Boolean).join(" "));
  return terms.every((term) => haystack.includes(term));
}
