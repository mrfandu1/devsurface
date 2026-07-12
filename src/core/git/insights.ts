/**
 * Git insights: recent commits, contributors, branches, and changed files,
 * presented for people who have never run `git log`. Read-only — every git
 * call here only inspects history, never modifies it.
 */

import spawn from 'cross-spawn';
import { safeDisplayText } from '../security/text.js';

const GIT_TIMEOUT_MS = 5_000;
const OUTPUT_LIMIT = 512 * 1024;

export interface CommitEntry {
  hash: string;
  author: string;
  /** ISO timestamp. */
  date: string;
  subject: string;
}

export interface ContributorEntry {
  name: string;
  commits: number;
}

export interface BranchEntry {
  name: string;
  current: boolean;
}

export interface ChangedFileEntry {
  /** Two-letter porcelain status, e.g. " M", "??". */
  status: string;
  /** Friendly meaning of the status ("modified", "new file", …). */
  meaning: string;
  file: string;
}

export interface GitInsights {
  available: boolean;
  commits: CommitEntry[];
  contributors: ContributorEntry[];
  branches: BranchEntry[];
  changedFiles: ChangedFileEntry[];
}

function runGit(root: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
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
    }, GIT_TIMEOUT_MS);
    child.stdout?.on('data', (chunk: Buffer) => {
      if (output.length < OUTPUT_LIMIT) {
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

function clean(value: string): string {
  return safeDisplayText(value).trim();
}

/** Parse `git log --pretty=%h%x1f%an%x1f%aI%x1f%s` output. */
export function parseCommitLog(output: string): CommitEntry[] {
  return output
    .split(/\r?\n/)
    .map((line) => line.split('\u001f'))
    .filter((parts) => parts.length === 4)
    .map(([hash, author, date, subject]) => ({
      hash: clean(hash),
      author: clean(author),
      date: clean(date),
      subject: clean(subject).slice(0, 200)
    }));
}

/** Parse `git shortlog -sn` style "  12\tName" lines. */
export function parseContributors(output: string): ContributorEntry[] {
  return output
    .split(/\r?\n/)
    .map((line) => /^\s*(\d+)\s+(.+)$/.exec(line))
    .filter((match): match is RegExpExecArray => match !== null)
    .map((match) => ({ name: clean(match[2]), commits: Number(match[1]) }));
}

const STATUS_MEANINGS: Record<string, string> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  U: 'conflicted',
  '?': 'new file (untracked)'
};

/** Parse `git status --porcelain` lines into friendly changed-file entries. */
export function parseChangedFiles(output: string): ChangedFileEntry[] {
  return output
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 100)
    .map((line) => {
      const status = line.slice(0, 2);
      const key = (status.trim()[0] ?? '?') as string;
      return {
        status,
        meaning: STATUS_MEANINGS[key] ?? 'changed',
        file: clean(line.slice(3))
      };
    });
}

/** Gather all git insights for a repository (parallel, time-boxed). */
export async function gatherGitInsights(root: string, commitLimit = 20): Promise<GitInsights> {
  const [log, shortlog, branchList, status] = await Promise.all([
    runGit(root, ['log', `-${commitLimit}`, '--pretty=%h%x1f%an%x1f%aI%x1f%s']),
    // rev-list|shortlog avoids the pager and works without a tty.
    runGit(root, ['shortlog', '-sn', 'HEAD', '--no-merges']),
    runGit(root, ['branch', '--list', '--no-color']),
    runGit(root, ['status', '--porcelain'])
  ]);

  if (log === null && branchList === null) {
    return { available: false, commits: [], contributors: [], branches: [], changedFiles: [] };
  }

  const branches: BranchEntry[] = (branchList ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .slice(0, 50)
    .map((line) => ({
      name: clean(line.replace(/^\*\s*/, '')),
      current: line.startsWith('*')
    }));

  return {
    available: true,
    commits: log === null ? [] : parseCommitLog(log),
    contributors: shortlog === null ? [] : parseContributors(shortlog).slice(0, 15),
    branches,
    changedFiles: status === null ? [] : parseChangedFiles(status)
  };
}
