import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectToolchain } from '../src/core/scanner/toolchain.js';
import { detectDependencies } from '../src/core/scanner/dependencies.js';
import type { PackageJsonInfo } from '../src/core/types.js';
import { makeTempProject, mkdirp, removeTempProject } from './testUtils.js';

function packageJson(root: string, data: PackageJsonInfo['data']): PackageJsonInfo {
  return { path: path.join(root, 'package.json'), data };
}

describe('toolchain v0.13 additions', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('reports the TypeScript version range', async () => {
    const toolchain = await detectToolchain(
      root,
      packageJson(root, { devDependencies: { typescript: '^5.6.0' } })
    );
    expect(toolchain.typescript).toBe('^5.6.0');
  });

  it('detects git hook managers from deps and marker files', async () => {
    expect(
      (await detectToolchain(root, packageJson(root, { devDependencies: { husky: '^9' } })))
        .gitHooks
    ).toBe('Husky');

    await mkdirp(path.join(root, '.husky'));
    expect((await detectToolchain(root, null)).gitHooks).toBe('Husky');

    const preCommitRoot = await makeTempProject();
    await fs.writeFile(path.join(preCommitRoot, '.pre-commit-config.yaml'), 'repos: []\n', 'utf8');
    expect((await detectToolchain(preCommitRoot, null)).gitHooks).toBe('pre-commit');
    await removeTempProject(preCommitRoot);
  });

  it('extracts the pinned package manager version', async () => {
    const info = await detectDependencies(
      root,
      packageJson(root, { packageManager: 'pnpm@9.1.0+sha256.abc' }),
      'pnpm'
    );
    // The integrity hash after "+" is noise for display purposes.
    expect(info?.pinnedManagerVersion).toBe('9.1.0');

    const none = await detectDependencies(root, packageJson(root, {}), 'npm');
    expect(none?.pinnedManagerVersion).toBeNull();
  });
});
