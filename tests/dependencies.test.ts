import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectDependencies } from '../src/core/scanner/dependencies.js';
import type { PackageJsonInfo } from '../src/core/types.js';
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

describe('detectDependencies', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  async function writePackage(data: PackageJsonInfo['data']): Promise<PackageJsonInfo> {
    const packagePath = path.join(root, 'package.json');
    await writeJson(packagePath, data);
    return { path: packagePath, data };
  }

  it('returns null without a package.json', async () => {
    expect(await detectDependencies(root, null, 'npm')).toBeNull();
  });

  it('counts runtime and dev dependencies', async () => {
    const packageJson = await writePackage({
      name: 'x',
      dependencies: { hono: '^4', yaml: '^2' },
      devDependencies: { vitest: '^4' }
    });
    const info = await detectDependencies(root, packageJson, 'npm');
    expect(info?.runtimeCount).toBe(2);
    expect(info?.devCount).toBe(1);
    expect(info?.lockfile).toBeNull();
    expect(info?.lockfileStale).toBe(false);
  });

  it('finds the lockfile that matches the package manager', async () => {
    const packageJson = await writePackage({ name: 'x' });
    await fs.writeFile(path.join(root, 'pnpm-lock.yaml'), '', 'utf8');
    const info = await detectDependencies(root, packageJson, 'pnpm');
    expect(info?.lockfile).toBe('pnpm-lock.yaml');
    expect(info?.lockfileStale).toBe(false);
  });

  it('flags a stale lockfile when package.json is much newer', async () => {
    const packageJson = await writePackage({ name: 'x' });
    const lockPath = path.join(root, 'package-lock.json');
    await fs.writeFile(lockPath, '{}', 'utf8');
    // Age the lockfile by ten minutes relative to package.json.
    const past = new Date(Date.now() - 10 * 60_000);
    await fs.utimes(lockPath, past, past);

    const info = await detectDependencies(root, packageJson, 'npm');
    expect(info?.lockfileStale).toBe(true);
  });

  it('does not flag small modification-time gaps', async () => {
    const packageJson = await writePackage({ name: 'x' });
    const lockPath = path.join(root, 'package-lock.json');
    await fs.writeFile(lockPath, '{}', 'utf8');
    const past = new Date(Date.now() - 30_000);
    await fs.utimes(lockPath, past, past);

    const info = await detectDependencies(root, packageJson, 'npm');
    expect(info?.lockfileStale).toBe(false);
  });
});
