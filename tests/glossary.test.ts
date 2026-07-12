import { describe, expect, it } from 'vitest';
import {
  GLOSSARY,
  GLOSSARY_CATEGORY_LABELS,
  lookupTerm,
  searchGlossary
} from '../src/core/glossary/index.js';

describe('glossary', () => {
  it('has a healthy number of terms, all with categories and definitions', () => {
    expect(GLOSSARY.length).toBeGreaterThanOrEqual(90);
    for (const entry of GLOSSARY) {
      expect(entry.term.length).toBeGreaterThan(0);
      expect(entry.definition.length).toBeGreaterThan(20);
      expect(GLOSSARY_CATEGORY_LABELS[entry.category]).toBeDefined();
    }
  });

  it('has no duplicate terms', () => {
    const names = GLOSSARY.map((entry) => entry.term.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it('looks terms up case-insensitively', () => {
    expect(lookupTerm('LOCKFILE')?.term).toBe('Lockfile');
    expect(lookupTerm('port')?.term).toBe('Port');
  });

  it('matches aliases', () => {
    expect(lookupTerm('repo')?.term).toBe('Repository');
    expect(lookupTerm('yarn')?.term).toBe('Package manager');
    expect(lookupTerm('pr')?.term).toBe('Pull request');
  });

  it('returns null for unknown terms and empty queries', () => {
    expect(lookupTerm('flux capacitor')).toBeNull();
    expect(lookupTerm('   ')).toBeNull();
  });

  it('searches term names, aliases, and definition text', () => {
    const results = searchGlossary('docker');
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.some((entry) => entry.term === 'Docker Compose')).toBe(true);
  });

  it('returns the whole glossary for an empty search', () => {
    expect(searchGlossary('')).toHaveLength(GLOSSARY.length);
  });
});
