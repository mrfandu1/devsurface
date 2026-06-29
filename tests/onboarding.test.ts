import { describe, expect, it } from 'vitest';
import { buildOnboardingPlan } from '../src/core/onboarding/index.js';
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
    config: null,
    ...overrides
  };
}

function warning(id: string): DoctorWarning {
  return { id, severity: 'warning', title: id, message: id };
}

describe('buildOnboardingPlan', () => {
  it('marks dependencies as a todo when node_modules is missing', () => {
    const plan = buildOnboardingPlan(baseScan(), [warning('missing-node-modules')]);
    const install = plan.steps.find((step) => step.id === 'install-dependencies');

    expect(install?.status).toBe('todo');
    expect(install?.action?.kind).toBe('install');
  });

  it('marks dependencies done when node_modules is present', () => {
    const plan = buildOnboardingPlan(baseScan(), []);
    const install = plan.steps.find((step) => step.id === 'install-dependencies');

    expect(install?.status).toBe('done');
    expect(install?.action).toBeUndefined();
  });

  it('offers an env copy action when .env is missing but the example exists', () => {
    const scan = baseScan({
      env: {
        examplePath: '/tmp/project/.env.example',
        localPath: null,
        hasExample: true,
        hasLocal: false,
        exampleKeys: ['API_KEY'],
        localKeys: [],
        missingKeys: ['API_KEY'],
        emptyKeys: [],
        keys: []
      }
    });

    const plan = buildOnboardingPlan(scan, [warning('missing-env')]);
    const create = plan.steps.find((step) => step.id === 'create-env');

    expect(create?.status).toBe('todo');
    expect(create?.action?.kind).toBe('env-copy');
    // The fill step is only added once a local .env exists.
    expect(plan.steps.find((step) => step.id === 'fill-env')).toBeUndefined();
  });

  it('adds a manual fill step when env keys are unset', () => {
    const scan = baseScan({
      env: {
        examplePath: '/tmp/project/.env.example',
        localPath: '/tmp/project/.env',
        hasExample: true,
        hasLocal: true,
        exampleKeys: ['API_KEY', 'DB_URL'],
        localKeys: ['API_KEY', 'DB_URL'],
        missingKeys: [],
        emptyKeys: ['DB_URL'],
        keys: []
      }
    });

    const plan = buildOnboardingPlan(scan, []);
    const fill = plan.steps.find((step) => step.id === 'fill-env');

    expect(fill?.status).toBe('manual');
    expect(fill?.description).toContain('DB_URL');
  });

  it('computes readiness from blocking steps only', () => {
    const scan = baseScan({ scripts: { dev: 'vite' } });
    const plan = buildOnboardingPlan(scan, []);

    // Only the install step is blocking here, and it is done -> 100%.
    expect(plan.readiness).toBe(100);
    expect(plan.ready).toBe(true);
    expect(plan.steps.find((step) => step.id === 'start-app')?.action?.target).toBe('dev');
  });

  it('reports partial readiness when a blocking step is unmet', () => {
    const plan = buildOnboardingPlan(baseScan(), [warning('missing-node-modules')]);

    expect(plan.readiness).toBe(0);
    expect(plan.ready).toBe(false);
    expect(plan.summary).toContain('remaining');
  });

  it('treats a stopped docker daemon as a manual, non-blocking step', () => {
    const scan = baseScan({
      docker: {
        composeFiles: ['/tmp/project/docker-compose.yml'],
        services: [{ name: 'db', status: 'stopped', statusDetail: null, containerId: null }],
        dockerRunning: false,
        daemonStatus: 'stopped',
        message: 'Docker is not running.'
      }
    });

    const plan = buildOnboardingPlan(scan, [warning('docker-not-running')]);
    const docker = plan.steps.find((step) => step.id === 'docker-start');

    expect(docker?.status).toBe('manual');
    expect(docker?.blocking).toBe(false);
    expect(plan.readiness).toBe(100);
  });

  it('includes maintainer setup guide steps and a docs link', () => {
    const scan = baseScan({
      config: {
        path: '/tmp/project/devsurface.config.json',
        config: {
          setupGuide: ['Copy .env', 'Run seed'],
          docs: 'https://docs.example.com'
        },
        warnings: []
      }
    });

    const plan = buildOnboardingPlan(scan, []);

    expect(plan.steps.filter((step) => step.id.startsWith('guide-'))).toHaveLength(2);
    const docs = plan.steps.find((step) => step.id === 'read-docs');
    expect(docs?.action?.kind).toBe('open-docs');
    expect(docs?.action?.target).toBe('https://docs.example.com');
  });

  it('generates run-command actions for structured guide steps that reference config commands', () => {
    const scan = baseScan({
      config: {
        path: '/tmp/project/devsurface.config.json',
        config: {
          commands: { migrate: 'npm run db:migrate', dev: 'npm run dev' },
          setupGuide: [
            { title: 'Run migrations', command: 'migrate', description: 'Apply schema changes.' },
            { title: 'Start dev server', command: 'dev' },
            { title: 'Manual note', description: 'No action here.' },
            'Plain text step'
          ]
        },
        warnings: []
      }
    });

    const plan = buildOnboardingPlan(scan, []);
    const guideSteps = plan.steps.filter((step) => step.id.startsWith('guide-'));

    expect(guideSteps).toHaveLength(4);

    expect(guideSteps[0].action).toEqual({ kind: 'run-command', label: 'Run', target: 'migrate' });
    expect(guideSteps[0].status).toBe('todo');
    expect(guideSteps[0].description).toBe('Apply schema changes.');

    expect(guideSteps[1].action).toEqual({ kind: 'run-command', label: 'Run', target: 'dev' });
    expect(guideSteps[1].status).toBe('todo');

    expect(guideSteps[2].action).toBeUndefined();
    expect(guideSteps[2].status).toBe('manual');

    expect(guideSteps[3].title).toBe('Plain text step');
    expect(guideSteps[3].status).toBe('manual');
    expect(guideSteps[3].action).toBeUndefined();
  });

  it('generates run-script actions for structured guide steps with a script key', () => {
    const scan = baseScan({
      scripts: { lint: 'eslint .' },
      config: {
        path: '/tmp/project/devsurface.config.json',
        config: {
          setupGuide: [{ title: 'Lint the code', script: 'lint' }]
        },
        warnings: []
      }
    });

    const plan = buildOnboardingPlan(scan, []);
    const lintStep = plan.steps.find((step) => step.id === 'guide-0');

    expect(lintStep?.action).toEqual({ kind: 'run-script', label: 'Run', target: 'lint' });
    expect(lintStep?.status).toBe('todo');
  });

  it('skips install for non-node projects', () => {
    const scan = baseScan({
      packageJson: null,
      packageManager: null,
      language: { primary: 'go', detected: ['go'], files: ['go.mod'] }
    });

    const plan = buildOnboardingPlan(scan, []);
    expect(plan.steps.find((step) => step.id === 'install-dependencies')).toBeUndefined();
  });
});
