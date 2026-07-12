import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { exploreDependencies } from '../src/core/deps/index.js';
import { parseChangedFiles, parseCommitLog, parseContributors } from '../src/core/git/insights.js';
import { portLabel } from '../src/core/ports/knowledge.js';
import { makeTempProject, mkdirp, removeTempProject, writeJson } from './testUtils.js';

describe('exploreDependencies', () => {
  it('reads installed metadata from node_modules and flags missing installs', async () => {
    const root = await makeTempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'x',
      dependencies: { installed: '^1.0.0', ghost: '^2.0.0' },
      devDependencies: { devtool: '^3.0.0' }
    });
    await mkdirp(path.join(root, 'node_modules', 'installed'));
    await writeJson(path.join(root, 'node_modules', 'installed', 'package.json'), {
      name: 'installed',
      version: '1.2.3',
      description: 'A test package',
      license: 'MIT',
      homepage: 'https://example.com'
    });
    const packageJson = {
      path: path.join(root, 'package.json'),
      data: {
        dependencies: { installed: '^1.0.0', ghost: '^2.0.0' },
        devDependencies: { devtool: '^3.0.0' }
      }
    };

    const report = await exploreDependencies(root, packageJson);
    const installed = report.entries.find((entry) => entry.name === 'installed');
    expect(installed?.installed).toBe('1.2.3');
    expect(installed?.description).toBe('A test package');
    expect(installed?.license).toBe('MIT');
    expect(installed?.homepage).toBe('https://example.com');
    expect(installed?.dev).toBe(false);
    expect(report.missing.sort()).toEqual(['devtool', 'ghost']);
    expect(report.licenses[0]).toMatchObject({ license: 'MIT', count: 1 });
    expect(report.runtimeCount).toBe(2);
    expect(report.devCount).toBe(1);
    await removeTempProject(root);
  });
});

describe('git insight parsers', () => {
  it('parses the unit-separated commit log format', () => {
    const commits = parseCommitLog('abc123Ada2026-07-01T10:00:00+05:30Fix the build');
    expect(commits).toHaveLength(1);
    expect(commits[0]).toMatchObject({ hash: 'abc123', author: 'Ada', subject: 'Fix the build' });
  });

  it('parses shortlog contributor lines', () => {
    const contributors = parseContributors('   12\tAda Lovelace\n    3\tGrace Hopper');
    expect(contributors).toEqual([
      { name: 'Ada Lovelace', commits: 12 },
      { name: 'Grace Hopper', commits: 3 }
    ]);
  });

  it('translates porcelain status codes into friendly words', () => {
    const changed = parseChangedFiles(' M src/app.ts\n?? new-file.ts\nD  gone.ts');
    expect(changed[0]).toMatchObject({ meaning: 'modified', file: 'src/app.ts' });
    expect(changed[1].meaning).toBe('new file (untracked)');
    expect(changed[2].meaning).toBe('deleted');
  });
});

describe('portLabel', () => {
  it('names well-known dev ports and returns null otherwise', () => {
    expect(portLabel(5432)).toBe('PostgreSQL database');
    expect(portLabel(5173)).toBe('Vite dev server');
    expect(portLabel(49152)).toBeNull();
  });
});
