import { describe, expect, it } from 'vitest';
import { filterPaletteEntries, type PaletteEntry } from '../src/web/src/palette.js';

function entry(id: string, label: string, extra: Partial<PaletteEntry> = {}): PaletteEntry {
  return { id, label, group: 'Test', ...extra };
}

const entries: PaletteEntry[] = [
  entry('view-scripts', 'Go to Scripts'),
  entry('run-dev', 'Run dev', { hint: 'Starts the development server', keywords: 'vite' }),
  entry('run-build', 'Run build', { hint: 'Builds the app', keywords: 'tsup src/index.ts' }),
  entry('workspace-api', 'Switch to api-server', { group: 'Workspaces' })
];

describe('filterPaletteEntries', () => {
  it('returns everything in order for an empty query', () => {
    expect(filterPaletteEntries(entries, '')).toEqual(entries);
    expect(filterPaletteEntries(entries, '   ')).toEqual(entries);
  });

  it('ranks label prefixes above substring and keyword matches', () => {
    const results = filterPaletteEntries(entries, 'run');
    expect(results[0].id).toBe('run-dev');
    expect(results[1].id).toBe('run-build');
  });

  it('matches at word boundaries inside labels', () => {
    const results = filterPaletteEntries(entries, 'scripts');
    expect(results[0].id).toBe('view-scripts');
  });

  it('falls back to hints and keywords', () => {
    expect(filterPaletteEntries(entries, 'vite')[0]?.id).toBe('run-dev');
    expect(filterPaletteEntries(entries, 'tsup')[0]?.id).toBe('run-build');
  });

  it('drops entries that match nothing', () => {
    expect(filterPaletteEntries(entries, 'zzzz')).toEqual([]);
  });

  it('is case-insensitive', () => {
    expect(filterPaletteEntries(entries, 'RUN DEV'.toLowerCase())[0]?.id).toBe('run-dev');
    expect(filterPaletteEntries(entries, 'Api-Server')[0]?.id).toBe('workspace-api');
  });
});
