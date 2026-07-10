/**
 * Pinned (favorite) scripts, stored per project root in localStorage so they
 * survive reloads but never touch the repository.
 */

const PIN_STORAGE_PREFIX = 'devsurface-pins:';

type PinStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function pinStorageKey(root: string): string {
  return `${PIN_STORAGE_PREFIX}${root}`;
}

export function readPinnedScripts(storage: PinStorage | null, root: string): string[] {
  try {
    const raw = storage?.getItem(pinStorageKey(root));
    const parsed: unknown = raw === null || raw === undefined ? [] : JSON.parse(raw);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function togglePinnedScript(
  storage: PinStorage | null,
  root: string,
  script: string
): string[] {
  const current = readPinnedScripts(storage, root);
  const next = current.includes(script)
    ? current.filter((item) => item !== script)
    : [...current, script];
  try {
    storage?.setItem(pinStorageKey(root), JSON.stringify(next));
  } catch {
    // Storage unavailable — pinning still works for this session via state.
  }
  return next;
}

/** Order script names with pinned ones first (each group keeps its order). */
export function orderWithPins(scripts: string[], pinned: string[]): string[] {
  const pinnedSet = new Set(pinned);
  return [
    ...scripts.filter((script) => pinnedSet.has(script)),
    ...scripts.filter((script) => !pinnedSet.has(script))
  ];
}
