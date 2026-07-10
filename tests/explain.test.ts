import { describe, expect, it } from 'vitest';
import { explainScript } from '../src/core/explain/index.js';

describe('explainScript', () => {
  it('explains conventional script names regardless of the underlying tool', () => {
    expect(explainScript('dev', 'vite')).toContain('development server');
    expect(explainScript('build', 'vite build')).toContain('production');
    expect(explainScript('test', 'vitest run')).toContain('tests');
    expect(explainScript('lint', 'eslint .')).toContain('mistakes');
    expect(explainScript('format', 'prettier --write .')).toContain('style');
    expect(explainScript('typecheck', 'tsc --noEmit')).toContain('type errors');
  });

  it('matches namespaced script names by their base segment', () => {
    expect(explainScript('build:web', 'vite build')).toBe(explainScript('build', 'vite build'));
    expect(explainScript('test:unit', 'vitest')).toBe(explainScript('test', 'vitest'));
  });

  it('falls back to tool detection for unconventional names', () => {
    expect(explainScript('ci', 'nodemon server.js')).toContain('restarts it automatically');
    expect(explainScript('watcher', 'next dev')).toContain('development server');
    expect(explainScript('verify', 'playwright test')).toContain('like a real user');
    expect(explainScript('check', 'eslint src')).toContain('mistakes');
  });

  it('warns gently about deploy-style commands', () => {
    expect(explainScript('deploy', 'npm publish')).toContain('double-check');
  });

  it('returns a safe generic fallback when nothing matches', () => {
    expect(explainScript('custom', 'some-unknown-binary --flag')).toBe(
      'Runs the project’s “custom” command.'
    );
  });

  it('handles a missing or empty command string', () => {
    expect(explainScript('dev')).toContain('development server');
    expect(explainScript('mystery', '')).toBe('Runs the project’s “mystery” command.');
  });

  it('explains newer conventional names', () => {
    expect(explainScript('coverage', 'vitest run --coverage')).toContain('cover');
    expect(explainScript('generate', 'graphql-codegen')).toContain('Generates');
    expect(explainScript('bench', 'vitest bench')).toContain('fast');
    expect(explainScript('prepare', 'husky')).toContain('automatically');
  });

  it('recognizes monorepo, desktop, and deploy tooling', () => {
    expect(explainScript('everything', 'turbo run build')).toContain('monorepo');
    expect(explainScript('all', 'npm-run-all lint test')).toContain('together');
    expect(explainScript('ship', 'wrangler deploy')).toContain('double-check');
    expect(explainScript('desktop', 'electron .')).toContain('Electron');
    expect(explainScript('app', 'tauri dev')).toContain('Tauri');
    expect(explainScript('schema', 'drizzle-kit push')).toContain('Drizzle');
  });
});
