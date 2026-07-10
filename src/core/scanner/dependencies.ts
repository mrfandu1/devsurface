import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DependencyInfo, PackageJsonInfo, PackageManager } from '../types.js';

const LOCKFILES: Record<PackageManager, string[]> = {
  npm: ['package-lock.json'],
  pnpm: ['pnpm-lock.yaml'],
  yarn: ['yarn.lock'],
  bun: ['bun.lock', 'bun.lockb']
};

async function fileMtime(filePath: string): Promise<number | null> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() ? stat.mtimeMs : null;
  } catch {
    return null;
  }
}

/**
 * Summarize package.json dependencies and check whether the lockfile still
 * matches: a package.json modified after its lockfile usually means someone
 * edited dependencies without running an install.
 */
export async function detectDependencies(
  root: string,
  packageJson: PackageJsonInfo | null,
  packageManager: PackageManager | null
): Promise<DependencyInfo | null> {
  if (packageJson === null) {
    return null;
  }

  const runtimeCount = Object.keys(packageJson.data.dependencies ?? {}).length;
  const devCount = Object.keys(packageJson.data.devDependencies ?? {}).length;

  let lockfile: string | null = null;
  let lockfileStale = false;
  const candidates = packageManager !== null ? LOCKFILES[packageManager] : [];
  for (const candidate of candidates) {
    const lockMtime = await fileMtime(path.join(root, candidate));
    if (lockMtime !== null) {
      lockfile = candidate;
      const packageMtime = await fileMtime(packageJson.path);
      // Editors can rewrite package.json during unrelated saves, so require a
      // clear gap before calling the lockfile stale.
      lockfileStale = packageMtime !== null && packageMtime - lockMtime > 60_000;
      break;
    }
  }

  const pinnedRaw = packageJson.data.packageManager;
  const pinnedMatch =
    typeof pinnedRaw === 'string' ? /^[a-z]+@(\d[\w.-]*)/.exec(pinnedRaw.trim()) : null;
  const pinnedManagerVersion = pinnedMatch?.[1] ?? null;

  return { runtimeCount, devCount, lockfile, lockfileStale, pinnedManagerVersion };
}
