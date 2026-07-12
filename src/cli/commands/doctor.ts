import pc from 'picocolors';
import { runDoctor } from '../../core/doctor/index.js';
import { applyFix, listAvailableFixes } from '../../core/fixes/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalText } from '../terminal.js';

function colorSeverity(severity: 'error' | 'warning' | 'info'): string {
  if (severity === 'error') {
    return pc.red('error');
  }

  if (severity === 'warning') {
    return pc.yellow('warning');
  }

  return pc.cyan('info');
}

const SEVERITY_RANK = { info: 0, warning: 1, error: 2 } as const;

export async function doctorCommand(
  cwd = process.cwd(),
  options: { json?: boolean; failOn?: 'error' | 'warning' | 'info' | 'never'; fix?: boolean } = {}
): Promise<void> {
  let warnings = await runDoctor(cwd);

  // --fix: apply every safe automatic remedy, then re-run the checkup.
  if (options.fix === true) {
    const scan = await scanProject(cwd);
    const fixable = await listAvailableFixes(cwd, scan);
    const relevant = fixable.filter((fix) =>
      warnings.some((warning) => warning.id === fix.warningId)
    );
    if (relevant.length === 0) {
      console.log('No warnings with an automatic fix were found.');
    }
    for (const fix of relevant) {
      const result = await applyFix(cwd, fix.warningId, scan);
      const glyph = result.applied ? pc.green('fixed') : pc.yellow('skipped');
      console.log(`${glyph}  ${safeTerminalText(result.message)}`);
    }
    if (relevant.length > 0) {
      console.log('');
      warnings = await runDoctor(cwd);
    }
  }

  if (options.json === true) {
    console.log(JSON.stringify(warnings, null, 2));
  } else if (warnings.length === 0) {
    console.log(pc.green('No health warnings found.'));
  } else {
    const fixableIds = new Set((await listAvailableFixes(cwd)).map((fix) => fix.warningId));
    for (const item of warnings) {
      console.log(`${colorSeverity(item.severity)} ${pc.bold(safeTerminalText(item.title))}`);
      console.log(`  ${safeTerminalText(item.message)}`);
      if (options.fix !== true && fixableIds.has(item.id)) {
        console.log(pc.dim('  ↳ fixable automatically: run "devsurface doctor --fix"'));
      }
    }
  }

  const failOn = options.failOn ?? 'never';
  if (failOn !== 'never') {
    const threshold = SEVERITY_RANK[failOn];
    if (warnings.some((item) => SEVERITY_RANK[item.severity] >= threshold)) {
      process.exitCode = 1;
    }
  }
}
