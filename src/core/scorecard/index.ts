/**
 * Project scorecard.
 *
 * A single A-F health grade for a repository, built from the individual
 * analyzers: README quality, test presence, secret hygiene, documentation,
 * dependency health, and git activity. Each category contributes a weighted
 * sub-score and a one-line verdict, so "how healthy is this project?" gets a
 * number *and* a punch list. Everything it reads is local and read-only.
 */

import type { ScanResult } from '../types.js';
import { scoreReadme } from '../readme/index.js';
import { analyzeTests } from '../testinsights/index.js';
import { scanSecrets } from '../secrets/index.js';
import { checkLinks } from '../links/index.js';

export interface ScorecardCategory {
  id: string;
  label: string;
  /** 0-100 sub-score. */
  score: number;
  /** Relative weight in the overall grade. */
  weight: number;
  /** One-line plain-English verdict. */
  verdict: string;
}

export interface Scorecard {
  /** 0-100 overall, weighted across categories. */
  score: number;
  grade: string;
  categories: ScorecardCategory[];
  /** The lowest-scoring categories, as the top things to improve. */
  topSuggestions: string[];
}

function gradeFor(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 55) return 'D';
  return 'F';
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

/** Compute the aggregate project scorecard. */
export async function buildScorecard(root: string, scan: ScanResult): Promise<Scorecard> {
  const [readme, tests, secrets, links] = await Promise.all([
    scoreReadme(root),
    analyzeTests(root),
    scanSecrets(root),
    checkLinks(root)
  ]);

  const categories: ScorecardCategory[] = [];

  // Documentation: README score plus whether a docs folder / changelog exist.
  const docsBonus = (scan.changelog?.exists ? 8 : 0) + (scan.community?.contributing ? 6 : 0);
  categories.push({
    id: 'docs',
    label: 'Documentation',
    score: clamp(readme.score * 0.86 + docsBonus),
    weight: 22,
    verdict:
      readme.score >= 80
        ? 'README covers the essentials.'
        : readme.exists
          ? `README scores ${readme.score}/100 — ${readme.suggestions[0] ?? 'add more detail.'}`
          : 'No README yet — add one first.'
  });

  // Testing: presence and health of the suite.
  const hasTests = tests.totals.files > 0;
  const testScore = !hasTests
    ? 0
    : clamp(70 + Math.min(20, tests.totals.tests) - tests.focusedFiles.length * 15);
  categories.push({
    id: 'tests',
    label: 'Testing',
    score: testScore,
    weight: 20,
    verdict: !hasTests
      ? 'No test files found.'
      : tests.focusedFiles.length > 0
        ? `${tests.totals.tests} tests, but ${tests.focusedFiles.length} file(s) contain .only — CI may skip the rest.`
        : `${tests.totals.tests} tests across ${tests.totals.files} files.`
  });

  // Security: secret leaks are the dominant signal.
  const critical = secrets.findings.filter((finding) => finding.severity === 'critical').length;
  const securityScore = clamp(100 - critical * 40 - (secrets.findings.length - critical) * 12);
  categories.push({
    id: 'security',
    label: 'Secret hygiene',
    score: securityScore,
    weight: 20,
    verdict: secrets.clean
      ? 'No hardcoded secrets detected.'
      : `${secrets.findings.length} possible secret(s) in source — ${critical} critical.`
  });

  // Dependencies: lockfile freshness and declared-but-not-installed.
  const depScore = clamp(
    100 -
      (scan.dependencies?.lockfileStale ? 25 : 0) -
      (scan.dependencies?.lockfile === null ? 20 : 0)
  );
  categories.push({
    id: 'deps',
    label: 'Dependencies',
    score: depScore,
    weight: 14,
    verdict:
      scan.dependencies?.lockfile === null
        ? 'No lockfile — installs are not reproducible.'
        : scan.dependencies?.lockfileStale === true
          ? 'Lockfile looks stale relative to package.json.'
          : 'Lockfile present and current.'
  });

  // Docs links: broken relative links in Markdown.
  const linkScore = clamp(100 - links.broken.length * 10);
  categories.push({
    id: 'links',
    label: 'Doc links',
    score: linkScore,
    weight: 8,
    verdict:
      links.broken.length === 0
        ? 'All relative doc links resolve.'
        : `${links.broken.length} broken relative link(s) in docs.`
  });

  // Git: does history exist and is it active?
  const commitCount = scan.git?.commitCount ?? 0;
  const gitScore = clamp(scan.git === null ? 40 : Math.min(100, 50 + commitCount));
  categories.push({
    id: 'git',
    label: 'Version control',
    score: gitScore,
    weight: 16,
    verdict:
      scan.git === null
        ? 'Not a git repository.'
        : `${commitCount} commit(s) on ${scan.git.branch ?? 'the current branch'}.`
  });

  const totalWeight = categories.reduce((sum, category) => sum + category.weight, 0);
  const score = clamp(
    categories.reduce((sum, category) => sum + category.score * category.weight, 0) / totalWeight
  );

  const topSuggestions = [...categories]
    .filter((category) => category.score < 80)
    .sort((left, right) => left.score - right.score)
    .slice(0, 3)
    .map((category) => `${category.label}: ${category.verdict}`);

  return { score, grade: gradeFor(score), categories, topSuggestions };
}
