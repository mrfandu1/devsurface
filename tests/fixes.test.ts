import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyFix, listAvailableFixes } from '../src/core/fixes/index.js';
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

describe('one-click fixes', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('appends .env to .gitignore without touching existing content', async () => {
    await fs.writeFile(path.join(root, '.env'), 'KEY=value\n');
    await fs.writeFile(path.join(root, '.gitignore'), 'dist\n');
    const result = await applyFix(root, 'env-not-gitignored');
    expect(result.applied).toBe(true);
    const gitignore = await fs.readFile(path.join(root, '.gitignore'), 'utf8');
    expect(gitignore).toBe('dist\n.env\n');
  });

  it('creates a .dockerignore but never overwrites one', async () => {
    const first = await applyFix(root, 'missing-dockerignore');
    expect(first.applied).toBe(true);
    const content = await fs.readFile(path.join(root, '.dockerignore'), 'utf8');
    expect(content).toContain('node_modules');
    expect(content).toContain('.env');

    await fs.writeFile(path.join(root, '.dockerignore'), 'custom\n');
    const second = await applyFix(root, 'missing-dockerignore');
    expect(second.applied).toBe(false);
    expect(await fs.readFile(path.join(root, '.dockerignore'), 'utf8')).toBe('custom\n');
  });

  it('creates .env.example from local keys without copying values', async () => {
    await fs.writeFile(path.join(root, '.env'), 'API_KEY=super-secret\nPORT=3000\n');
    const result = await applyFix(root, 'missing-env-example');
    expect(result.applied).toBe(true);
    const example = await fs.readFile(path.join(root, '.env.example'), 'utf8');
    expect(example).toContain('API_KEY=');
    expect(example).toContain('PORT=');
    expect(example).not.toContain('super-secret');
    expect(example).not.toContain('3000');
  });

  it('creates .env from the example when it is missing', async () => {
    await fs.writeFile(path.join(root, '.env.example'), 'API_KEY=\n');
    const result = await applyFix(root, 'missing-env');
    expect(result.applied).toBe(true);
    expect(await fs.readFile(path.join(root, '.env'), 'utf8')).toBe('API_KEY=\n');
  });

  it('creates a starter README with the project name and dev script', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'demo',
      scripts: { dev: 'vite' }
    });
    const result = await applyFix(root, 'missing-readme');
    expect(result.applied).toBe(true);
    const readme = await fs.readFile(path.join(root, 'README.md'), 'utf8');
    expect(readme).toContain('npm run dev');
  });

  it('refuses unknown warning ids and inapplicable fixes', async () => {
    expect((await applyFix(root, 'made-up-warning')).applied).toBe(false);
    // No .env.example exists, so missing-env does not apply.
    expect((await applyFix(root, 'missing-env')).applied).toBe(false);
  });

  it('lists only the fixes that apply to the current state', async () => {
    await fs.writeFile(path.join(root, '.env.example'), 'API_KEY=\n');
    const fixes = await listAvailableFixes(root);
    const ids = fixes.map((fix) => fix.warningId);
    expect(ids).toContain('missing-env');
    expect(ids).not.toContain('missing-env-example');
  });
});
