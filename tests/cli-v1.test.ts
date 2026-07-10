import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { closestName } from '../src/cli/commands/explain.js';
import { buildDetectedConfig } from '../src/cli/commands/init.js';
import { upCommand } from '../src/cli/commands/up.js';
import { runVerify } from '../src/core/verify/index.js';
import { renderReadinessBadge } from '../src/core/badge/index.js';
import { scanProject } from '../src/core/scanner/index.js';
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

describe('closestName', () => {
  it('suggests near misses and stays quiet for nonsense', () => {
    expect(closestName('biuld', ['build', 'dev', 'test'])).toBe('build');
    expect(closestName('dve', ['build', 'dev', 'test'])).toBe('dev');
    expect(closestName('completely-unrelated', ['build', 'dev'])).toBeNull();
  });
});

describe('renderReadinessBadge custom label', () => {
  it('uses a sanitized custom label', () => {
    const svg = renderReadinessBadge(80, 'my-project <script>');
    expect(svg).toContain('my-project script');
    expect(svg).not.toContain('<script>');
  });
});

describe('runVerify --bail', () => {
  it('stops after the first failure', async () => {
    const attempted: string[] = [];
    const results = await runVerify({
      cwd: '/x',
      packageManager: 'npm',
      scripts: { lint: 'l', test: 't', build: 'b' },
      bail: true,
      runner: async (script) => {
        attempted.push(script);
        return script === 'lint' ? 1 : 0;
      }
    });
    expect(attempted).toEqual(['lint']);
    expect(results).toHaveLength(1);
    expect(results[0].ok).toBe(false);
  });
});

describe('detection-aware init + up --dry-run', () => {
  let root: string;
  let logs: string[];

  beforeEach(async () => {
    root = await makeTempProject();
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((message: unknown) => {
      logs.push(String(message));
    });
    process.exitCode = undefined;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    await removeTempProject(root);
  });

  it('buildDetectedConfig reflects the scanned project', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'detected-app',
      scripts: { dev: 'vite', build: 'vite build' }
    });
    await fs.writeFile(path.join(root, '.env.example'), 'KEY=\n', 'utf8');
    await fs.writeFile(
      path.join(root, 'docker-compose.yml'),
      'services:\n  db:\n    image: postgres\n',
      'utf8'
    );

    const config = buildDetectedConfig(await scanProject(root));
    expect(config.name).toBe('detected-app');
    expect(config.commands?.dev).toBe('npm run dev');
    expect(config.env).toEqual({ example: '.env.example', local: '.env' });
    expect(config.services).toEqual({ docker: true });
    expect(config.launch).toEqual(['docker', 'dev']);
  });

  it('up --dry-run prints the sequence without running anything', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'x',
      scripts: { dev: 'vite' }
    });

    await upCommand(root, { dryRun: true });
    const output = logs.join('\n');
    expect(output).toContain('Launch sequence');
    expect(output).toContain('"dev" script');
    expect(output).toContain('Dry run');
    expect(process.exitCode).toBeUndefined();
  });
});
