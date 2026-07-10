import { describe, expect, it } from 'vitest';
import { buildOnboardingPlan } from '../src/core/onboarding/index.js';
import { renderMarkdownReport } from '../src/core/report/markdown.js';
import type { DoctorWarning, ScanResult } from '../src/core/types.js';

function baseScan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    root: '/tmp/project',
    projectName: 'project',
    packageJson: { path: '/tmp/project/package.json', data: { name: 'project' } },
    packageManager: 'npm',
    language: { primary: 'node', detected: ['node'], files: ['package.json'] },
    scripts: {},
    env: null,
    docker: null,
    git: null,
    framework: null,
    presets: [],
    presetCommands: {},
    presetGroups: {},
    ports: [],
    readme: { path: null, exists: false },
    license: { path: null, exists: false },
    monorepo: null,
    dependencies: null,
    toolchain: {
      testRunner: null,
      linter: null,
      formatter: null,
      bundler: null,
      orm: null,
      styling: null,
      ci: null
    },
    nodeRequirement: null,
    readmeCommands: [],
    config: null,
    ...overrides
  };
}

function render(scan: ScanResult, warnings: DoctorWarning[] = []): string {
  return renderMarkdownReport(scan, warnings, buildOnboardingPlan(scan, warnings));
}

describe('renderMarkdownReport', () => {
  it('renders overview, readiness, and health sections', () => {
    const markdown = render(baseScan());
    expect(markdown).toContain('# project — project surface');
    expect(markdown).toContain('## Overview');
    expect(markdown).toContain('## Setup readiness — 100%');
    expect(markdown).toContain('No setup problems detected.');
  });

  it('explains scripts in a table and escapes pipes', () => {
    const markdown = render(baseScan({ scripts: { dev: 'vite', weird: 'echo a | grep b' } }));
    expect(markdown).toContain('## Scripts');
    expect(markdown).toContain('development server');
    expect(markdown).toContain('echo a \\| grep b');
  });

  it('lists env key names but never values', () => {
    const markdown = render(
      baseScan({
        env: {
          examplePath: '/tmp/project/.env.example',
          localPath: '/tmp/project/.env',
          hasExample: true,
          hasLocal: true,
          exampleKeys: ['API_KEY'],
          localKeys: ['API_KEY'],
          missingKeys: [],
          emptyKeys: [],
          extraKeys: [],
          keys: [{ key: 'API_KEY', present: true, empty: false }]
        }
      })
    );
    expect(markdown).toContain('`API_KEY`');
    expect(markdown).toContain('values are never included');
  });

  it('includes git, monorepo, and dependency insights when present', () => {
    const markdown = render(
      baseScan({
        git: {
          root: '/tmp/project/.git',
          branch: 'main',
          dirtyFiles: 3,
          ahead: 1,
          behind: 2,
          lastCommit: null,
          remoteUrl: null
        },
        monorepo: {
          tools: ['Turborepo'],
          packageGlobs: ['packages/*'],
          packages: [],
          packageCount: 4
        },
        dependencies: { runtimeCount: 7, devCount: 12, lockfile: null, lockfileStale: false }
      })
    );
    expect(markdown).toContain('main (3 changed files, 1 ahead, 2 behind)');
    expect(markdown).toContain('Turborepo — 4 packages');
    expect(markdown).toContain('7 runtime + 12 dev');
  });

  it('renders doctor warnings with severity markers', () => {
    const markdown = render(baseScan(), [
      { id: 'x', severity: 'error', title: 'Broken thing', message: 'It broke.' }
    ]);
    expect(markdown).toContain('**Broken thing** — It broke.');
  });
});
