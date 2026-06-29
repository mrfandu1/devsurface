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
});
