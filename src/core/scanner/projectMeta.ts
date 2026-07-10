import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Directories that never contain project-owned test files. */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  'vendor',
  '.next',
  '.nuxt',
  'target'
]);

const TEST_FILE_PATTERN = /\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py|rb)$|^test_.*\.py$/;
const MAX_SCAN_ENTRIES = 4000;
const MAX_SCAN_DEPTH = 5;

/**
 * Identify the license from LICENSE file content, checking distinctive
 * phrases rather than trusting the (often missing) title line.
 */
export function detectLicenseType(content: string): string | null {
  const head = content.slice(0, 2000);
  if (/MIT License|Permission is hereby granted, free of charge/i.test(head)) {
    return 'MIT';
  }
  if (/Apache License[\s\S]{0,40}Version 2\.0/i.test(head)) {
    return 'Apache-2.0';
  }
  if (/GNU AFFERO GENERAL PUBLIC LICENSE/i.test(head)) {
    return 'AGPL-3.0';
  }
  if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(head)) {
    return 'LGPL';
  }
  if (/GNU GENERAL PUBLIC LICENSE[\s\S]{0,60}Version 3/i.test(head)) {
    return 'GPL-3.0';
  }
  if (/GNU GENERAL PUBLIC LICENSE[\s\S]{0,60}Version 2/i.test(head)) {
    return 'GPL-2.0';
  }
  if (/Redistribution and use in source and binary forms/i.test(head)) {
    return 'BSD';
  }
  if (/ISC License|Permission to use, copy, modify, and\/or distribute/i.test(head)) {
    return 'ISC';
  }
  if (/Mozilla Public License[\s\S]{0,20}2\.0/i.test(head)) {
    return 'MPL-2.0';
  }
  if (/The Unlicense|This is free and unencumbered software/i.test(head)) {
    return 'Unlicense';
  }
  return null;
}

/** The most recent version heading from CHANGELOG content ("## 1.2.3" or "## [1.2.3]"). */
export function latestChangelogVersion(content: string): string | null {
  const match = content.match(/^#{1,3}\s*\[?v?(\d+\.\d+\.\d+[^\]\s]*)\]?/m);
  return match?.[1] ?? null;
}

async function readIfPresent(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

async function anyFileExists(root: string, names: string[]): Promise<boolean> {
  for (const name of names) {
    try {
      if ((await fs.stat(path.join(root, name))).isFile()) {
        return true;
      }
    } catch {
      // Try the next candidate.
    }
  }
  return false;
}

export async function detectChangelog(
  root: string
): Promise<{ exists: boolean; latestVersion: string | null }> {
  for (const name of ['CHANGELOG.md', 'CHANGELOG', 'HISTORY.md']) {
    const content = await readIfPresent(path.join(root, name));
    if (content !== null) {
      return { exists: true, latestVersion: latestChangelogVersion(content) };
    }
  }
  return { exists: false, latestVersion: null };
}

export async function detectCommunityFiles(
  root: string
): Promise<{ contributing: boolean; codeOfConduct: boolean }> {
  const [contributing, codeOfConduct] = await Promise.all([
    anyFileExists(root, [
      'CONTRIBUTING.md',
      'CONTRIBUTING',
      path.join('.github', 'CONTRIBUTING.md')
    ]),
    anyFileExists(root, ['CODE_OF_CONDUCT.md', path.join('.github', 'CODE_OF_CONDUCT.md')])
  ]);
  return { contributing, codeOfConduct };
}

/** Recommended extensions from .vscode/extensions.json (identifiers only, capped). */
export async function detectVscodeExtensions(root: string): Promise<string[]> {
  const content = await readIfPresent(path.join(root, '.vscode', 'extensions.json'));
  if (content === null) {
    return [];
  }
  try {
    const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const parsed = JSON.parse(stripped) as { recommendations?: unknown };
    if (!Array.isArray(parsed.recommendations)) {
      return [];
    }
    return parsed.recommendations
      .filter((item): item is string => typeof item === 'string' && /^[\w-]+\.[\w-]+$/.test(item))
      .slice(0, 20);
  } catch {
    return [];
  }
}

/** Count test files with a bounded walk so huge repos cannot stall a scan. */
export async function countTestFiles(root: string): Promise<number> {
  let count = 0;
  let scanned = 0;

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > MAX_SCAN_DEPTH || scanned >= MAX_SCAN_ENTRIES) {
      return;
    }
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (scanned >= MAX_SCAN_ENTRIES) {
        return;
      }
      scanned += 1;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith('.')) {
          await walk(path.join(dir, entry.name), depth + 1);
        }
      } else if (TEST_FILE_PATTERN.test(entry.name)) {
        count += 1;
      }
    }
  }

  await walk(root, 0);
  return count;
}
