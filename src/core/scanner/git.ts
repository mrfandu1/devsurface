import spawn from 'cross-spawn';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { safeDisplayText } from '../security/text.js';
import type { GitCommitInfo, GitInfo } from '../types.js';

const GIT_COMMAND_TIMEOUT_MS = 4_000;
const GIT_OUTPUT_LIMIT = 256 * 1024;

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

/** Strip control characters so git-controlled text is safe to render anywhere. */
export function sanitizeGitText(value: string): string {
  return safeDisplayText(value).trim();
}

/**
 * Run a git command in `root` and return trimmed stdout, or null on any
 * failure (git missing, timeout, non-zero exit). Never throws.
 */
async function runGit(root: string, args: string[]): Promise<string | null> {
  return await new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    let child: ReturnType<typeof spawn>;
    try {
      child = spawn('git', ['-C', root, ...args], {
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true
      });
    } catch {
      finish(null);
      return;
    }

    let output = '';
    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, GIT_COMMAND_TIMEOUT_MS);

    child.stdout?.on('data', (chunk: Buffer) => {
      if (output.length < GIT_OUTPUT_LIMIT) {
        output += chunk.toString('utf8');
      }
    });
    child.on('error', () => {
      clearTimeout(timer);
      finish(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish(code === 0 ? output.replace(/\r?\n$/, '') : null);
    });
  });
}

/** Count changed + untracked files from `git status --porcelain` output. */
export function parsePorcelainStatus(output: string): number {
  return output.split(/\r?\n/).filter((line) => line.trim().length > 0).length;
}

/** Parse `git rev-list --left-right --count upstream...HEAD` ("behind<TAB>ahead"). */
export function parseAheadBehind(output: string): { ahead: number; behind: number } | null {
  const match = output.trim().match(/^(\d+)\s+(\d+)$/);
  if (match === null) {
    return null;
  }
  return { behind: Number(match[1]), ahead: Number(match[2]) };
}

/** Parse `git log -1 --format=%H%x09%an%x09%cI%x09%s` output. */
export function parseLastCommit(output: string): GitCommitInfo | null {
  const [hash, author, date, ...subjectParts] = output.split('\t');
  if (hash === undefined || !/^[0-9a-f]{7,40}$/i.test(hash.trim())) {
    return null;
  }
  return {
    hash: hash.trim(),
    author: sanitizeGitText(author ?? ''),
    date: (date ?? '').trim(),
    subject: sanitizeGitText(subjectParts.join('\t'))
  };
}

/**
 * Extract the origin URL from raw `.git/config` content, with any embedded
 * credentials removed so tokens in remote URLs never reach the UI.
 */
export function parseRemoteUrl(configContent: string): string | null {
  const sectionMatch = configContent.match(/\[remote\s+"origin"\][^[]*?\burl\s*=\s*([^\r\n]+)/);
  const url = sectionMatch?.[1]?.trim();
  if (url === undefined || url.length === 0) {
    return null;
  }
  // Drop userinfo (user:token@) from URL-style remotes.
  return sanitizeGitText(url.replace(/^(\w+:\/\/)[^/@]+@/, '$1'));
}

/**
 * Enrich basic git detection with working-tree and sync insights using the
 * git CLI. Every command is optional: when git is missing or slow, the
 * corresponding fields stay null and detection still succeeds.
 */
async function collectGitInsights(root: string, info: GitInfo): Promise<void> {
  const [status, aheadBehind, lastCommit, commitCount, latestTag, originHead] = await Promise.all([
    runGit(root, ['status', '--porcelain']),
    runGit(root, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']),
    runGit(root, ['log', '-1', '--format=%H%x09%an%x09%cI%x09%s']),
    runGit(root, ['rev-list', '--count', 'HEAD']),
    runGit(root, ['describe', '--tags', '--abbrev=0']),
    runGit(root, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])
  ]);

  info.dirtyFiles = status === null ? null : parsePorcelainStatus(status);
  const counts = aheadBehind === null ? null : parseAheadBehind(aheadBehind);
  info.ahead = counts?.ahead ?? null;
  info.behind = counts?.behind ?? null;
  info.lastCommit = lastCommit === null ? null : parseLastCommit(lastCommit);
  const parsedCount = commitCount === null ? Number.NaN : Number(commitCount.trim());
  info.commitCount = Number.isFinite(parsedCount) ? parsedCount : null;
  info.latestTag = latestTag === null ? null : sanitizeGitText(latestTag);
  // "origin/main" → "main".
  info.defaultBranch =
    originHead === null ? null : sanitizeGitText(originHead.replace(/^origin\//, '')) || null;
}

export async function detectGit(root: string): Promise<GitInfo | null> {
  const gitRoot = await resolveGitDirectory(root);
  if (gitRoot === null) {
    return null;
  }

  const info: GitInfo = {
    root: gitRoot,
    branch: null,
    dirtyFiles: null,
    ahead: null,
    behind: null,
    lastCommit: null,
    remoteUrl: null,
    commitCount: null,
    latestTag: null,
    defaultBranch: null
  };

  try {
    const head = await fs.readFile(path.join(gitRoot, 'HEAD'), 'utf8');
    const refMatch = head.match(/^ref:\s+refs\/heads\/(.+)\s*$/);
    info.branch = refMatch ? refMatch[1] : head.trim().slice(0, 12);
  } catch {
    // Branch stays null; the repo may be mid-operation or bare.
  }

  try {
    const config = await fs.readFile(path.join(gitRoot, 'config'), 'utf8');
    info.remoteUrl = parseRemoteUrl(config);
  } catch {
    // No config file — remote stays null.
  }

  await collectGitInsights(root, info);

  return info;
}
