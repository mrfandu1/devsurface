import { describe, expect, it } from 'vitest';
import { explainErrorOutput, FRIENDLY_ERROR_COUNT } from '../src/core/friendly/index.js';

describe('explainErrorOutput', () => {
  it('recognizes a busy port', () => {
    const friendly = explainErrorOutput('Error: listen EADDRINUSE: address already in use :::3000');
    expect(friendly?.id).toBe('port-in-use');
    expect(friendly?.suggestion.length).toBeGreaterThan(10);
  });

  it('recognizes missing modules', () => {
    expect(explainErrorOutput("Error: Cannot find module 'express'")?.id).toBe('module-not-found');
    expect(explainErrorOutput('ERR_MODULE_NOT_FOUND something')?.id).toBe('module-not-found');
  });

  it('recognizes Windows "not recognized" command failures', () => {
    expect(
      explainErrorOutput(
        "'pnpm' is not recognized as an internal or external command, operable program or batch file."
      )?.id
    ).toBe('command-not-found');
  });

  it('recognizes docker daemon problems', () => {
    expect(
      explainErrorOutput('Cannot connect to the Docker daemon at unix:///var/run/docker.sock')?.id
    ).toBe('docker-not-running');
  });

  it('recognizes TypeScript compiler errors', () => {
    expect(
      explainErrorOutput("src/app.ts(3,7): error TS2322: Type 'string' is not assignable.")?.id
    ).toBe('typescript-errors');
  });

  it('recognizes merge conflicts', () => {
    expect(explainErrorOutput('CONFLICT (content): Merge conflict in src/index.ts')?.id).toBe(
      'merge-conflict'
    );
  });

  it('returns null for unknown or empty output (never guesses)', () => {
    expect(explainErrorOutput('everything is completely fine')).toBeNull();
    expect(explainErrorOutput('   ')).toBeNull();
  });

  it('exposes a rule count for the changelog', () => {
    expect(FRIENDLY_ERROR_COUNT).toBeGreaterThanOrEqual(20);
  });
});
