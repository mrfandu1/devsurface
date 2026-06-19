import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { GitInfo } from '../types.js';

function isWithinRoot(root: string, target: string): boolean {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  const relative = path.relative(resolvedRoot, resolvedTarget);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function resolveGitDirectory(root: string): Promise<string | null> {
  const gitPath = path.join(root, '.git');

  try {
    const stat = await fs.stat(gitPath);
    if (stat.isDirectory()) {
      return gitPath;
    }

    if (stat.isFile()) {
      const content = await fs.readFile(gitPath, 'utf8');
      const match = content.match(/^gitdir:\s*(.+)\s*$/m);
      if (match) {
        const gitDir = match[1].trim();
        const resolvedGitDir = path.isAbsolute(gitDir)
          ? path.resolve(gitDir)
          : path.resolve(root, gitDir);
        if (!isWithinRoot(root, resolvedGitDir)) {
          return null;
        }

        const [realRoot, realGitDir] = await Promise.all([
          fs.realpath(root),
          fs.realpath(resolvedGitDir)
        ]);
        return isWithinRoot(realRoot, realGitDir) ? resolvedGitDir : null;
      }
    }
  } catch {
    return null;
  }

  return null;
}

export async function detectGit(root: string): Promise<GitInfo | null> {
  const gitRoot = await resolveGitDirectory(root);
  if (gitRoot === null) {
    return null;
  }

  try {
    const head = await fs.readFile(path.join(gitRoot, 'HEAD'), 'utf8');
    const refMatch = head.match(/^ref:\s+refs\/heads\/(.+)\s*$/);
    return {
      root: gitRoot,
      branch: refMatch ? refMatch[1] : head.trim().slice(0, 12)
    };
  } catch {
    return {
      root: gitRoot,
      branch: null
    };
  }
}
