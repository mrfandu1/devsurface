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

export async function doctorCommand(cwd = process.cwd()): Promise<void> {
  const warnings = await runDoctor(cwd);

  if (warnings.length === 0) {
    console.log(pc.green('No health warnings found.'));
    return;
  }

  for (const item of warnings) {
    console.log(`${colorSeverity(item.severity)} ${pc.bold(safeTerminalText(item.title))}`);
    console.log(`  ${safeTerminalText(item.message)}`);
  }
}
