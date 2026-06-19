import { constants } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';

function isWithinRoot(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function pathEntries(pathValue: string): string[] {
  return pathValue
    .split(path.delimiter)
    .map((entry) => entry.trim().replace(/^"|"$/g, ''))
    .filter((entry) => entry.length > 0);
}

function hasPathSeparator(command: string): boolean {
  return command.includes('/') || command.includes('\\');
}

function executableNames(command: string): string[] {
  if (process.platform !== 'win32' || path.extname(command)) {
    return [command];
  }

  const extensions = (process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean);
  return extensions.map((extension) => `${command}${extension}`);
}

async function executableOutsideRoot(root: string, candidate: string): Promise<string | null> {
  if (isWithinRoot(root, candidate)) {
    return null;
  }

  try {
    const [realRoot, realCandidate] = await Promise.all([
      fs.realpath(root),
      fs.realpath(candidate)
    ]);
    if (isWithinRoot(realRoot, realCandidate)) {
      return null;
    }

    await fs.access(realCandidate, constants.X_OK);
    return realCandidate;
  } catch {
    return null;
  }
}

export async function resolveExecutableOutsideRoot(
  root: string,
  command: string
): Promise<string | null> {
  if (path.isAbsolute(command) || hasPathSeparator(command)) {
    return await executableOutsideRoot(root, path.resolve(command));
  }

  for (const entry of pathEntries(process.env.PATH ?? '')) {
    const directory = path.resolve(entry);
    if (isWithinRoot(root, directory)) {
      continue;
    }

    for (const executableName of executableNames(command)) {
      const executable = await executableOutsideRoot(root, path.join(directory, executableName));
      if (executable !== null) {
        return executable;
      }
    }
  }

  return null;
}
