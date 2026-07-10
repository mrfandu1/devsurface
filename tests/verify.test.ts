import { describe, expect, it } from 'vitest';
import { runVerify, selectVerifyScripts } from '../src/core/verify/index.js';

describe('selectVerifyScripts', () => {
  it('picks known quality scripts in a stable order', () => {
    const scripts = {
      build: 'tsup',
      dev: 'vite',
      test: 'vitest run',
      lint: 'eslint .',
      typecheck: 'tsc --noEmit'
    };
    expect(selectVerifyScripts(scripts)).toEqual(['lint', 'typecheck', 'test', 'build']);
  });

  it('returns nothing when no quality scripts exist', () => {
    expect(selectVerifyScripts({ dev: 'vite', start: 'node .' })).toEqual([]);
  });
});

describe('runVerify', () => {
  it('runs each selected script and reports pass/fail', async () => {
    const order: string[] = [];
    const results = await runVerify({
      cwd: '/tmp/project',
      packageManager: 'npm',
      scripts: { lint: 'eslint .', test: 'vitest run', build: 'tsup' },
      onStepStart: (script) => order.push(script),
      runner: async (script) => (script === 'test' ? 1 : 0)
    });

    expect(order).toEqual(['lint', 'test', 'build']);
    expect(results.map((result) => [result.script, result.ok])).toEqual([
      ['lint', true],
      ['test', false],
      ['build', true]
    ]);
    expect(results[1].exitCode).toBe(1);
    expect(results.every((result) => result.durationMs >= 0)).toBe(true);
  });

  it('treats an unrunnable script (null exit) as a failure', async () => {
    const results = await runVerify({
      cwd: '/tmp/project',
      packageManager: null,
      scripts: { lint: 'eslint .' },
      runner: async () => null
    });
    expect(results[0].ok).toBe(false);
    expect(results[0].exitCode).toBeNull();
  });
});
