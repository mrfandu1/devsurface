import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { analyzeTests, testStemOf } from '../src/core/testinsights/index.js';
import { inspectConfigs, stripJsonComments } from '../src/core/configs/index.js';
import { findBloat } from '../src/core/bloat/index.js';
import { checkLinks } from '../src/core/links/index.js';
import { scoreReadme } from '../src/core/readme/index.js';
import { checkDepsHealth, packageNameOf } from '../src/core/deps/health.js';
import { analyzeCi, extractScriptsUsed } from '../src/core/ci/index.js';
import { draftFromCommits, parseChangelog } from '../src/core/changelog/index.js';
import { groupCommitsByDay } from '../src/core/standup/index.js';
import { makeTempProject, mkdirp, removeTempProject, writeJson } from './testUtils.js';

describe('analyzeTests', () => {
  let root: string;
  beforeEach(async () => {
    root = await makeTempProject();
  });
  afterEach(async () => {
    await removeTempProject(root);
  });

  it('counts tests, skips, and focused blocks', async () => {
    await fs.writeFile(
      path.join(root, 'a.test.ts'),
      [
        "describe('x', () => {",
        "  it('works', () => {});",
        "  it.skip('later', () => {});",
        "  it.only('focus', () => {});",
        '});'
      ].join('\n')
    );
    const report = await analyzeTests(root);
    expect(report.totals.tests).toBe(3);
    expect(report.totals.skipped).toBe(1);
    expect(report.totals.focused).toBe(1);
    expect(report.focusedFiles).toEqual(['a.test.ts']);
  });

  it('finds untested source files', async () => {
    await mkdirp(path.join(root, 'src'));
    await fs.writeFile(path.join(root, 'src', 'widget.ts'), 'export const w = 1;\n');
    const report = await analyzeTests(root);
    expect(report.untestedSources).toContain('src/widget.ts');
  });

  it('normalizes test stems', () => {
    expect(testStemOf('widget.test.ts')).toBe('widget');
    expect(testStemOf('test_widget.py')).toBe('widget');
  });
});

describe('inspectConfigs', () => {
  it('validates JSON and flags broken files', async () => {
    const root = await makeTempProject();
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await fs.writeFile(path.join(root, 'renovate.json'), '{ bad json ');
    const report = await inspectConfigs(root);
    expect(report.files.some((f) => f.file === 'package.json' && f.valid)).toBe(true);
    expect(report.invalid.some((f) => f.file === 'renovate.json')).toBe(true);
    await removeTempProject(root);
  });

  it('strips comments from JSONC before parsing', () => {
    const stripped = stripJsonComments('{ "a": 1, // note\n "b": 2, }');
    expect(JSON.parse(stripped)).toEqual({ a: 1, b: 2 });
  });
});

describe('findBloat', () => {
  it('flags suspicious committed files and largest files', async () => {
    const root = await makeTempProject();
    await fs.writeFile(path.join(root, 'app.min.js'), 'x'.repeat(10));
    await fs.writeFile(path.join(root, 'big.txt'), 'x'.repeat(600 * 1024));
    const report = await findBloat(root);
    expect(report.suspiciousCommitted).toContain('app.min.js');
    expect(report.largest[0].file).toBe('big.txt');
    await removeTempProject(root);
  });
});

describe('checkLinks', () => {
  it('reports broken relative links but not external ones', async () => {
    const root = await makeTempProject();
    await fs.writeFile(
      path.join(root, 'README.md'),
      ['[good](./exists.md)', '[bad](./missing.md)', '[ext](https://example.com)'].join('\n')
    );
    await fs.writeFile(path.join(root, 'exists.md'), '# hi\n');
    const report = await checkLinks(root);
    expect(report.broken).toHaveLength(1);
    expect(report.broken[0].target).toBe('./missing.md');
    expect(report.externalLinks).toBe(1);
    await removeTempProject(root);
  });
});

