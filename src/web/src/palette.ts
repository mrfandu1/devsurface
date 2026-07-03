/**
 * Pure matching logic for the Ctrl+K command palette, kept out of the React
 * component so it can be unit-tested directly.
 */

export interface PaletteEntry {
  id: string;
  /** Primary display text, matched first. */
  label: string;
  /** Secondary display text (explanation, path, command). */
  hint?: string;
  /** Group heading shown in the list. */
  group: string;
  /** Extra match terms that are not displayed. */
  keywords?: string;
}

function score(entry: PaletteEntry, query: string): number {
  const label = entry.label.toLowerCase();
  if (label === query) {
    return 100;
  }
  if (label.startsWith(query)) {
    return 80;
  }
  const wordStart = label.split(/[\s:/-]+/).some((word) => word.startsWith(query));
  if (wordStart) {
    return 60;
  }
  if (label.includes(query)) {
    return 40;
  }
  const haystack = `${entry.hint ?? ''} ${entry.keywords ?? ''} ${entry.group}`.toLowerCase();
  if (haystack.includes(query)) {
    return 20;
  }
  return 0;
}

/**
 * Rank entries against a query. An empty query returns everything in the
 * original order so the palette doubles as a browsable menu.
 */
export function filterPaletteEntries<T extends PaletteEntry>(entries: T[], query: string): T[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) {
    return entries;
  }
  return entries
    .map((entry, index) => ({ entry, index, rank: score(entry, trimmed) }))
    .filter((candidate) => candidate.rank > 0)
    .sort((left, right) => right.rank - left.rank || left.index - right.index)
    .map((candidate) => candidate.entry);
}
