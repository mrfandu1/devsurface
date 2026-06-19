import { describe, expect, it } from 'vitest';
import { getDashboardShortcut } from '../src/web/src/keyboardShortcuts.js';

function keyEvent(
  key: string,
  options: Partial<Parameters<typeof getDashboardShortcut>[0]> = {}
): Parameters<typeof getDashboardShortcut>[0] {
  return {
    key,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    isComposing: false,
    target: null,
    ...options
  };
}

describe('dashboard keyboard shortcuts', () => {
  it('maps number keys to dashboard sections', () => {
    expect(getDashboardShortcut(keyEvent('1'))).toEqual({
      type: 'view',
      view: 'overview'
    });
    expect(getDashboardShortcut(keyEvent('2'))).toEqual({
      type: 'view',
      view: 'scripts'
    });
    expect(getDashboardShortcut(keyEvent('7'))).toEqual({
      type: 'view',
      view: 'logs'
    });
  });

  it('maps utility shortcuts', () => {
    expect(getDashboardShortcut(keyEvent('F5'))).toEqual({ type: 'refresh' });
    expect(getDashboardShortcut(keyEvent('Escape'))).toEqual({ type: 'closeDrawer' });
    expect(getDashboardShortcut(keyEvent(','))).toEqual({ type: 'view', view: 'settings' });
    expect(getDashboardShortcut(keyEvent('b', { ctrlKey: true }))).toEqual({
      type: 'toggleSidebar'
    });
  });

  it('ignores shortcuts while text controls have focus', () => {
    expect(
      getDashboardShortcut(
        keyEvent('2', {
          target: {
            tagName: 'input'
          }
        })
      )
    ).toBeNull();

    expect(
      getDashboardShortcut(
        keyEvent('F5', {
          target: {
            isContentEditable: true
          }
        })
      )
    ).toBeNull();

    expect(
      getDashboardShortcut(
        keyEvent(',', {
          target: {
            getAttribute: (name) => (name === 'role' ? 'textbox' : null)
          }
        })
      )
    ).toBeNull();
  });

  it('ignores composing and modified view shortcuts', () => {
    expect(getDashboardShortcut(keyEvent('1', { isComposing: true }))).toBeNull();
    expect(getDashboardShortcut(keyEvent('1', { shiftKey: true }))).toBeNull();
    expect(getDashboardShortcut(keyEvent('r', { ctrlKey: true }))).toBeNull();
  });
});
