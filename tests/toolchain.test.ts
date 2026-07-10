import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectNodeRequirement, detectToolchain } from '../src/core/scanner/toolchain.js';
import type { PackageJsonInfo } from '../src/core/types.js';
import { makeTempProject, mkdirp, removeTempProject } from './testUtils.js';

function packageJson(root: string, data: PackageJsonInfo['data']): PackageJsonInfo {
  return { path: path.join(root, 'package.json'), data };
}

describe('detectToolchain', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('identifies tools per category from dependencies', async () => {
    const toolchain = await detectToolchain(
      root,
      packageJson(root, {
        devDependencies: {
          vitest: '^4',
          eslint: '^8',
          prettier: '^3',
          tsup: '^8'
        },
        dependencies: { 'drizzle-orm': '^0.30', tailwindcss: '^3' }
      })
    );

    expect(toolchain.testRunner).toBe('Vitest');
    expect(toolchain.linter).toBe('ESLint');
    expect(toolchain.formatter).toBe('Prettier');
    expect(toolchain.bundler).toBe('tsup');
    expect(toolchain.orm).toBe('Drizzle');
    expect(toolchain.styling).toBe('Tailwind CSS');
    expect(toolchain.ci).toBeNull();
  });

  it('detects the CI provider from config files', async () => {
    await mkdirp(path.join(root, '.github', 'workflows'));
    const toolchain = await detectToolchain(root, packageJson(root, {}));
    expect(toolchain.ci).toBe('GitHub Actions');
  });

  it('returns all-null for projects without recognizable tools', async () => {
    const toolchain = await detectToolchain(root, null);
    expect(Object.values(toolchain).every((tool) => tool === null)).toBe(true);
  });
});

describe('detectNodeRequirement', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('prefers engines.node over version files', async () => {
    await fs.writeFile(path.join(root, '.nvmrc'), '18\n', 'utf8');
    const requirement = await detectNodeRequirement(
      root,
      packageJson(root, { engines: { node: '>=20' } })
    );
    expect(requirement).toBe('>=20');
  });

  it('falls back to .nvmrc, then .node-version', async () => {
    await fs.writeFile(path.join(root, '.node-version'), '22.1.0\n', 'utf8');
    expect(await detectNodeRequirement(root, null)).toBe('22.1.0');

    await fs.writeFile(path.join(root, '.nvmrc'), 'v20\n', 'utf8');
    expect(await detectNodeRequirement(root, null)).toBe('v20');
  });

  it('returns null when nothing pins Node', async () => {
    expect(await detectNodeRequirement(root, packageJson(root, {}))).toBeNull();
  });
});
