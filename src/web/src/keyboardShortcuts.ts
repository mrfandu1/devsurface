export type DashboardShortcutView =
  | 'overview'
  | 'scripts'
  | 'environment'
  | 'ports'
  | 'services'
  | 'health'
  | 'logs'
  | 'settings';

export type DashboardShortcutAction =
  | { type: 'closeDrawer' }
  | { type: 'refresh' }
  | { type: 'toggleSidebar' }
  | { type: 'view'; view: DashboardShortcutView };

interface DashboardShortcutTarget {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

export interface DashboardShortcutEvent {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  isComposing?: boolean;
  target: DashboardShortcutTarget | EventTarget | null;
}

const VIEW_SHORTCUTS = new Map<string, DashboardShortcutView>([
  ['1', 'overview'],
  ['2', 'scripts'],
  ['3', 'environment'],
  ['4', 'ports'],
  ['5', 'services'],
  ['6', 'health'],
  ['7', 'logs']
]);

function isShortcutBlockedTarget(target: DashboardShortcutEvent['target']): boolean {
  const candidate = target as DashboardShortcutTarget | null;
  const tagName = candidate?.tagName?.toLowerCase();
  if (tagName === 'input' || tagName === 'textarea' || tagName === 'select') {
    return true;
  }

  if (candidate?.isContentEditable === true) {
    return true;
  }

  return candidate?.getAttribute?.('role')?.toLowerCase() === 'textbox';
}

export function getDashboardShortcut(
  event: DashboardShortcutEvent
): DashboardShortcutAction | null {
  if (event.isComposing === true || isShortcutBlockedTarget(event.target)) {
    return null;
  }

  if (event.key === 'Escape') {
    return { type: 'closeDrawer' };
  }

  const hasAnyModifier = event.altKey || event.ctrlKey || event.metaKey || event.shiftKey;
  if (event.key === 'F5' && !hasAnyModifier) {
    return { type: 'refresh' };
  }

  if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey) {
    return event.key.toLowerCase() === 'b' ? { type: 'toggleSidebar' } : null;
  }

  if (hasAnyModifier) {
    return null;
  }

  const view = VIEW_SHORTCUTS.get(event.key);
  if (view !== undefined) {
    return { type: 'view', view };
  }

  if (event.key === ',') {
    return { type: 'view', view: 'settings' };
  }

  return null;
}
