import pc from 'picocolors';
import { runDoctor } from '../../core/doctor/index.js';
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
  options: { json?: boolean; failOn?: 'error' | 'warning' | 'info' | 'never' } = {}
): Promise<void> {
  const warnings = await runDoctor(cwd);

  if (options.json === true) {
    console.log(JSON.stringify(warnings, null, 2));
  } else if (warnings.length === 0) {
    console.log(pc.green('No health warnings found.'));
  } else {
    for (const item of warnings) {
      console.log(`${colorSeverity(item.severity)} ${pc.bold(safeTerminalText(item.title))}`);
      console.log(`  ${safeTerminalText(item.message)}`);
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
