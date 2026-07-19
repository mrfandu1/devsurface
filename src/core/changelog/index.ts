/**
 * Release notes / changelog helper.
 *
 * Two related things: parse an existing CHANGELOG.md into structured
 * versions, and draft release notes for the *unreleased* work by reading the
 * commits since the latest git tag and grouping them by Conventional-Commit
 * type (feat, fix, docs, …). Read-only; the draft is returned as Markdown for
 * you to paste and edit — nothing is written or pushed.
 */

import spawn from 'cross-spawn';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { safeDisplayText } from '../security/text.js';

const GIT_TIMEOUT_MS = 6_000;
const OUTPUT_LIMIT = 512 * 1024;

export interface ChangelogVersion {
  version: string;
  /** Heading text after the version, often a date. */
  heading: string;
  /** Bullet lines under this version (capped). */
  entries: string[];
}

export interface ReleaseDraft {
  /** The tag the draft is measured from, or null when there are no tags. */
  sinceTag: string | null;
  /** Commits grouped by conventional type. */
  groups: Array<{ type: string; label: string; commits: string[] }>;
  totalCommits: number;
  /** Ready-to-paste Markdown. */
  markdown: string;
}

export interface ChangelogReport {
  hasChangelog: boolean;
  versions: ChangelogVersion[];
  draft: ReleaseDraft;
}

const TYPE_LABELS: Record<string, string> = {
  feat: 'Features',
  fix: 'Bug fixes',
  perf: 'Performance',
  refactor: 'Refactoring',
  docs: 'Documentation',
  test: 'Tests',
  build: 'Build system',
  ci: 'CI',
  chore: 'Chores',
  style: 'Styling',
  other: 'Other changes'
};

const TYPE_ORDER = [
  'feat',
  'fix',
  'perf',
  'refactor',
  'docs',
  'test',
  'build',
  'ci',
  'chore',
  'style',
  'other'
];

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

/** Parse the "## x.y.z" sections of a CHANGELOG into structured versions. */
export function parseChangelog(markdown: string): ChangelogVersion[] {
  const lines = markdown.split(/\r?\n/);
  const versions: ChangelogVersion[] = [];
  let current: ChangelogVersion | null = null;

  for (const line of lines) {
    const heading = /^##\s+(.+)$/.exec(line);
    if (heading !== null) {
      if (current !== null) {
        versions.push(current);
      }
      const text = heading[1].trim();
      const versionMatch = /(\d+\.\d+\.\d+[\w.-]*)/.exec(text);
      current = {
        version: versionMatch !== null ? versionMatch[1] : text.slice(0, 40),
        heading: safeDisplayText(text).slice(0, 120),
        entries: []
      };
      continue;
    }
    const bullet = /^\s*[-*]\s+(.+)$/.exec(line);
    if (bullet !== null && current !== null && current.entries.length < 100) {
      current.entries.push(safeDisplayText(bullet[1]).slice(0, 300));
    }
  }
  if (current !== null) {
    versions.push(current);
  }
  return versions.slice(0, 50);
}

/** Group "hash subject" commit lines by Conventional-Commit type. */
export function draftFromCommits(
  lines: string[]
): Array<{ type: string; label: string; commits: string[] }> {
  const byType = new Map<string, string[]>();
  for (const raw of lines) {
    const line = raw.trim();
    if (line.length === 0) {
      continue;
    }
    const spaceIndex = line.indexOf(' ');
    const subject = spaceIndex === -1 ? line : line.slice(spaceIndex + 1);
    const typeMatch = /^(\w+)(?:\([^)]*\))?!?:\s*(.+)$/.exec(subject);
    const type =
      typeMatch !== null && TYPE_LABELS[typeMatch[1]] !== undefined ? typeMatch[1] : 'other';
    const text = typeMatch !== null ? typeMatch[2] : subject;
    const list = byType.get(type) ?? [];
    if (list.length < 100) {
      list.push(safeDisplayText(text).slice(0, 200));
    }
    byType.set(type, list);
  }

  return TYPE_ORDER.filter((type) => byType.has(type)).map((type) => ({
    type,
    label: TYPE_LABELS[type],
    commits: byType.get(type) ?? []
  }));
}

function renderDraftMarkdown(
  groups: Array<{ type: string; label: string; commits: string[] }>,
  sinceTag: string | null
): string {
  if (groups.length === 0) {
    return sinceTag === null ? '_No commits yet._\n' : `_No commits since ${sinceTag}._\n`;
  }
  const lines: string[] = [];
  for (const group of groups) {
    lines.push(`### ${group.label}`, '');
    for (const commit of group.commits) {
      lines.push(`- ${commit}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

/** Build the combined changelog report: parsed history + unreleased draft. */
export async function buildChangelogReport(root: string): Promise<ChangelogReport> {
  let markdown = '';
  let hasChangelog = false;
  for (const name of ['CHANGELOG.md', 'CHANGELOG', 'HISTORY.md', 'changelog.md']) {
    try {
      markdown = await fs.readFile(path.join(root, name), 'utf8');
      hasChangelog = true;
      break;
    } catch {
      // Try the next candidate.
    }
  }

  const latestTag = (await runGit(root, ['describe', '--tags', '--abbrev=0']))?.trim() || null;
  const range = latestTag !== null ? `${latestTag}..HEAD` : 'HEAD';
  const log = await runGit(root, ['log', range, '--pretty=%h %s', '--no-merges']);
  const commitLines = (log ?? '').split(/\r?\n/).filter((line) => line.trim().length > 0);
  const groups = draftFromCommits(commitLines);

  return {
    hasChangelog,
    versions: hasChangelog ? parseChangelog(markdown) : [],
    draft: {
      sinceTag: latestTag,
      groups,
      totalCommits: commitLines.length,
      markdown: renderDraftMarkdown(groups, latestTag)
    }
  };
}
