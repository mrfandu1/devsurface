import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PackageJsonInfo } from '../types.js';

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function readPackageJson(root: string): Promise<PackageJsonInfo | null> {
  const packageJsonPath = path.join(root, 'package.json');

  try {
    const [realRoot, realPackageJsonPath] = await Promise.all([
      fs.realpath(root),
      fs.realpath(packageJsonPath)
    ]);
    if (!isWithinRoot(realRoot, realPackageJsonPath)) {
      return null;
    }

    const content = await fs.readFile(realPackageJsonPath, 'utf8');
    const data = JSON.parse(content) as PackageJsonInfo['data'];
    return { path: realPackageJsonPath, data };
  } catch {
    return null;
  }
}
