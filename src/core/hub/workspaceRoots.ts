import { promises as fs } from 'node:fs';
import path from 'node:path';

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function configuredWorkspaceRoots(): Promise<string[]> {
  const raw = process.env.DEVSURFACE_WORKSPACE_ROOTS;
  if (!raw) {
    return [];
  }

  const roots: string[] = [];
  for (const entry of raw.split(',')) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }

    try {
      roots.push(await fs.realpath(path.resolve(trimmed)));
    } catch {
      // Skip invalid roots.
    }
  }

  return roots;
}

export async function assertWithinWorkspaceRoots(targetPath: string): Promise<void> {
  const roots = await configuredWorkspaceRoots();
  if (roots.length === 0) {
    return;
  }

  for (const root of roots) {
    if (isWithinRoot(root, targetPath)) {
      return;
    }
  }

  throw new Error('Path must be inside a configured workspace root.');
}
