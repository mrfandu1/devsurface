import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanProject } from '../src/core/scanner/index.js';
import { detectToolchain } from '../src/core/scanner/toolchain.js';
import { isWatchedProjectFile } from '../src/core/hub/watcher.js';
import { makeTempProject, mkdirp, removeTempProject, writeJson } from './testUtils.js';

describe('v1.0 scanner additions', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('detects bins, module type, and homepage', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'my-tool',
      type: 'module',
      bin: { 'my-tool': 'dist/cli.js', 'my-tool-extra': 'dist/extra.js' },
      homepage: 'https://example.com/my-tool'
    });

    const scan = await scanProject(root);
    expect(scan.bins).toEqual(['my-tool', 'my-tool-extra']);
    expect(scan.moduleType).toBe('module');
    expect(scan.homepage).toBe('https://example.com/my-tool');
  });

  it('derives the homepage from a repository URL when homepage is absent', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'x',
      repository: { url: 'git+https://github.com/acme/x.git' }
    });
    const scan = await scanProject(root);
    expect(scan.homepage).toBe('https://github.com/acme/x');
  });

  it('treats a string bin as a single command named after the package', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'solo', bin: 'cli.js' });
    const scan = await scanProject(root);
    expect(scan.bins).toEqual(['solo']);
    expect(scan.moduleType).toBe('commonjs');
  });

  it('detects the e2e runner separately from the unit runner', async () => {
    const toolchain = await detectToolchain(root, {
      path: path.join(root, 'package.json'),
      data: { devDependencies: { vitest: '^4', '@playwright/test': '^1' } }
    });
    expect(toolchain.testRunner).toBe('Vitest');
    expect(toolchain.e2eRunner).toBe('Playwright');
  });

  it('counts member scripts in monorepo packages', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'mono',
      workspaces: ['packages/*']
    });
    await mkdirp(path.join(root, 'packages', 'web'));
    await writeJson(path.join(root, 'packages', 'web', 'package.json'), {
      name: 'web',
      scripts: { dev: 'vite', build: 'vite build' }
    });

    const scan = await scanProject(root);
    expect(scan.monorepo?.packages[0].scriptCount).toBe(2);
  });
});

describe('watcher file filter', () => {
  it('only reacts to scan-relevant files', () => {
    expect(isWatchedProjectFile('package.json')).toBe(true);
    expect(isWatchedProjectFile('.env')).toBe(true);
    expect(isWatchedProjectFile('docker-compose.yml')).toBe(true);
    expect(isWatchedProjectFile('src/index.ts')).toBe(false);
    expect(isWatchedProjectFile('random.txt')).toBe(false);
  });
});

describe('watchWorkspace', () => {
  it('fires (debounced) when a watched file changes', async () => {
    const { watchWorkspace } = await import('../src/core/hub/watcher.js');
    const dir = await makeTempProject();
    const seen: string[] = [];
    const stop = watchWorkspace(dir, (file) => seen.push(file));

    try {
      await fs.writeFile(path.join(dir, 'package.json'), '{"name":"x"}', 'utf8');
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(seen).toContain('package.json');
    } finally {
      stop();
      await removeTempProject(dir);
    }
  });
});
