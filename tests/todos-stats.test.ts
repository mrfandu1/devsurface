import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanTodos } from '../src/core/todos/index.js';
import { computeCodeStats, formatBytes } from '../src/core/stats/index.js';
import { makeTempProject, mkdirp, removeTempProject } from './testUtils.js';

describe('scanTodos', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('finds TODO-style comments across comment syntaxes', async () => {
    await fs.writeFile(
      path.join(root, 'app.ts'),
      ['// TODO: wire up the login page', 'const x = 1;', '/* FIXME broken on Safari */'].join('\n')
    );
    await fs.writeFile(path.join(root, 'script.py'), '# HACK: temporary workaround\n');
    const report = await scanTodos(root);
    expect(report.counts.TODO).toBe(1);
    expect(report.counts.FIXME).toBe(1);
    expect(report.counts.HACK).toBe(1);
    const todo = report.items.find((item) => item.marker === 'TODO');
    expect(todo?.text).toBe('wire up the login page');
    expect(todo?.file).toBe('app.ts');
    expect(todo?.line).toBe(1);
  });

  it('orders urgent markers (FIXME/BUG) before TODO and NOTE', async () => {
    await fs.writeFile(
      path.join(root, 'a.js'),
      ['// NOTE: background info', '// TODO: later', '// FIXME: now'].join('\n')
    );
    const report = await scanTodos(root);
    expect(report.items.map((item) => item.marker)).toEqual(['FIXME', 'TODO', 'NOTE']);
  });

  it('skips node_modules and non-source files', async () => {
    await mkdirp(path.join(root, 'node_modules', 'pkg'));
    await fs.writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), '// TODO: hidden\n');
    await fs.writeFile(path.join(root, 'photo.png'), '// TODO: not code\n');
    const report = await scanTodos(root);
    expect(report.items).toHaveLength(0);
  });
});

describe('computeCodeStats', () => {
  it('counts lines by language and finds the largest files', async () => {
    const root = await makeTempProject();
    await fs.writeFile(path.join(root, 'big.ts'), Array(50).fill('const x = 1;').join('\n'));
    await fs.writeFile(path.join(root, 'small.ts'), 'const y = 2;\n');
    await fs.writeFile(path.join(root, 'style.css'), 'body { margin: 0; }\n');
    const stats = await computeCodeStats(root);
    expect(stats.totalFiles).toBe(3);
    const typescript = stats.languages.find((language) => language.language === 'TypeScript');
    expect(typescript?.files).toBe(2);
    expect(stats.largestFiles[0].file).toBe('big.ts');
    await removeTempProject(root);
  });
});

describe('formatBytes', () => {
  it('formats human-readable sizes', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
  });
});
