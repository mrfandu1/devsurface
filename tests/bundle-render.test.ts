import { describe, expect, it } from 'vitest';
import { renderHelpBundle } from '../src/core/bundle/index.js';
import type { ScanResult } from '../src/core/types.js';

function fakeScan(): ScanResult {
  return {
    root: '/tmp/x',
    projectName: 'demo-app',
    packageJson: {
      path: '/tmp/x/package.json',
      data: { name: 'demo-app', description: 'A demo' }
    },
    packageManager: 'npm',
    language: { primary: 'node', detected: ['node'], files: [] },
    scripts: { dev: 'vite' },
    env: {
      examplePath: '/tmp/x/.env.example',
      localPath: '/tmp/x/.env',
      hasExample: true,
      hasLocal: true,
      exampleKeys: ['API_KEY'],
      localKeys: ['API_KEY'],
      missingKeys: [],
      emptyKeys: [],
      extraKeys: [],
      keys: [{ key: 'API_KEY', present: true, empty: false }]
    },
    docker: null,
    git: null,
    framework: null,
    presets: [],
    presetCommands: {},
    presetGroups: {},
    ports: [],
    readme: { path: null, exists: true },
    license: { path: null, exists: true },
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
    config: null
  };
}

describe('renderHelpBundle', () => {
  it('includes every section a helper needs', () => {
    const markdown = renderHelpBundle({
      scan: fakeScan(),
      warnings: [
        { id: 'missing-env', severity: 'error', title: '.env is missing', message: 'Copy it.' }
      ],
      system: {
        osName: 'Windows 11',
        arch: 'x64',
        cpuCount: 8,
        totalMemoryGb: 16,
        freeMemoryGb: 4,
        hostname: 'test',
        checks: [{ id: 'node', label: 'Node.js', ok: true, detail: 'v20.0.0' }],
        verdict: 'Ready.'
      },
      history: [
        {
          script: 'dev',
          command: 'vite',
          status: 'failed',
          exitCode: 1,
          startedAt: '2026-07-12T10:00:00Z',
          endedAt: '2026-07-12T10:00:30Z',
          durationMs: 30_000
        }
      ],
      logs: [
        {
          pid: '1',
          script: 'dev',
          stream: 'stderr',
          message: 'Error: connect ECONNREFUSED',
          timestamp: '2026-07-12T10:00:29Z'
        }
      ],
      devsurfaceVersion: '1.1.0'
    });

    expect(markdown).toContain('# Help request: demo-app');
    expect(markdown).toContain('## The project, in plain English');
    expect(markdown).toContain('## My computer');
    expect(markdown).toContain('Windows 11');
    expect(markdown).toContain('.env is missing');
    expect(markdown).toContain('`dev` failed (exit 1)');
    expect(markdown).toContain('ECONNREFUSED');
    expect(markdown).toContain('No secret values are included');
  });

  it('never leaks env values, only key names', () => {
    const markdown = renderHelpBundle({
      scan: fakeScan(),
      warnings: [],
      system: {
        osName: 'Linux',
        arch: 'x64',
        cpuCount: 4,
        totalMemoryGb: 8,
        freeMemoryGb: 2,
        hostname: 'test',
        checks: [],
        verdict: 'Ready.'
      },
      devsurfaceVersion: '1.1.0'
    });
    // The fact sheet mentions env state, never values.
    expect(markdown).not.toContain('super-secret');
    expect(markdown).toContain('demo-app');
  });
});
