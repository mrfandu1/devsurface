import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MAX_CONFIGURED_PORTS, loadConfig, validateConfig } from '../src/core/config/load.js';
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

describe('config loader', () => {
  it('returns null when the config file is missing', async () => {
    expect(await loadConfig(await tempProject())).toBeNull();
  });

  it('loads and validates config fields', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'devsurface.config.json'), {
      name: 'Configured App',
      commands: {
        dev: 'pnpm dev'
      },
      groups: {
        Development: ['dev']
      },
      ports: [3000]
    });

    const config = await loadConfig(root);
    expect(config?.config.name).toBe('Configured App');
    expect(config?.config.commands?.dev).toBe('pnpm dev');
    expect(config?.warnings).toEqual([]);
  });

  it('reports invalid JSON as a config warning', async () => {
    const root = await tempProject();
    await fs.writeFile(path.join(root, 'devsurface.config.json'), '{bad json', 'utf8');

    const config = await loadConfig(root);
    expect(config?.warnings[0]).toContain('invalid JSON');
  });

  it('ignores config symlinks that resolve outside the project root', async () => {
    const root = await tempProject();
    const outside = await tempProject();
    const outsideConfig = path.join(outside, 'devsurface.config.json');
    await writeJson(outsideConfig, { name: 'outside' });
    await fs.symlink(outsideConfig, path.join(root, 'devsurface.config.json'), 'file');

    expect(await loadConfig(root)).toBeNull();
  });

  it('drops invalid ports during validation', () => {
    const result = validateConfig({
      ports: [3000, -1, 'bad']
    });

    expect(result.config.ports).toEqual([3000]);
    expect(result.warnings).toContain('ports may only contain integers between 1 and 65535.');
  });

  it('caps configured ports during validation', () => {
    const result = validateConfig({
      ports: Array.from({ length: MAX_CONFIGURED_PORTS + 10 }, (_, index) => index + 1)
    });

    expect(result.config.ports).toHaveLength(MAX_CONFIGURED_PORTS);
    expect(result.config.ports).toEqual(
      Array.from({ length: MAX_CONFIGURED_PORTS }, (_, index) => index + 1)
    );
    expect(result.warnings).toContain(`ports may contain at most ${MAX_CONFIGURED_PORTS} entries.`);
  });

  it('drops unsafe docs URLs during validation', () => {
    const result = validateConfig({
      docs: 'javascript:alert(1)'
    });

    expect(result.config.docs).toBeUndefined();
    expect(result.warnings).toContain('docs must be an http or https URL.');
  });
});
