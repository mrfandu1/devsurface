/**
 * Dashboard theme handling: a persisted preference ('system' | 'light' |
 * 'dark') resolved against the OS setting and applied as `data-theme` on the
 * root element. Pure helpers are separated from DOM access for testability.
 */

export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'devsurface-theme';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function resolveTheme(
  preference: ThemePreference,
  systemPrefersDark: boolean
): ResolvedTheme {
  if (preference === 'system') {
    return systemPrefersDark ? 'dark' : 'light';
  }
  return preference;
}

/** The explicit preference a quick-toggle button should switch to next. */
export function toggledTheme(current: ResolvedTheme): ThemePreference {
  return current === 'dark' ? 'light' : 'dark';
}

export function readStoredThemePreference(
  storage: Pick<Storage, 'getItem'> | null
): ThemePreference {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function storeThemePreference(
  storage: Pick<Storage, 'setItem' | 'removeItem'> | null,
  preference: ThemePreference
): void {
  try {
    if (preference === 'system') {
      storage?.removeItem(THEME_STORAGE_KEY);
    } else {
      storage?.setItem(THEME_STORAGE_KEY, preference);
    }
  } catch {
    // Storage may be unavailable (private mode); the theme still applies.
  }
}

export function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;
}

export function applyTheme(preference: ThemePreference): ResolvedTheme {
  const resolved = resolveTheme(preference, systemPrefersDark());
  document.documentElement.dataset.theme = resolved;
  return resolved;
}

/** Apply the stored preference immediately (called before first render). */
export function initTheme(): ThemePreference {
  const preference = readStoredThemePreference(
    typeof window !== 'undefined' ? window.localStorage : null
  );
  applyTheme(preference);
  return preference;
}
