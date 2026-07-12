import { describe, expect, it } from 'vitest';
import { buildTips } from '../src/core/tips/index.js';
import { buildPlainSummary, buildFactSheet } from '../src/core/summary/index.js';
import { buildQuickstart } from '../src/core/quickstart/index.js';
import { checkSystem } from '../src/core/system/index.js';
import type { ScanResult } from '../src/core/types.js';

function baseScan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    root: '/tmp/definitely-not-a-real-devsurface-project',
    projectName: 'demo-app',
    packageJson: {
      path: '/tmp/project/package.json',
      data: { name: 'demo-app', version: '2.1.0', description: 'A demo storefront' }
    },
    packageManager: 'pnpm',
    language: { primary: 'node', detected: ['node'], files: ['package.json'] },
    scripts: { dev: 'vite', test: 'vitest run', lint: 'eslint .' },
    env: null,
    docker: null,
    git: null,
    framework: { type: 'Node.js / Next.js', detected: ['Next.js', 'Tailwind CSS'] },
    presets: [],
    presetCommands: {},
    presetGroups: {},
    ports: [{ port: 3000, inUse: false }],
    readme: { path: null, exists: true },
    license: { path: null, exists: true },
    monorepo: null,
    dependencies: {
      runtimeCount: 12,
      devCount: 8,
      lockfile: 'pnpm-lock.yaml',
      lockfileStale: false
    },
    toolchain: {
      testRunner: 'Vitest',
      linter: 'ESLint',
      formatter: null,
      bundler: 'Vite',
      orm: null,
      styling: null,
      ci: 'GitHub Actions'
    },
    nodeRequirement: '>=20',
    readmeCommands: [],
    config: null,
    ...overrides
  };
}

describe('buildTips', () => {
  it('produces contextual tips ordered do-this first', () => {
    const tips = buildTips(baseScan());
    expect(tips.length).toBeGreaterThanOrEqual(5);
    expect(tips[0].kind).toBe('do-this');
    expect(tips.some((tip) => tip.id === 'dev-script')).toBe(true);
    expect(tips.find((tip) => tip.id === 'dev-script')?.command).toBe('pnpm dev');
  });

  it('warns about the package manager when it is not npm', () => {
    const tips = buildTips(baseScan());
    const loyalty = tips.find((tip) => tip.id === 'package-manager-loyalty');
    expect(loyalty?.text).toContain('pnpm');
  });

  it('includes env tips only when an example env exists without a local file', () => {
    const withEnv = baseScan({
      env: {
        examplePath: '/tmp/p/.env.example',
        localPath: null,
        hasExample: true,
        hasLocal: false,
        exampleKeys: ['API_KEY'],
        localKeys: [],
        missingKeys: ['API_KEY'],
        emptyKeys: [],
        extraKeys: [],
        keys: []
      }
    });
    expect(buildTips(withEnv).some((tip) => tip.id === 'env-copy-first')).toBe(true);
    expect(buildTips(baseScan()).some((tip) => tip.id === 'env-copy-first')).toBe(false);
  });
});

describe('buildPlainSummary', () => {
  it('reads like prose and mentions the essentials', () => {
    const summary = buildPlainSummary(baseScan());
    expect(summary).toContain('demo-app');
    expect(summary).toContain('Next.js');
    expect(summary).toContain('pnpm install');
    expect(summary).toContain('Node.js >=20');
  });

  it('survives a sparse scan', () => {
    const summary = buildPlainSummary(
      baseScan({
        packageJson: null,
        framework: null,
        scripts: {},
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
        dependencies: null
      })
    );
    expect(summary).toContain('demo-app');
    expect(summary.length).toBeGreaterThan(20);
  });
});

describe('buildFactSheet', () => {
  it('lists label/value facts including version and language', () => {
    const facts = buildFactSheet(baseScan());
    expect(facts.find((fact) => fact.label === 'Version')?.value).toBe('2.1.0');
    expect(facts.find((fact) => fact.label === 'Language')?.value).toBe('JavaScript/TypeScript');
    expect(facts.find((fact) => fact.label === 'Package manager')?.value).toBe('pnpm');
  });
});

describe('buildQuickstart', () => {
  it('orders install before dev and marks install not done for a missing folder', async () => {
    const steps = await buildQuickstart(baseScan());
    const ids = steps.map((step) => step.id);
    expect(ids.indexOf('install')).toBeLessThan(ids.indexOf('dev'));
    expect(steps.find((step) => step.id === 'install')?.done).toBe(false);
    expect(steps.find((step) => step.id === 'install')?.command).toBe('pnpm install');
    expect(steps.find((step) => step.id === 'open-browser')?.command).toBe('http://localhost:3000');
  });

  it('falls back to the README step when nothing is detectable', async () => {
    const steps = await buildQuickstart(
      baseScan({
        packageJson: null,
        scripts: {},
        language: { primary: null, detected: [], files: [] },
        ports: [],
        nodeRequirement: null
      })
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].id).toBe('read-readme');
  });
});

describe('checkSystem', () => {
  // One probe run shared by every assertion: version probes spawn real
  // processes, and repeating them slows the whole suite on Windows.
  it('reports machine facts, Node availability, and a verdict', { timeout: 30_000 }, async () => {
    const report = await checkSystem(baseScan());

    const node = report.checks.find((check) => check.id === 'node');
    expect(node?.ok).toBe(true);
    expect(node?.detail).toBe(process.version);
    expect(report.verdict.length).toBeGreaterThan(10);
    expect(report.cpuCount).toBeGreaterThan(0);
    expect(report.totalMemoryGb).toBeGreaterThan(0);

    // Docker: ok is null (not needed) or true (installed anyway) — never a
    // failure for a project without compose files.
    const docker = report.checks.find((check) => check.id === 'docker');
    expect(docker?.ok === false).toBe(false);
  });
});
