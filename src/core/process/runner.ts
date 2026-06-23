import spawn from 'cross-spawn';
import type { PackageManager } from '../types.js';
import { isDangerousCommand } from '../security/dangerousCommand.js';
import { resolveExecutableOutsideRoot } from './executable.js';

export { isDangerousCommand };

export interface PackageRunCommand {
  command: string;
  args: string[];
  displayCommand: string;
}

export function getPackageRunCommand(
  packageManager: PackageManager | null,
  script: string
): PackageRunCommand {
  const manager = packageManager ?? 'npm';
  const args = ['run', script];
  return {
    command: manager,
    args,
    displayCommand: `${manager} ${args.join(' ')}`
  };
}

export async function resolvePackageRunCommand(options: {
  cwd: string;
  packageManager: PackageManager | null;
  script: string;
}): Promise<PackageRunCommand | null> {
  const runCommand = getPackageRunCommand(options.packageManager, options.script);
  const executable = await resolveExecutableOutsideRoot(options.cwd, runCommand.command);
  if (executable === null) {
    return null;
  }

  return {
    ...runCommand,
    command: executable
  };
}

export function getPackageInstallCommand(packageManager: PackageManager | null): PackageRunCommand {
  const manager = packageManager ?? 'npm';
  if (manager === 'npm') {
    return {
      command: manager,
      args: ['ci'],
      displayCommand: 'npm ci'
    };
  }

  if (manager === 'pnpm') {
    return {
      command: manager,
      args: ['install', '--frozen-lockfile'],
      displayCommand: 'pnpm install --frozen-lockfile'
    };
  }

  if (manager === 'yarn') {
    return {
      command: manager,
      args: ['install', '--frozen-lockfile'],
      displayCommand: 'yarn install --frozen-lockfile'
    };
  }

  return {
    command: manager,
    args: ['install'],
    displayCommand: 'bun install'
  };
}

export async function resolvePackageInstallCommand(options: {
  cwd: string;
  packageManager: PackageManager | null;
}): Promise<PackageRunCommand | null> {
  const installCommand = getPackageInstallCommand(options.packageManager);
  const executable = await resolveExecutableOutsideRoot(options.cwd, installCommand.command);
  if (executable === null) {
    return null;
  }

  return {
    ...installCommand,
    command: executable
  };
}

export function splitCommandLine(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] ?? '';
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      } else if (character === '\\' && quote === '"') {
        const next = command[index + 1];
        if (next === '"' || next === '\\') {
          index += 1;
          current += next ?? '';
        } else {
          current += character;
        }
      } else {
        current += character;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (/\s/.test(character)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += character;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

export function containsShellMetacharacters(command: string): boolean {
  let quote: '"' | "'" | null = null;

  for (let index = 0; index < command.length; index += 1) {
    const character = command[index] ?? '';
    if (quote !== null) {
      if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === '\n' || character === '\r') {
      return true;
    }

    if (';|&<>'.includes(character)) {
      return true;
    }

    if (character === '`') {
      return true;
    }

    if (character === '$' && (command[index + 1] === '(' || command[index + 1] === '{')) {
      return true;
    }
  }

  return false;
}

export async function resolveConfiguredCommand(
  cwd: string,
  command: string
): Promise<PackageRunCommand | null> {
  const trimmed = command.trim();
  if (trimmed.length === 0 || containsShellMetacharacters(trimmed)) {
    return null;
  }

  const tokens = splitCommandLine(trimmed);
  if (tokens.length === 0) {
    return null;
  }

  const [executableName, ...args] = tokens;
  const executable = await resolveExecutableOutsideRoot(cwd, executableName);
  if (executable === null) {
    return null;
  }

  return {
    command: executable,
    args,
    displayCommand: trimmed
  };
}

export async function runPackageScriptToTerminal(options: {
  cwd: string;
  packageManager: PackageManager | null;
  script: string;
}): Promise<number> {
  const runCommand = await resolvePackageRunCommand(options);
  if (runCommand === null) {
    return 1;
  }

  return await new Promise((resolve) => {
    const child = spawn(runCommand.command, runCommand.args, {
      cwd: options.cwd,
      stdio: 'inherit',
      windowsHide: true
    });

    child.on('error', () => {
      resolve(1);
    });

    child.on('close', (code) => {
      resolve(code ?? 1);
    });
  });
}
