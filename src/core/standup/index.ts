/**
 * Standup helper.
 *
 * Answers "what did I do?" from local git history: your commits over the last
 * N days, grouped by day, plus what is still uncommitted right now. Built for
 * the daily-standup / end-of-week-summary moment, entirely offline. Read-only.
 */

import spawn from 'cross-spawn';
import { safeDisplayText } from '../security/text.js';

const GIT_TIMEOUT_MS = 6_000;
const OUTPUT_LIMIT = 512 * 1024;

export interface StandupCommit {
  hash: string;
  subject: string;
  /** ISO timestamp. */
  date: string;
}

export interface StandupDay {
  /** "YYYY-MM-DD". */
  date: string;
  commits: StandupCommit[];
}

export interface StandupReport {
  available: boolean;
  /** The author whose commits are shown, or null for "everyone". */
  author: string | null;
  sinceDays: number;
  days: StandupDay[];
  totalCommits: number;
  /** Currently uncommitted files ("work in progress"). */
  inProgress: string[];
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

/** Group flat commit lines ("hash\x1fISO\x1fsubject") into days, newest first. */
export function groupCommitsByDay(output: string): StandupDay[] {
  const byDay = new Map<string, StandupCommit[]>();
  for (const line of output.split(/\r?\n/)) {
    const parts = line.split('');
    if (parts.length !== 3) {
      continue;
    }
    const [hash, date, subject] = parts;
    const day = date.slice(0, 10);
    const list = byDay.get(day) ?? [];
    list.push({
      hash: safeDisplayText(hash).trim(),
      date: safeDisplayText(date).trim(),
      subject: safeDisplayText(subject).trim().slice(0, 200)
    });
    byDay.set(day, list);
  }
  return [...byDay.entries()]
    .map(([date, commits]) => ({ date, commits }))
    .sort((left, right) => right.date.localeCompare(left.date));
}

/** Build a standup summary for the last `sinceDays` days. */
export async function buildStandup(
  root: string,
  options: { sinceDays?: number; mineOnly?: boolean } = {}
): Promise<StandupReport> {
  const sinceDays = options.sinceDays ?? 1;
  const args = ['log', `--since=${sinceDays} days ago`, '--pretty=%h%x1f%aI%x1f%s', '--no-merges'];

  let author: string | null = null;
  if (options.mineOnly === true) {
    author = (await runGit(root, ['config', 'user.name']))?.trim() ?? null;
    if (author !== null && author.length > 0) {
      args.push(`--author=${author}`);
    }
  }

  const [log, status] = await Promise.all([
    runGit(root, args),
    runGit(root, ['status', '--porcelain'])
  ]);

  if (log === null) {
    return {
      available: false,
      author,
      sinceDays,
      days: [],
      totalCommits: 0,
      inProgress: []
    };
  }

  const days = groupCommitsByDay(log);
  const totalCommits = days.reduce((sum, day) => sum + day.commits.length, 0);
  const inProgress = (status ?? '')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(0, 50)
    .map((line) => safeDisplayText(line.slice(3)).trim());

  return {
    available: true,
    author: author !== null && author.length > 0 ? author : null,
    sinceDays,
    days,
    totalCommits,
    inProgress
  };
}
