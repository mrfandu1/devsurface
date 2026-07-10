import readline from 'node:readline';
import pc from 'picocolors';
import { explainScript } from '../../core/explain/index.js';
import {
  isDangerousCommand,
  runConfiguredCommandToTerminal,
  runPackageScriptToTerminal
} from '../../core/process/runner.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalList, safeTerminalText } from '../terminal.js';

function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Interactive picker used when `devsurface run` is called without a script:
 * numbered list with plain-English hints, pick by number or name.
 */
export async function pickScriptInteractively(cwd = process.cwd()): Promise<void> {
  const scan = await scanProject(cwd);
  const names = Object.keys(scan.scripts);

  if (names.length === 0) {
    console.error(pc.red('No package scripts were found in this project.'));
    process.exitCode = 1;
    return;
  }

  console.log(pc.bold('Pick a script to run:\n'));
  names.forEach((name, index) => {
    console.log(
      `  ${pc.cyan(String(index + 1).padStart(2))}. ${safeTerminalText(name).padEnd(20)} ${pc.dim(
        explainScript(name, scan.scripts[name])
      )}`
    );
  });

  if (!process.stdin.isTTY) {
    console.log(pc.dim('\nNot a terminal — run one with: devsurface run <script>'));
    return;
  }

  const answer = await promptLine('\nNumber or name (Enter to cancel): ');
  if (answer.length === 0) {
    return;
  }
  const byNumber = Number(answer);
  const script =
    Number.isInteger(byNumber) && byNumber >= 1 && byNumber <= names.length
      ? names[byNumber - 1]
      : answer;
  await runCommand(script, cwd);
}

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
