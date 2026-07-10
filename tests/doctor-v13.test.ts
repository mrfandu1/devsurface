import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isVersionBehind, runDoctor, scriptFileTarget } from '../src/core/doctor/index.js';
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

describe('isVersionBehind', () => {
  it('compares semver triples', () => {
    expect(isVersionBehind('1.2.3', '1.3.0')).toBe(true);
    expect(isVersionBehind('1.3.0', '1.3.0')).toBe(false);
    expect(isVersionBehind('2.0.0', '1.9.9')).toBe(false);
    expect(isVersionBehind('v0.9.0', '0.10.0')).toBe(true);
    expect(isVersionBehind('not-semver', '1.0.0')).toBe(false);
  });
});

describe('scriptFileTarget', () => {
  it('extracts directly executed local files', () => {
    expect(scriptFileTarget('node scripts/build.js --flag')).toBe('scripts/build.js');
    expect(scriptFileTarget('tsx ./src/cli/index.ts')).toBe('src/cli/index.ts');
    expect(scriptFileTarget('python tools/gen.py')).toBe('tools/gen.py');
  });

  it('ignores generated output and non-file commands', () => {
    expect(scriptFileTarget('node dist/cli/index.js')).toBeNull();
    expect(scriptFileTarget('vite build')).toBeNull();
    expect(scriptFileTarget('eslint .')).toBeNull();
  });
});

describe('v0.13 doctor checks', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  async function warningIds(): Promise<string[]> {
    return (await runDoctor(root)).map((warning) => warning.id);
  }

  it('flags missing description/license fields and duplicate or wildcard deps', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'x',
      dependencies: { hono: '^4', both: '1.0.0', loose: '*' },
      devDependencies: { both: '1.0.0' }
    });

    const ids = await warningIds();
    expect(ids).toContain('package-missing-fields');
    expect(ids).toContain('duplicate-dependencies');
    expect(ids).toContain('wildcard-dependency-versions');
  });

  it('warns when the CHANGELOG is behind package.json', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'x',
      version: '2.0.0',
      description: 'd',
      license: 'MIT'
    });
    await fs.writeFile(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## 1.9.0\n', 'utf8');

    expect(await warningIds()).toContain('changelog-behind');
  });

  it('warns when .gitignore does not cover node_modules', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await fs.mkdir(path.join(root, '.git'));
    await fs.writeFile(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n', 'utf8');
    await fs.writeFile(path.join(root, '.gitignore'), 'dist\n', 'utf8');

    expect(await warningIds()).toContain('node-modules-not-gitignored');
  });

  it('notes an unpinned Dockerfile base image', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await fs.writeFile(
      path.join(root, 'docker-compose.yml'),
      'services:\n  app:\n    build: .\n',
      'utf8'
    );
    await fs.writeFile(path.join(root, 'Dockerfile'), 'FROM node\nRUN npm ci\n', 'utf8');

    expect(await warningIds()).toContain('dockerfile-latest-tag');
  });

  it('flags scripts pointing at files that do not exist', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'x',
      scripts: { gen: 'node scripts/missing.js' }
    });

    const warnings = await runDoctor(root);
    const alert = warnings.find((warning) => warning.id === 'script-missing-file');
    expect(alert?.message).toContain('scripts/missing.js');
  });

  it('notes a very short README', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await fs.writeFile(path.join(root, 'README.md'), '# x\n\ntiny', 'utf8');

    expect(await warningIds()).toContain('short-readme');
  });
});
