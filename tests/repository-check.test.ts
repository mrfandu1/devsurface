import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runRepositoryChecks } from '../src/core/check/index.js';
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

const tempProjects: string[] = [];

afterEach(async () => {
  await Promise.all(tempProjects.splice(0).map((project) => removeTempProject(project)));
});

async function tempProject(): Promise<string> {
  const project = await makeTempProject();
  tempProjects.push(project);
  return project;
}

describe('repository checks', () => {
  it('accepts a documented repository without requiring a license', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'healthy-project',
      scripts: {
        dev: 'vite --port 4173',
        test: 'vitest',
        build: 'vite build'
      }
    });
    await fs.writeFile(path.join(root, '.env.example'), 'API_URL=\n', 'utf8');
    await fs.writeFile(
      path.join(root, 'README.md'),
      'Run `npm run dev` on port 4173. Copy `.env.example` to `.env`.\n',
      'utf8'
    );
    await fs.writeFile(path.join(root, 'CONTRIBUTING.md'), '# Contributing\n', 'utf8');

    const result = await runRepositoryChecks(root);

    expect(result.projectName).toBe('healthy-project');
    expect(result.checks).toEqual([]);
  });

  it('reports static onboarding gaps without machine-local checks', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'needs-docs',
      scripts: {
        dev: 'vite --port 3000'
      }
    });
    await fs.writeFile(path.join(root, '.env.example'), 'API_URL=\n', 'utf8');
    await fs.writeFile(path.join(root, 'README.md'), 'Run `npm run missing`.\n', 'utf8');

    const ids = (await runRepositoryChecks(root)).checks.map((item) => item.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'missing-test-script',
        'missing-build-script',
        'readme-script-mismatch',
        'missing-contributing',
        'undocumented-env',
        'undocumented-ports'
      ])
    );
    expect(ids).not.toContain('missing-license');
    expect(ids).not.toContain('missing-node-modules');
    expect(ids).not.toContain('missing-env');
    expect(ids.some((id) => id.includes('port-') && id.endsWith('-in-use'))).toBe(false);
  });

  it('returns an error when package.json is missing', async () => {
    const root = await tempProject();
    await fs.writeFile(path.join(root, 'README.md'), '# Empty project\n', 'utf8');
    await fs.writeFile(path.join(root, 'CONTRIBUTING.md'), '# Contributing\n', 'utf8');

    const result = await runRepositoryChecks(root);

    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: 'missing-package-json',
        severity: 'error'
      })
    );
  });

  it('reports invalid DevSurface configuration', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'bad-config',
      scripts: {
        test: 'vitest',
        build: 'tsc'
      }
    });
    await fs.writeFile(path.join(root, 'README.md'), '# Project\n', 'utf8');
    await fs.writeFile(path.join(root, 'CONTRIBUTING.md'), '# Contributing\n', 'utf8');
    await fs.writeFile(path.join(root, 'devsurface.config.json'), '{bad json', 'utf8');

    const result = await runRepositoryChecks(root);

    expect(result.checks).toContainEqual(
      expect.objectContaining({
        id: 'config-warning',
        severity: 'warning',
        target: 'devsurface.config.json'
      })
    );
  });
});
