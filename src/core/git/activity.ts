/**
 * Git activity analytics: when this project gets worked on, which files
 * change the most, and how old the repository is — computed entirely from
 * local history with the same time-boxed, read-only git runner used by the
 * insights module.
 */

import spawn from 'cross-spawn';
import { safeDisplayText } from '../security/text.js';

const GIT_TIMEOUT_MS = 8_000;
const OUTPUT_LIMIT = 1024 * 1024;

export interface ChurnEntry {
  /** Repo-relative file path. */
  file: string;
  /** Number of commits that touched this file in the window. */
  commits: number;
}

export interface ActivityReport {
  available: boolean;
  /** Commits in the analysis window (last `windowDays` days). */
  recentCommits: number;
  windowDays: number;
  /** Commits per weekday, Sunday first (length 7). */
  byWeekday: number[];
  /** Commits per hour of day, 0-23 (length 24). */
  byHour: number[];
  /** Most-changed files in the window. */
  churn: ChurnEntry[];
  /** ISO date of the very first commit, or null. */
  firstCommitDate: string | null;
  /** Age in whole days since the first commit. */
  repoAgeDays: number | null;
  /** Longest run of consecutive days with at least one commit (window-bound). */
  longestStreak: number;
  /** Current run of consecutive days with commits, ending today or yesterday. */
  currentStreak: number;
  /** Weekday name with the most commits, or null when there are none. */
  busiestWeekday: string | null;
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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

/** Compute streaks from a set of "YYYY-MM-DD" day strings. */
export function computeStreaks(days: Set<string>): { longest: number; current: number } {
  if (days.size === 0) {
    return { longest: 0, current: 0 };
  }
  const sorted = [...days].sort();
  let longest = 1;
  let run = 1;
  for (let index = 1; index < sorted.length; index += 1) {
    const previous = new Date(`${sorted[index - 1]}T00:00:00Z`).getTime();
    const current = new Date(`${sorted[index]}T00:00:00Z`).getTime();
    if (current - previous === 86_400_000) {
      run += 1;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  // The current streak only counts if it reaches today or yesterday.
  const today = new Date();
  const dayKey = (date: Date): string => date.toISOString().slice(0, 10);
  let cursor = new Date(today);
  if (!days.has(dayKey(cursor))) {
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  let current = 0;
  while (days.has(dayKey(cursor))) {
    current += 1;
    cursor = new Date(cursor.getTime() - 86_400_000);
  }
  return { longest, current };
}

/** Parse ISO author dates into weekday/hour/day buckets. */
export function bucketCommitDates(lines: string[]): {
  byWeekday: number[];
  byHour: number[];
  days: Set<string>;
} {
  const byWeekday = new Array<number>(7).fill(0);
  const byHour = new Array<number>(24).fill(0);
  const days = new Set<string>();
  for (const line of lines) {
    const date = new Date(line.trim());
    if (Number.isNaN(date.getTime())) {
      continue;
    }
    byWeekday[date.getDay()] += 1;
    byHour[date.getHours()] += 1;
    days.add(line.trim().slice(0, 10));
  }
  return { byWeekday, byHour, days };
}

/** Gather commit-rhythm analytics for the last `windowDays` days. */
export async function gatherActivity(root: string, windowDays = 90): Promise<ActivityReport> {
  const since = `--since=${windowDays} days ago`;
  const [dates, nameOnly, firstCommit] = await Promise.all([
    runGit(root, ['log', since, '--pretty=%aI']),
    runGit(root, ['log', since, '--name-only', '--pretty=%x01', '--no-merges']),
    runGit(root, ['log', '--reverse', '--pretty=%aI', '--max-count=1'])
  ]);

  if (dates === null && firstCommit === null) {
    return {
      available: false,
      recentCommits: 0,
      windowDays,
      byWeekday: new Array<number>(7).fill(0),
      byHour: new Array<number>(24).fill(0),
      churn: [],
      firstCommitDate: null,
      repoAgeDays: null,
      longestStreak: 0,
      currentStreak: 0,
      busiestWeekday: null
    };
  }

  const dateLines = (dates ?? '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  const { byWeekday, byHour, days } = bucketCommitDates(dateLines);
  const { longest, current } = computeStreaks(days);

  const churnCounts = new Map<string, number>();
  for (const line of (nameOnly ?? '').split(/\r?\n/)) {
    const file = line.trim();
    if (file.length === 0 || file.charCodeAt(0) === 1) {
      continue;
    }
    churnCounts.set(file, (churnCounts.get(file) ?? 0) + 1);
  }
  const churn: ChurnEntry[] = [...churnCounts.entries()]
    .map(([file, commits]) => ({ file: safeDisplayText(file), commits }))
    .sort((left, right) => right.commits - left.commits || left.file.localeCompare(right.file))
    .slice(0, 20);

  const firstDate = firstCommit !== null && firstCommit.length > 0 ? firstCommit.trim() : null;
  const repoAgeDays =
    firstDate === null
      ? null
      : Math.max(0, Math.floor((Date.now() - new Date(firstDate).getTime()) / 86_400_000));

  const maxWeekday = Math.max(...byWeekday);

  return {
    available: true,
    recentCommits: dateLines.length,
    windowDays,
    byWeekday,
    byHour,
    churn,
    firstCommitDate: firstDate,
    repoAgeDays,
    longestStreak: longest,
    currentStreak: current,
    busiestWeekday: maxWeekday === 0 ? null : WEEKDAYS[byWeekday.indexOf(maxWeekday)]
  };
}
