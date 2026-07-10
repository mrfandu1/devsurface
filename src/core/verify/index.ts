import type { PackageManager } from '../types.js';
import { resolvePackageRunCommand } from '../process/runner.js';
import spawn from 'cross-spawn';

/**
 * Quality scripts in the order they usually fail fastest: style first, then
 * types, then tests, then the build. Only scripts the project defines run.
 */
export const VERIFY_SCRIPT_ORDER = [
  'format:check',
  'lint',
  'typecheck',
  'check',
  'test',
  'build'
] as const;

export interface VerifyStepResult {
  script: string;
  ok: boolean;
  exitCode: number | null;
  durationMs: number;
}

export function selectVerifyScripts(scripts: Record<string, string>): string[] {
  return VERIFY_SCRIPT_ORDER.filter((script) => scripts[script] !== undefined);
}

/** Run one package script to completion, streaming output to this terminal. */
async function runScriptToCompletion(options: {
  cwd: string;
  packageManager: PackageManager | null;
  script: string;
}): Promise<number | null> {
  const command = await resolvePackageRunCommand(options);
  if (command === null) {
    return null;
  }
  return await new Promise((resolve) => {
    const child = spawn(command.command, command.args, {
      cwd: options.cwd,
      stdio: 'inherit',
      windowsHide: true
    });
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code));
  });
}

/**
 * Run the project's quality scripts sequentially. `runner` is injectable for
 * tests; the default streams each script through the package manager.
 */
export async function runVerify(options: {
  cwd: string;
  packageManager: PackageManager | null;
  scripts: Record<string, string>;
  /** Stop at the first failing script instead of running the whole set. */
  bail?: boolean;
  onStepStart?: (script: string) => void;
  runner?: (script: string) => Promise<number | null>;
}): Promise<VerifyStepResult[]> {
  const selected = selectVerifyScripts(options.scripts);
  const runner =
    options.runner ??
    ((script: string) =>
      runScriptToCompletion({
        cwd: options.cwd,
        packageManager: options.packageManager,
        script
      }));

  const results: VerifyStepResult[] = [];
  for (const script of selected) {
    options.onStepStart?.(script);
    const startedAt = Date.now();
    const exitCode = await runner(script);
    const ok = exitCode === 0;
    results.push({
      script,
      ok,
      exitCode,
      durationMs: Date.now() - startedAt
    });
    if (!ok && options.bail === true) {
      break;
    }
  }
  return results;
}
