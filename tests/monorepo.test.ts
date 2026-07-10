import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectMonorepo, resolveWorkspacePackages } from '../src/core/scanner/monorepo.js';
import type { PackageJsonInfo } from '../src/core/types.js';
import { makeTempProject, mkdirp, removeTempProject, writeJson } from './testUtils.js';

function packageJson(root: string, data: PackageJsonInfo['data']): PackageJsonInfo {
  return { path: path.join(root, 'package.json'), data };
}

describe('detectMonorepo', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('returns null for single-package repositories', async () => {
    expect(await detectMonorepo(root, packageJson(root, { name: 'solo' }))).toBeNull();
    expect(await detectMonorepo(root, null)).toBeNull();
  });

  it('detects package.json workspaces and resolves member packages', async () => {
    await mkdirp(path.join(root, 'packages', 'web'));
    await mkdirp(path.join(root, 'packages', 'api'));
    await mkdirp(path.join(root, 'packages', 'not-a-package'));
    await writeJson(path.join(root, 'packages', 'web', 'package.json'), { name: '@acme/web' });
    await writeJson(path.join(root, 'packages', 'api', 'package.json'), { name: '@acme/api' });

    const info = await detectMonorepo(
      root,
      packageJson(root, { name: 'acme', workspaces: ['packages/*'] })
    );

    expect(info?.tools).toEqual(['workspaces']);
    expect(info?.packageCount).toBe(2);
    expect(info?.packages).toEqual([
      { name: '@acme/api', dir: 'packages/api', scriptCount: 0 },
      { name: '@acme/web', dir: 'packages/web', scriptCount: 0 }
    ]);
  });

  it('supports the object form of workspaces', async () => {
    await mkdirp(path.join(root, 'apps', 'site'));
    await writeJson(path.join(root, 'apps', 'site', 'package.json'), { name: 'site' });

    const info = await detectMonorepo(
      root,
      packageJson(root, { name: 'acme', workspaces: { packages: ['apps/*'] } })
    );
    expect(info?.packageCount).toBe(1);
    expect(info?.packages[0]).toEqual({ name: 'site', dir: 'apps/site', scriptCount: 0 });
  });

  it('detects pnpm workspaces from pnpm-workspace.yaml', async () => {
    await fs.writeFile(
      path.join(root, 'pnpm-workspace.yaml'),
      'packages:\n  - "packages/*"\n',
      'utf8'
    );
    await mkdirp(path.join(root, 'packages', 'core'));
    await writeJson(path.join(root, 'packages', 'core', 'package.json'), { name: 'core' });

    const info = await detectMonorepo(root, packageJson(root, { name: 'acme' }));
    expect(info?.tools).toEqual(['pnpm workspaces']);
    expect(info?.packageCount).toBe(1);
  });

  it('detects Turborepo, Nx, and Lerna marker files', async () => {
    await writeJson(path.join(root, 'turbo.json'), {});
    await writeJson(path.join(root, 'nx.json'), {});
    await writeJson(path.join(root, 'lerna.json'), {});

    const info = await detectMonorepo(root, packageJson(root, { name: 'acme' }));
    expect(info?.tools).toEqual(['Turborepo', 'Nx', 'Lerna']);
  });

  it('uses the directory name when a member package has no name', async () => {
    await mkdirp(path.join(root, 'packages', 'unnamed'));
    await writeJson(path.join(root, 'packages', 'unnamed', 'package.json'), {});

    const packages = await resolveWorkspacePackages(root, ['packages/*']);
    expect(packages).toEqual([{ name: 'unnamed', dir: 'packages/unnamed', scriptCount: 0 }]);
  });

  it('ignores negated globs and mid-path wildcards', async () => {
    await mkdirp(path.join(root, 'packages', 'a'));
    await writeJson(path.join(root, 'packages', 'a', 'package.json'), { name: 'a' });

    const packages = await resolveWorkspacePackages(root, ['!packages/a', 'pack*/b']);
    expect(packages).toEqual([]);
  });

  it('resolves explicit directory entries without wildcards', async () => {
    await mkdirp(path.join(root, 'tools', 'cli'));
    await writeJson(path.join(root, 'tools', 'cli', 'package.json'), { name: 'cli' });

    const packages = await resolveWorkspacePackages(root, ['tools/cli']);
    expect(packages).toEqual([{ name: 'cli', dir: 'tools/cli', scriptCount: 0 }]);
  });
});
