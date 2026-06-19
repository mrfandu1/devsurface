import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PackageJsonInfo } from '../types.js';

export async function readPackageJson(root: string): Promise<PackageJsonInfo | null> {
  const packageJsonPath = path.join(root, 'package.json');

  try {
    const content = await fs.readFile(packageJsonPath, 'utf8');
    const data = JSON.parse(content) as PackageJsonInfo['data'];
    return { path: packageJsonPath, data };
  } catch {
    return null;
  }
}
