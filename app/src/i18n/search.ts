/** Fold Latin accents, preserving marks that distinguish non-Latin letters. */
export function normalizeSearch(value: string, language: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase(language)
    .normalize("NFD")
    .replace(/(\p{Script=Latin})[\u0300-\u036f]+/gu, "$1")
    .normalize("NFC");
}

export function matchesSearch(
  text: string,
  query: string,
  language: string,
): boolean {
  const haystack = normalizeSearch(text, language);
  const tokens = normalizeSearch(query, language).split(/\s+/u).filter(Boolean);
  return tokens.every((token) => haystack.includes(token));
}
