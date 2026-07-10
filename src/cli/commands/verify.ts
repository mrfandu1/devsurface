import pc from 'picocolors';
import { runVerify, selectVerifyScripts } from '../../core/verify/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalText } from '../terminal.js';

function formatDuration(durationMs: number): string {
  const seconds = durationMs / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${(seconds / 60).toFixed(1)}m`;
}

/**
 * Run the project's quality scripts (format check, lint, typecheck, test,
 * build — whichever exist) sequentially and summarize the results.
 */
export async function verifyCommand(
  cwd = process.cwd(),
  options: { only?: string[]; skip?: string[]; json?: boolean; bail?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  let scripts = scan.scripts;
  if (options.only !== undefined && options.only.length > 0) {
    const wanted = new Set(options.only);
    scripts = Object.fromEntries(Object.entries(scripts).filter(([name]) => wanted.has(name)));
  }
  if (options.skip !== undefined && options.skip.length > 0) {
    const excluded = new Set(options.skip);
    scripts = Object.fromEntries(Object.entries(scripts).filter(([name]) => !excluded.has(name)));
  }
  const selected = selectVerifyScripts(scripts);

  if (selected.length === 0) {
    if (options.json === true) {
      console.log('[]');
      return;
    }
    console.log(
      'No verify scripts found. Looked for: format:check, lint, typecheck, check, test, build.'
    );
    return;
  }

  if (options.json !== true) {
    console.log(
      `Running ${selected.length} script${selected.length === 1 ? '' : 's'}: ${selected.join(', ')}\n`
    );
  }

  const results = await runVerify({
    cwd: scan.root,
    packageManager: scan.packageManager,
    scripts,
    bail: options.bail,
    onStepStart: (script) => {
      if (options.json !== true) {
        console.log(pc.bold(`\n> ${safeTerminalText(script)}`));
      }
    }
  });

  if (options.json === true) {
    console.log(JSON.stringify(results, null, 2));
    if (results.some((result) => !result.ok)) {
      process.exitCode = 1;
    }
    return;
  }

  console.log(`\n${pc.bold('Verify summary')}`);
  for (const result of results) {
    const mark = result.ok ? pc.green('✓') : pc.red('✗');
    const detail = result.ok
      ? ''
      : result.exitCode === null
        ? ' (could not run)'
        : ` (exit ${result.exitCode})`;
    console.log(
      `  ${mark} ${safeTerminalText(result.script).padEnd(16)} ${formatDuration(result.durationMs).padStart(7)}${detail}`
    );
  }

  const failed = results.filter((result) => !result.ok);
  if (failed.length > 0) {
    console.log(`\n${pc.red(`${failed.length} of ${results.length} scripts failed.`)}`);
    process.exitCode = 1;
  } else {
    console.log(`\n${pc.green(`All ${results.length} scripts passed.`)}`);
  }
}
