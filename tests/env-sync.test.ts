import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectEnv } from '../src/core/scanner/env.js';
import { exampleLinesForKeys, syncEnvFromExample } from '../src/core/env/sync.js';
import { makeTempProject, removeTempProject } from './testUtils.js';

describe('exampleLinesForKeys', () => {
  it('returns matching example lines in file order', () => {
    const content = 'A=1\nB=two\n# comment\nC=\n';
    expect(exampleLinesForKeys(content, ['C', 'A'])).toEqual([
      { key: 'A', line: 'A=1' },
      { key: 'C', line: 'C=' }
    ]);
  });
});

describe('syncEnvFromExample', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('appends missing keys without touching existing values', async () => {
    await fs.writeFile(path.join(root, '.env.example'), 'A=default-a\nB=default-b\n', 'utf8');
    await fs.writeFile(path.join(root, '.env'), 'A=my-real-value\n', 'utf8');

    const result = await syncEnvFromExample(await detectEnv(root));
    expect(result.ok).toBe(true);
    expect(result.added).toEqual(['B']);
    expect(result.created).toBe(false);

    const local = await fs.readFile(path.join(root, '.env'), 'utf8');
    expect(local).toContain('A=my-real-value');
    expect(local).toContain('B=default-b');
    expect(local).not.toContain('A=default-a');
  });

  it('creates .env from the example when none exists', async () => {
    await fs.writeFile(path.join(root, '.env.example'), 'KEY=\n', 'utf8');

    const result = await syncEnvFromExample(await detectEnv(root));
    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);
    expect(result.added).toEqual(['KEY']);
    expect(await fs.readFile(path.join(root, '.env'), 'utf8')).toContain('KEY=');
  });

  it('is a no-op when everything is already present', async () => {
    await fs.writeFile(path.join(root, '.env.example'), 'A=\n', 'utf8');
    await fs.writeFile(path.join(root, '.env'), 'A=set\n', 'utf8');

    const before = await fs.readFile(path.join(root, '.env'), 'utf8');
    const result = await syncEnvFromExample(await detectEnv(root));
    expect(result.added).toEqual([]);
    expect(await fs.readFile(path.join(root, '.env'), 'utf8')).toBe(before);
  });

  it('fails cleanly without an example file', async () => {
    const result = await syncEnvFromExample(null);
    expect(result.ok).toBe(false);
    expect(result.error).toContain('.env.example');
  });
});
