/**
 * Disk cleanup advisor: how much space the regenerable folders take, and a
 * guarded way to reclaim it.
 *
 * Only folders on the explicit allowlist below can ever be deleted — each
 * one is machine-generated and comes back from an install or build. The
 * delete path re-verifies the name against the allowlist, confines the path
 * to the repository, and refuses symlinks.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface CleanupTarget {
  /** Folder name relative to the root, e.g. "node_modules". */
  name: string;
  /** Bytes used (bounded estimate on very large trees). */
  bytes: number;
  /** What running which command brings it back. */
  regeneratedBy: string;
  exists: boolean;
}

export interface CleanupReport {
  targets: CleanupTarget[];
  totalBytes: number;
}

/**
 * The complete set of deletable folders. Everything here is regenerable;
 * nothing here can hold user work.
 */
const CLEANUP_TARGETS: Array<{ name: string; regeneratedBy: string }> = [
  { name: 'node_modules', regeneratedBy: 'the install command (npm/pnpm/yarn/bun install)' },
  { name: 'dist', regeneratedBy: 'the build script' },
  { name: 'build', regeneratedBy: 'the build script' },
  { name: 'out', regeneratedBy: 'the build script' },
  { name: 'coverage', regeneratedBy: 'the coverage script' },
  { name: '.next', regeneratedBy: 'the Next.js dev or build command' },
  { name: '.nuxt', regeneratedBy: 'the Nuxt dev or build command' },
  { name: '.output', regeneratedBy: 'the build script' },
  { name: '.svelte-kit', regeneratedBy: 'the SvelteKit dev or build command' },
  { name: '.turbo', regeneratedBy: 'Turborepo (rebuilds its cache automatically)' },
  { name: '.cache', regeneratedBy: 'the tools that use it (rebuilt automatically)' },
  { name: '.parcel-cache', regeneratedBy: 'Parcel (rebuilds automatically)' },
  { name: '.vite', regeneratedBy: 'Vite (rebuilds automatically)' },
  { name: 'tmp', regeneratedBy: 'whatever wrote it (temporary files)' },
  { name: '.eslintcache', regeneratedBy: 'ESLint (rebuilds automatically)' }
];

const SIZE_SCAN_FILE_CAP = 20_000;

/** Bounded recursive directory size (files counted until the cap). */
async function directorySize(dir: string): Promise<number> {
  let total = 0;
  let counted = 0;
  const queue = [dir];
  while (queue.length > 0 && counted < SIZE_SCAN_FILE_CAP) {
    const current = queue.shift() as string;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (counted >= SIZE_SCAN_FILE_CAP) {
        break;
      }
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(target);
      } else if (entry.isFile()) {
        counted += 1;
        try {
          total += (await fs.stat(target)).size;
        } catch {
          // Unreadable file — skip.
        }
      }
    }
  }
  return total;
}

/** Report every allowlisted folder that exists and how big it is. */
export async function buildCleanupReport(root: string): Promise<CleanupReport> {
  const targets: CleanupTarget[] = [];
  for (const candidate of CLEANUP_TARGETS) {
    const absPath = path.join(root, candidate.name);
    let exists = false;
    let bytes = 0;
    try {
      const stat = await fs.lstat(absPath);
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        exists = true;
        bytes = await directorySize(absPath);
      } else if (stat.isFile()) {
        exists = true;
        bytes = stat.size;
      }
    } catch {
      // Not present.
    }
    if (exists) {
      targets.push({ name: candidate.name, bytes, regeneratedBy: candidate.regeneratedBy, exists });
    }
  }
  targets.sort((left, right) => right.bytes - left.bytes);
  return { targets, totalBytes: targets.reduce((sum, target) => sum + target.bytes, 0) };
}

export type CleanupResult =
  | { deleted: true; name: string; bytes: number }
  | { deleted: false; name: string; reason: string };

/** Delete one allowlisted folder. Every guard re-checks at delete time. */
export async function deleteCleanupTarget(root: string, name: string): Promise<CleanupResult> {
  const allowed = CLEANUP_TARGETS.find((candidate) => candidate.name === name);
  if (allowed === undefined) {
    return { deleted: false, name, reason: 'That folder is not on the safe-to-delete list.' };
  }
  const absPath = path.join(root, name);
  const relative = path.relative(path.resolve(root), path.resolve(absPath));
  if (relative !== name) {
    return { deleted: false, name, reason: 'Path escaped the project folder.' };
  }
  let stat;
  try {
    stat = await fs.lstat(absPath);
  } catch {
    return { deleted: false, name, reason: 'It does not exist (already clean).' };
  }
  if (stat.isSymbolicLink()) {
    return { deleted: false, name, reason: 'It is a symbolic link, which is never deleted.' };
  }
  const bytes = stat.isDirectory() ? await directorySize(absPath) : stat.size;
  try {
    await fs.rm(absPath, { recursive: true, force: true });
    return { deleted: true, name, bytes };
  } catch (error) {
    return {
      deleted: false,
      name,
      reason:
        error instanceof Error && /EBUSY|EPERM/.test(error.message)
          ? 'A running program is holding it open — stop dev servers and try again.'
          : 'Deleting failed.'
    };
  }
}
