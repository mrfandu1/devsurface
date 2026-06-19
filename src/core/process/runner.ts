import spawn from 'cross-spawn';
import type { PackageManager } from '../types.js';
import { resolveExecutableOutsideRoot } from './executable.js';

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

export function isDangerousCommand(command: string): boolean {
  return /\b(rm\s+-rf|docker\s+volume\s+rm|drop\s+database|prisma\s+migrate\s+reset|git\s+clean\s+-fd)\b/i.test(
    command
  );
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
