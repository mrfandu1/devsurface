import { describe, expect, it } from 'vitest';
import {
  describeLaunchStep,
  resolveLaunchPlan,
  type LaunchScanSubset
} from '../src/core/launch/index.js';

function scan(overrides: Partial<LaunchScanSubset> = {}): LaunchScanSubset {
  return {
    scripts: {},
    presetCommands: {},
    docker: null,
    config: null,
    ...overrides
  };
}

describe('resolveLaunchPlan', () => {
  it('uses the configured launch sequence and reports unknown entries', () => {
    const plan = resolveLaunchPlan(
      scan({
        scripts: { dev: 'vite', seed: 'node seed.js' },
        docker: { composeFiles: ['docker-compose.yml'] },
        config: { config: { launch: ['docker', 'seed', 'dev', 'nonsense'] } }
      })
    );

    expect(plan.fromConfig).toBe(true);
    expect(plan.steps).toEqual([
      { kind: 'docker' },
      { kind: 'script', name: 'seed' },
      { kind: 'script', name: 'dev' }
    ]);
    expect(plan.unknown).toEqual(['nonsense']);
  });

  it('resolves configured commands too', () => {
    const plan = resolveLaunchPlan(
      scan({
        presetCommands: { 'db:up': 'docker compose up db' },
        config: { config: { launch: ['db:up'] } }
      })
    );
    expect(plan.steps).toEqual([
      { kind: 'command', name: 'db:up', command: 'docker compose up db' }
    ]);
  });

  it('derives docker + dev by default', () => {
    const plan = resolveLaunchPlan(
      scan({
        scripts: { dev: 'vite' },
        docker: { composeFiles: ['compose.yml'] }
      })
    );
    expect(plan.fromConfig).toBe(false);
    expect(plan.steps).toEqual([{ kind: 'docker' }, { kind: 'script', name: 'dev' }]);
  });

  it('falls back to start and can be empty', () => {
    expect(resolveLaunchPlan(scan({ scripts: { start: 'node .' } })).steps).toEqual([
      { kind: 'script', name: 'start' }
    ]);
    expect(resolveLaunchPlan(scan()).steps).toEqual([]);
  });
});

describe('describeLaunchStep', () => {
  it('reads naturally for every step kind', () => {
    expect(describeLaunchStep({ kind: 'docker' })).toContain('docker compose up');
    expect(describeLaunchStep({ kind: 'script', name: 'dev' })).toContain('"dev" script');
    expect(describeLaunchStep({ kind: 'command', name: 'x', command: 'echo hi' })).toContain(
      'echo hi'
    );
  });
});