describe('scoreReadme', () => {
  it('scores a good README highly', async () => {
    const root = await makeTempProject();
    await fs.writeFile(
      path.join(root, 'README.md'),
      [
        '# My Project',
        '',
        'A helpful tool that does a specific useful thing for developers everywhere.',
        '',
        '## Installation',
        '```bash',
        'npm install my-project',
        '```',
        '## Usage',
        'Run `my-project` to start. ' + 'word '.repeat(130),
        '## License',
        'MIT'
      ].join('\n')
    );
    const report = await scoreReadme(root);
    expect(report.exists).toBe(true);
    expect(report.score).toBeGreaterThan(70);
    await removeTempProject(root);
  });

  it('reports a missing README', async () => {
    const root = await makeTempProject();
    const report = await scoreReadme(root);
    expect(report.exists).toBe(false);
    expect(report.score).toBe(0);
    await removeTempProject(root);
  });
});

describe('checkDepsHealth helpers', () => {
  it('reduces specifiers to package names', () => {
    expect(packageNameOf('lodash/fp')).toBe('lodash');
    expect(packageNameOf('@scope/pkg/sub')).toBe('@scope/pkg');
    expect(packageNameOf('./local')).toBeNull();
    expect(packageNameOf('node:fs')).toBeNull();
  });

  it('detects phantom and unused dependencies', async () => {
    const root = await makeTempProject();
    await mkdirp(path.join(root, 'node_modules', 'ghost'));
    await writeJson(path.join(root, 'node_modules', 'ghost', 'package.json'), {
      name: 'ghost',
      version: '1.0.0'
    });
    await fs.writeFile(path.join(root, 'app.ts'), "import { g } from 'ghost';\n");
    const report = await checkDepsHealth(root, {
      path: path.join(root, 'package.json'),
      data: { dependencies: { 'left-pad': '^1.0.0' } }
    });
    expect(report.phantom).toContain('ghost');
    expect(report.unused).toContain('left-pad');
    await removeTempProject(root);
  });
});

describe('analyzeCi', () => {
  it('extracts scripts from a GitHub workflow and finds gaps', async () => {
    const root = await makeTempProject();
    await mkdirp(path.join(root, '.github', 'workflows'));
    await fs.writeFile(
      path.join(root, '.github', 'workflows', 'ci.yml'),
      [
        'name: CI',
        'on: [push]',
        'jobs:',
        '  build:',
        '    steps:',
        '      - run: npm run lint',
        '      - run: npm run ghost-script'
      ].join('\n')
    );
    const report = await analyzeCi(root, { lint: 'eslint .', test: 'vitest' });
    expect(report.configured).toBe(true);
    expect(report.workflows[0].triggers).toContain('push');
    expect(report.missingScripts).toContain('ghost-script');
    expect(report.uncheckedScripts).toContain('test');
    await removeTempProject(root);
  });

  it('collects run scripts from a nested tree', () => {
    expect(extractScriptsUsed({ steps: [{ run: 'npm run build' }] })).toContain('build');
  });
});

describe('changelog helpers', () => {
  it('groups commits by conventional type', () => {
    const groups = draftFromCommits([
      'abc feat: add thing',
      'def fix: patch bug',
      'ghi random commit'
    ]);
    const feat = groups.find((g) => g.type === 'feat');
    expect(feat?.commits).toEqual(['add thing']);
    expect(groups.some((g) => g.type === 'other')).toBe(true);
  });

  it('parses changelog version sections', () => {
    const versions = parseChangelog('## 1.2.0\n\n- did a thing\n- did another\n\n## 1.1.0\n- old');
    expect(versions[0].version).toBe('1.2.0');
    expect(versions[0].entries).toHaveLength(2);
  });
});

describe('standup grouping', () => {
  it('groups commit lines by day, newest first', () => {
    const output = ['aaa2024-01-02T09:00:00Zsecond day', 'bbb2024-01-01T09:00:00Zfirst day'].join(
      '\n'
    );
    const days = groupCommitsByDay(output);
    expect(days[0].date).toBe('2024-01-02');
    expect(days[1].commits[0].subject).toBe('first day');
  });
});
