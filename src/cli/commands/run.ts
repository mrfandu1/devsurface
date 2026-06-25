import pc from 'picocolors';
import {
  isDangerousCommand,
  runConfiguredCommandToTerminal,
  runPackageScriptToTerminal
} from '../../core/process/runner.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalList, safeTerminalText } from '../terminal.js';

export async function runCommand(script: string, cwd = process.cwd()): Promise<void> {
  const scan = await scanProject(cwd);

  if (scan.scripts[script] !== undefined) {
    const exitCode = await runPackageScriptToTerminal({
      cwd,
      packageManager: scan.packageManager,
      script
    });
    process.exitCode = exitCode;
    return;
  }

  const configuredCommand = scan.config?.config.commands?.[script] ?? scan.presetCommands[script];
  if (configuredCommand !== undefined) {
    if (isDangerousCommand(configuredCommand)) {
      console.error(pc.red(`Refusing to run dangerous command "${safeTerminalText(script)}".`));
      process.exitCode = 1;
      return;
    }

    const exitCode = await runConfiguredCommandToTerminal({
      cwd,
      command: configuredCommand
    });
    process.exitCode = exitCode;
    return;
  }

  const available = [
    ...Object.keys(scan.scripts),
    ...Object.keys(scan.config?.config.commands ?? {}),
    ...Object.keys(scan.presetCommands)
  ];
  const hint = available.length > 0 ? ` Available commands: ${safeTerminalList(available)}.` : '';
  console.error(pc.red(`Command "${safeTerminalText(script)}" was not found.${hint}`));
  process.exitCode = 1;
}
