import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../src/core/doctor/index.js';
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

describe('v1.0 doctor checks', () => {
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

  it('flags the npm placeholder test script', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'x',
      scripts: { test: 'echo "Error: no test specified" && exit 1' }
    });
    expect(await warningIds()).toContain('placeholder-test-script');
  });

  it('flags .nvmrc conflicting with engines.node', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'x',
      engines: { node: '>=20' }
    });
    await fs.writeFile(path.join(root, '.nvmrc'), '18\n', 'utf8');
    expect(await warningIds()).toContain('nvmrc-engines-conflict');
  });

  it('notes the obsolete compose version key', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await fs.writeFile(
      path.join(root, 'docker-compose.yml'),
      'version: "3.8"\nservices:\n  db:\n    image: postgres\n',
      'utf8'
    );
    expect(await warningIds()).toContain('compose-version-obsolete');
  });

  it('flags scripts using tools that are not dependencies', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'x',
      scripts: { lint: 'eslint .' },
      devDependencies: { vitest: '^4' }
    });
    const warnings = await runDoctor(root);
    const alert = warnings.find((warning) => warning.id === 'tool-not-in-deps');
    expect(alert?.message).toContain('eslint');
  });

  it('flags orphaned tool configs', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await fs.writeFile(path.join(root, '.prettierrc'), '{}\n', 'utf8');
    expect(await warningIds()).toContain('orphan-tool-config');
  });

  it('validates launch entries against real scripts', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'x',
      scripts: { dev: 'vite' }
    });
    await writeJson(path.join(root, 'devsurface.config.json'), {
      launch: ['docker', 'dev', 'ghost-step']
    });
    const warnings = await runDoctor(root);
    const alert = warnings.find((warning) => warning.id === 'launch-unknown-entries');
    expect(alert?.message).toContain('ghost-step');
    expect(alert?.message).not.toContain('dev');
  });

  it('flags duplicate config ports and empty env examples', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await writeJson(path.join(root, 'devsurface.config.json'), { ports: [3000, 3000] });
    await fs.writeFile(path.join(root, '.env.example'), '# only comments\n', 'utf8');

    const ids = await warningIds();
    expect(ids).toContain('duplicate-config-ports');
    expect(ids).toContain('empty-env-example');
  });

  it('flags npm-invalid package names', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'My Cool App' });
    expect(await warningIds()).toContain('invalid-package-name');
  });

  it('notes a README without a heading and a license mismatch', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x', license: 'Apache-2.0' });
    await fs.writeFile(
      path.join(root, 'README.md'),
      'Just prose without a heading. '.repeat(20),
      'utf8'
    );
    await fs.writeFile(
      path.join(root, 'LICENSE'),
      'MIT License\n\nPermission is hereby granted, free of charge...',
      'utf8'
    );

    const ids = await warningIds();
    expect(ids).toContain('readme-no-title');
    expect(ids).toContain('license-mismatch');
  });

  it('notes test files that have no test script', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(path.join(root, 'src', 'a.test.ts'), '', 'utf8');
    expect(await warningIds()).toContain('tests-without-script');
  });
});
