/**
 * README quality scorer.
 *
 * Grades the project's README against the sections a newcomer looks for —
 * title, description, install steps, usage, license, badges, and so on — and
 * returns a 0-100 score with specific, friendly suggestions for what to add
 * next. Purely a heuristic over the Markdown; read-only.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface ReadmeCheck {
  id: string;
  label: string;
  passed: boolean;
  /** Points this check contributes when passed. */
  weight: number;
  /** Suggestion shown when the check fails. */
  hint: string;
}

export interface ReadmeScore {
  exists: boolean;
  /** 0-100. */
  score: number;
  /** Letter grade derived from the score. */
  grade: string;
  checks: ReadmeCheck[];
  wordCount: number;
  headingCount: number;
  /** Ordered list of the most valuable missing sections. */
  suggestions: string[];
}

interface CheckSpec {
  id: string;
  label: string;
  weight: number;
  hint: string;
  test: (content: string, lower: string) => boolean;
}

const CHECKS: CheckSpec[] = [
  {
    id: 'title',
    label: 'Has a title heading',
    weight: 10,
    hint: 'Start with a single "# Project Name" heading.',
    test: (content) => /^#\s+\S/m.test(content)
  },
  {
    id: 'description',
    label: 'Has an intro paragraph',
    weight: 10,
    hint: 'Add one or two sentences under the title explaining what it does.',
    test: (content) => {
      const afterTitle = content.replace(/^#\s+.*$/m, '').trim();
      return afterTitle.length > 80;
    }
  },
  {
    id: 'install',
    label: 'Explains how to install',
    weight: 15,
    hint: 'Add an "Installation" section with the exact install command.',
    test: (_content, lower) => /install|getting started|setup|quick start/.test(lower)
  },
  {
    id: 'usage',
    label: 'Shows how to use it',
    weight: 15,
    hint: 'Add a "Usage" section with a runnable example.',
    test: (_content, lower) => /usage|example|how to use|running/.test(lower)
  },
  {
    id: 'code-block',
    label: 'Contains a code example',
    weight: 10,
    hint: 'Include at least one fenced ``` code block with a command or snippet.',
    test: (content) => /```/.test(content)
  },
  {
    id: 'headings',
    label: 'Uses section headings',
    weight: 10,
    hint: 'Break the README into sections with ## headings.',
    test: (content) => (content.match(/^##\s+/gm) ?? []).length >= 2
  },
  {
    id: 'license',
    label: 'Mentions a license',
    weight: 10,
    hint: 'Add a "License" section so people know how they may use it.',
    test: (_content, lower) => /license/.test(lower)
  },
  {
    id: 'badges',
    label: 'Has status badges',
    weight: 5,
    hint: 'Add badges (build, version, coverage) at the top for quick signals.',
    test: (content) => /!\[[^\]]*\]\(https?:\/\/[^)]*(badge|shields\.io|img\.)/i.test(content)
  },
  {
    id: 'links',
    label: 'Links to more docs',
    weight: 5,
    hint: 'Link out to docs, a website, or a contributing guide.',
    test: (content) => /\[[^\]]+\]\([^)]+\)/.test(content)
  },
  {
    id: 'length',
    label: 'Is reasonably detailed',
    weight: 10,
    hint: 'A one-line README rarely answers a newcomer’s questions — expand it.',
    test: (content) => content.trim().split(/\s+/).length >= 120
  }
];

function gradeFor(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

/** Score the README at the repo root (or a provided path). */
export async function scoreReadme(root: string): Promise<ReadmeScore> {
  let content: string | null = null;
  for (const name of ['README.md', 'README', 'readme.md', 'Readme.md']) {
    try {
      content = await fs.readFile(path.join(root, name), 'utf8');
      break;
    } catch {
      // Try the next candidate.
    }
  }

  if (content === null) {
    return {
      exists: false,
      score: 0,
      grade: 'F',
      checks: CHECKS.map((check) => ({
        id: check.id,
        label: check.label,
        passed: false,
        weight: check.weight,
        hint: check.hint
      })),
      wordCount: 0,
      headingCount: 0,
      suggestions: ['Create a README.md — it is the first thing anyone opens.']
    };
  }

  const lower = content.toLowerCase();
  const checks: ReadmeCheck[] = CHECKS.map((check) => ({
    id: check.id,
    label: check.label,
    passed: check.test(content as string, lower),
    weight: check.weight,
    hint: check.hint
  }));

  const score = checks.reduce((sum, check) => sum + (check.passed ? check.weight : 0), 0);
  const suggestions = checks
    .filter((check) => !check.passed)
    .sort((left, right) => right.weight - left.weight)
    .map((check) => check.hint);

  return {
    exists: true,
    score,
    grade: gradeFor(score),
    checks,
    wordCount: content.trim().split(/\s+/).filter(Boolean).length,
    headingCount: (content.match(/^#{1,6}\s+/gm) ?? []).length,
    suggestions
  };
}
