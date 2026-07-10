import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { minimumNodeMajor, runDoctor } from '../src/core/doctor/index.js';
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

describe('minimumNodeMajor', () => {
  it('reads the minimum major from common range syntaxes', () => {
    expect(minimumNodeMajor('>=18')).toBe(18);
    expect(minimumNodeMajor('^20.10.0')).toBe(20);
    expect(minimumNodeMajor('~22.1')).toBe(22);
    expect(minimumNodeMajor('18.x')).toBe(18);
    expect(minimumNodeMajor('>=18 <21')).toBe(18);
    expect(minimumNodeMajor('v20')).toBe(20);
  });

  it('refuses to judge complex or empty ranges', () => {
    expect(minimumNodeMajor('^18 || ^20')).toBeNull();
    expect(minimumNodeMajor('')).toBeNull();
    expect(minimumNodeMajor('lts/*')).toBeNull();
  });
});

describe('new doctor checks', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('warns when the lockfile is older than package.json', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x', scripts: {} });
    const lockPath = path.join(root, 'package-lock.json');
    await fs.writeFile(lockPath, '{}', 'utf8');
    const past = new Date(Date.now() - 10 * 60_000);
    await fs.utimes(lockPath, past, past);

    const warnings = await runDoctor(root);
    expect(warnings.some((warning) => warning.id === 'stale-lockfile')).toBe(true);
  });

  it('warns when the running Node is below engines.node', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'x',
      engines: { node: '>=99' }
    });

    const warnings = await runDoctor(root);
    expect(warnings.some((warning) => warning.id === 'engines-node-mismatch')).toBe(true);
  });

  it('stays quiet when the running Node satisfies engines.node', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'x',
      engines: { node: '>=18' }
    });

    const warnings = await runDoctor(root);
    expect(warnings.some((warning) => warning.id === 'engines-node-mismatch')).toBe(false);
  });

  it('suggests committing a .env.example when only .env exists', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await fs.writeFile(path.join(root, '.env'), 'KEY=value\n', 'utf8');

    const warnings = await runDoctor(root);
    expect(warnings.some((warning) => warning.id === 'missing-env-example')).toBe(true);
  });

  it('points out a missing LICENSE in git repositories', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await fs.mkdir(path.join(root, '.git'));
    await fs.writeFile(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');

    const warnings = await runDoctor(root);
    const licenseWarning = warnings.find((warning) => warning.id === 'missing-license');
    expect(licenseWarning?.severity).toBe('info');
  });
});
