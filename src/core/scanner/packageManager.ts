import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PackageManager } from '../types.js';

const lockFiles: Array<{ file: string; manager: PackageManager }> = [
  { file: 'pnpm-lock.yaml', manager: 'pnpm' },
  { file: 'yarn.lock', manager: 'yarn' },
  { file: 'bun.lockb', manager: 'bun' },
  { file: 'bun.lock', manager: 'bun' },
  { file: 'package-lock.json', manager: 'npm' }
];

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function detectPackageManager(root: string): Promise<PackageManager | null> {
  for (const lockFile of lockFiles) {
    if (await exists(path.join(root, lockFile.file))) {
      return lockFile.manager;
    }
  }

  return null;
}
