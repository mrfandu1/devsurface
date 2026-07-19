/**
 * Test insights.
 *
 * Answers the questions a reviewer asks about a test suite without running
 * it: how many tests exist, which are skipped or focused (`.only` left in!),
 * which source files have no matching test file, and where the TODO tests
 * live. Static analysis only — nothing is executed.
 */

import { promises as fs } from 'node:fs';
import { walkFiles } from '../walk/index.js';

export interface TestFileInsight {
  /** Repo-relative path. */
  file: string;
  /** Number of it/test blocks. */
  tests: number;
  /** Number of describe/suite blocks. */
  suites: number;
  skipped: number;
  /** Focused tests (.only / fit / fdescribe) — these silently disable the rest. */
  focused: number;
  todo: number;
}

export interface TestInsightsReport {
  files: TestFileInsight[];
  totals: {
    files: number;
    tests: number;
    suites: number;
    skipped: number;
    focused: number;
    todo: number;
  };
  /** Files containing .only — a common way to accidentally disable CI coverage. */
  focusedFiles: string[];
  /** Source files with no matching *.test/*.spec neighbor (heuristic, capped). */
  untestedSources: string[];
  truncated: boolean;
}

const TEST_FILE_PATTERN = /\.(test|spec)\.[jt]sx?$|_test\.(py|go|rb)$|^test_.*\.py$|Test\.java$/;
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.py', '.go', '.rb']);

const TEST_BLOCK = /\b(?:it|test)\s*(?:\.\w+)?\s*\(/g;
const SUITE_BLOCK = /\b(?:describe|suite|context)\s*(?:\.\w+)?\s*\(/g;
const SKIPPED_BLOCK =
  /\b(?:it|test|describe)\.skip\s*\(|\bx(?:it|test|describe)\s*\(|@pytest\.mark\.skip|t\.Skip\(/g;
const FOCUSED_BLOCK = /\b(?:it|test|describe)\.only\s*\(|\bf(?:it|describe)\s*\(/g;
const TODO_BLOCK = /\b(?:it|test)\.todo\s*\(/g;

const MAX_FILE_BYTES = 512 * 1024;
const MAX_UNTESTED = 40;

function countMatches(content: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  let count = 0;
  while (pattern.exec(content) !== null) {
    count += 1;
  }
  return count;
}

function baseNameOf(relPath: string): string {
  const slash = relPath.lastIndexOf('/');
  return slash === -1 ? relPath : relPath.slice(slash + 1);
}

function extensionOf(relPath: string): string {
  const dot = relPath.lastIndexOf('.');
  return dot === -1 ? '' : relPath.slice(dot).toLowerCase();
}

/** Strip test/spec suffixes to get the module stem a test file covers. */
export function testStemOf(fileName: string): string {
  return fileName
    .replace(/\.(test|spec)\.[jt]sx?$/, '')
    .replace(/_test\.(py|go|rb)$/, '')
    .replace(/Test\.java$/, '')
    .replace(/^test_/, '')
    .replace(/\.(py|go|rb|java|[jt]sx?)$/, '')
    .toLowerCase();
}

/** Analyze the test suite statically. */
export async function analyzeTests(root: string): Promise<TestInsightsReport> {
  const files = await walkFiles(root);
  const testFiles = files.filter(
    (file) => TEST_FILE_PATTERN.test(baseNameOf(file.relPath)) && file.size <= MAX_FILE_BYTES
  );

  const insights: TestFileInsight[] = [];
  for (const file of testFiles) {
    let content: string;
    try {
      content = await fs.readFile(file.absPath, 'utf8');
    } catch {
      continue;
    }
    insights.push({
      file: file.relPath,
      tests: countMatches(content, TEST_BLOCK),
      suites: countMatches(content, SUITE_BLOCK),
      skipped: countMatches(content, SKIPPED_BLOCK),
      focused: countMatches(content, FOCUSED_BLOCK),
      todo: countMatches(content, TODO_BLOCK)
    });
  }
  insights.sort((left, right) => right.tests - left.tests || left.file.localeCompare(right.file));

  const totals = insights.reduce(
    (accumulator, insight) => ({
      files: accumulator.files + 1,
      tests: accumulator.tests + insight.tests,
      suites: accumulator.suites + insight.suites,
      skipped: accumulator.skipped + insight.skipped,
      focused: accumulator.focused + insight.focused,
      todo: accumulator.todo + insight.todo
    }),
    { files: 0, tests: 0, suites: 0, skipped: 0, focused: 0, todo: 0 }
  );

  const testedStems = new Set(testFiles.map((file) => testStemOf(baseNameOf(file.relPath))));

  // Heuristic: a source file inside src/ (or lib/) with no test file sharing
  // its stem anywhere in the repo is "untested".
  const untestedSources: string[] = [];
  let truncated = false;
  for (const file of files) {
    if (untestedSources.length >= MAX_UNTESTED) {
      truncated = true;
      break;
    }
    const base = baseNameOf(file.relPath);
    if (
      !file.relPath.match(/^(src|lib|app)\//) ||
      TEST_FILE_PATTERN.test(base) ||
      !SOURCE_EXTENSIONS.has(extensionOf(base)) ||
      base === 'index.ts' ||
      base === 'index.js' ||
      base.endsWith('.d.ts')
    ) {
      continue;
    }
    const stem = base.replace(/\.[^.]+$/, '').toLowerCase();
    if (!testedStems.has(stem)) {
      untestedSources.push(file.relPath);
    }
  }

  return {
    files: insights,
    totals,
    focusedFiles: insights.filter((insight) => insight.focused > 0).map((insight) => insight.file),
    untestedSources,
    truncated
  };
}
