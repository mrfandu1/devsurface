import { describe, expect, it } from 'vitest';
import { getDashboardShortcut } from '../src/web/src/keyboardShortcuts';

function event(key: string, overrides: Record<string, unknown> = {}) {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: null,
    ...overrides
  };
}

describe('shortcuts help binding', () => {
  it('maps "?" (with or without shift) to the shortcuts overlay', () => {
    expect(getDashboardShortcut(event('?'))).toEqual({ type: 'shortcutsHelp' });
    expect(getDashboardShortcut(event('?', { shiftKey: true }))).toEqual({
      type: 'shortcutsHelp'
    });
  });

  it('does not fire while typing in an input', () => {
    expect(getDashboardShortcut(event('?', { target: { tagName: 'INPUT' } }))).toBeNull();
  });

  it('does not fire with control held', () => {
    expect(getDashboardShortcut(event('?', { ctrlKey: true }))).toBeNull();
  });
});
