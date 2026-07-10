import { describe, expect, it } from 'vitest';
import {
  isThemePreference,
  readStoredThemePreference,
  resolveTheme,
  toggledTheme,
  THEME_STORAGE_KEY
} from '../src/web/src/theme';

describe('theme helpers', () => {
  it('resolves the system preference against the OS setting', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('toggles to the opposite explicit theme', () => {
    expect(toggledTheme('dark')).toBe('light');
    expect(toggledTheme('light')).toBe('dark');
  });

  it('validates stored preferences', () => {
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('blue')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });

  it('falls back to system for missing or corrupted storage', () => {
    expect(readStoredThemePreference(null)).toBe('system');
    expect(readStoredThemePreference({ getItem: () => null })).toBe('system');
    expect(readStoredThemePreference({ getItem: () => 'garbage' })).toBe('system');
    expect(
      readStoredThemePreference({
        getItem: (key) => (key === THEME_STORAGE_KEY ? 'dark' : null)
      })
    ).toBe('dark');
    expect(
      readStoredThemePreference({
        getItem: () => {
          throw new Error('denied');
        }
      })
    ).toBe('system');
  });
});
