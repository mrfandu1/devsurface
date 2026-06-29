import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  MAX_CONFIGURED_PORTS,
  MAX_SETUP_GUIDE_STEPS,
  loadConfig,
  validateConfig
} from '../src/core/config/load.js';
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

  it('parses and trims setupGuide string steps, skips invalid entries', () => {
    const result = validateConfig({
      setupGuide: ['  Copy .env  ', '', 'Run migrate', 42]
    });

    expect(result.config.setupGuide).toEqual(['Copy .env', 'Run migrate']);
    expect(result.warnings).toContain('setupGuide entries must be strings or step objects.');
  });

  it('parses structured setupGuide step objects', () => {
    const result = validateConfig({
      setupGuide: [
        { title: 'Install dependencies', command: 'install', description: 'Run npm install.' },
        { title: '  Start the app  ', script: 'dev' },
        { title: 'Plain step without action' }
      ]
    });

    expect(result.config.setupGuide).toEqual([
      { title: 'Install dependencies', command: 'install', description: 'Run npm install.' },
      { title: 'Start the app', script: 'dev' },
      { title: 'Plain step without action' }
    ]);
    expect(result.warnings).toEqual([]);
  });

  it('rejects structured step objects missing a title', () => {
    const result = validateConfig({
      setupGuide: [{ command: 'install' }]
    });

    expect(result.config.setupGuide).toEqual([]);
    expect(result.warnings).toContain(
      'setupGuide step objects must have a non-empty title string.'
    );
  });

  it('accepts the snake_case setup_guide alias', () => {
    const result = validateConfig({
      setup_guide: ['Install deps']
    });

    expect(result.config.setupGuide).toEqual(['Install deps']);
  });

  it('caps setupGuide steps during validation', () => {
    const result = validateConfig({
      setupGuide: Array.from({ length: MAX_SETUP_GUIDE_STEPS + 5 }, (_, index) => `step ${index}`)
    });

    expect(result.config.setupGuide).toHaveLength(MAX_SETUP_GUIDE_STEPS);
    expect(result.warnings).toContain(
      `setupGuide may contain at most ${MAX_SETUP_GUIDE_STEPS} steps.`
    );
  });
});
