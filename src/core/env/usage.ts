/**
 * Environment-variable usage explorer.
 *
 * Finds where every env key is actually read in the code
 * (`process.env.FOO`, `os.environ["FOO"]`, `os.Getenv("FOO")`, …) and
 * cross-references that with the keys declared in `.env` / `.env.example`,
 * so "declared but never used" and "used but never documented" both surface.
 * Names only — values are never read or displayed.
 */

import { promises as fs } from 'node:fs';
import { walkFiles } from '../walk/index.js';
import type { EnvInfo } from '../types.js';

export interface EnvUsageSite {
  /** Repo-relative file path with forward slashes. */
  file: string;
  /** 1-based line number. */
  line: number;
}

export interface EnvKeyUsage {
  key: string;
  /** Where the key is read in code (capped per key). */
  sites: EnvUsageSite[];
  /** Total reads, even beyond the site cap. */
  count: number;
  declaredInExample: boolean;
  declaredInLocal: boolean;
}

export interface EnvUsageReport {
  /** Every key read somewhere in the code. */
  used: EnvKeyUsage[];
  /** Keys in .env/.env.example that no code ever reads. */
  unused: string[];
  /** Keys read in code but missing from .env.example (undocumented). */
  undocumented: string[];
  scannedFiles: number;
  truncated: boolean;
}

const USAGE_PATTERNS: RegExp[] = [
  /process\.env(?:\.|\[["'`])([A-Z][A-Z0-9_]{1,60})/g,
  /import\.meta\.env\.([A-Z][A-Z0-9_]{1,60})/g,
  /os\.environ(?:\.get\(|\[)["']([A-Z][A-Z0-9_]{1,60})["']/g,
  /os\.getenv\(\s*["']([A-Z][A-Z0-9_]{1,60})["']/g,
  /os\.Getenv\(\s*"([A-Z][A-Z0-9_]{1,60})"/g,
  /ENV(?:\.fetch\(|\[)["']([A-Z][A-Z0-9_]{1,60})["']/g,
  /std::env::var\(\s*"([A-Z][A-Z0-9_]{1,60})"/g,
  /System\.getenv\(\s*"([A-Z][A-Z0-9_]{1,60})"/g
];

const SOURCE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.mts',
  '.vue',
  '.svelte',
  '.astro',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.cs',
  '.php',
  '.sh',
  '.ps1'
]);

/** Framework-injected keys that are expected to be "undocumented". */
const BUILTIN_KEYS = new Set([
  'NODE_ENV',
  'PATH',
  'HOME',
  'CI',
  'PORT',
  'PWD',
  'TERM',
  'SHELL',
  'USER',
  'USERPROFILE',
  'TMPDIR',
  'TEMP',
  'HOSTNAME',
  'DEV',
  'PROD',
  'MODE',
  'BASE_URL',
  'SSR'
]);

const MAX_FILE_BYTES = 512 * 1024;
const MAX_SITES_PER_KEY = 10;
const MAX_KEYS = 200;

function extensionOf(relPath: string): string {
  const dot = relPath.lastIndexOf('.');
  return dot === -1 ? '' : relPath.slice(dot).toLowerCase();
}

/** Scan source files and cross-reference env keys with declarations. */
export async function exploreEnvUsage(root: string, env: EnvInfo | null): Promise<EnvUsageReport> {
  const files = await walkFiles(root);
  const sourceFiles = files.filter(
    (file) => SOURCE_EXTENSIONS.has(extensionOf(file.relPath)) && file.size <= MAX_FILE_BYTES
  );

  const usage = new Map<string, { sites: EnvUsageSite[]; count: number }>();
  let truncated = false;

  for (const file of sourceFiles) {
    let content: string;
    try {
      content = await fs.readFile(file.absPath, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      for (const pattern of USAGE_PATTERNS) {
        pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(lines[index])) !== null) {
          const key = match[1];
          let entry = usage.get(key);
          if (entry === undefined) {
            if (usage.size >= MAX_KEYS) {
              truncated = true;
              continue;
            }
            entry = { sites: [], count: 0 };
            usage.set(key, entry);
          }
          entry.count += 1;
          if (entry.sites.length < MAX_SITES_PER_KEY) {
            entry.sites.push({ file: file.relPath, line: index + 1 });
          }
        }
      }
    }
  }

  const exampleKeys = new Set(env?.exampleKeys ?? []);
  const localKeys = new Set(env?.localKeys ?? []);

  const used: EnvKeyUsage[] = [...usage.entries()]
    .map(([key, entry]) => ({
      key,
      sites: entry.sites,
      count: entry.count,
      declaredInExample: exampleKeys.has(key),
      declaredInLocal: localKeys.has(key)
    }))
    .sort((left, right) => right.count - left.count || left.key.localeCompare(right.key));

  const declared = new Set([...exampleKeys, ...localKeys]);
  const unused = [...declared].filter((key) => !usage.has(key)).sort();
  const undocumented = used
    .filter((entry) => !entry.declaredInExample && !BUILTIN_KEYS.has(entry.key))
    .map((entry) => entry.key);

  return { used, unused, undocumented, scannedFiles: sourceFiles.length, truncated };
}
