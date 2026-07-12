/**
 * Code statistics: how big is this project, in human terms.
 *
 * Lines of code by language, file counts, the largest source files, and
 * total size — computed with the shared bounded walker so it finishes fast
 * everywhere. Read-only and fully local.
 */

import { promises as fs } from 'node:fs';
import { walkFiles } from '../walk/index.js';

export interface LanguageStat {
  /** Friendly language name, e.g. "TypeScript". */
  language: string;
  files: number;
  lines: number;
  bytes: number;
}

export interface LargeFileStat {
  file: string;
  lines: number;
  bytes: number;
}

export interface CodeStats {
  totalFiles: number;
  totalLines: number;
  totalBytes: number;
  languages: LanguageStat[];
  largestFiles: LargeFileStat[];
  /** True when the walker's caps stopped the scan early. */
  truncated: boolean;
}

const EXTENSION_LANGUAGES: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript (React)',
  '.mts': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript (React)',
  '.mjs': 'JavaScript',
  '.cjs': 'JavaScript',
  '.vue': 'Vue',
  '.svelte': 'Svelte',
  '.astro': 'Astro',
  '.py': 'Python',
  '.rb': 'Ruby',
  '.go': 'Go',
  '.rs': 'Rust',
  '.java': 'Java',
  '.kt': 'Kotlin',
  '.cs': 'C#',
  '.php': 'PHP',
  '.c': 'C',
  '.h': 'C header',
  '.cpp': 'C++',
  '.hpp': 'C++ header',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.less': 'Less',
  '.html': 'HTML',
  '.md': 'Markdown',
  '.mdx': 'MDX',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.toml': 'TOML',
  '.sql': 'SQL',
  '.sh': 'Shell',
  '.ps1': 'PowerShell',
  '.prisma': 'Prisma schema',
  '.graphql': 'GraphQL',
  '.proto': 'Protocol Buffers'
};

const MAX_COUNTED_FILE_BYTES = 1024 * 1024;
const LARGEST_FILES_LIMIT = 10;
const WALK_CAP = 5_000;

async function countLines(absPath: string): Promise<number> {
  try {
    const content = await fs.readFile(absPath, 'utf8');
    if (content.length === 0) {
      return 0;
    }
    let lines = 1;
    for (let index = 0; index < content.length; index += 1) {
      if (content.charCodeAt(index) === 10) {
        lines += 1;
      }
    }
    return lines;
  } catch {
    return 0;
  }
}

/** Human-friendly byte formatting shared by the CLI and dashboard. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : Math.round(value * 10) / 10} ${units[unit]}`;
}

/** Compute code statistics for the repository. */
export async function computeCodeStats(root: string): Promise<CodeStats> {
  const files = await walkFiles(root);
  const truncated = files.length >= WALK_CAP;

  const byLanguage = new Map<string, LanguageStat>();
  const sized: LargeFileStat[] = [];
  let totalFiles = 0;
  let totalLines = 0;
  let totalBytes = 0;

  for (const file of files) {
    const dot = file.relPath.lastIndexOf('.');
    const extension = dot === -1 ? '' : file.relPath.slice(dot).toLowerCase();
    const language = EXTENSION_LANGUAGES[extension];
    if (language === undefined || file.size > MAX_COUNTED_FILE_BYTES) {
      continue;
    }
    const lines = await countLines(file.absPath);
    totalFiles += 1;
    totalLines += lines;
    totalBytes += file.size;
    const entry = byLanguage.get(language) ?? { language, files: 0, lines: 0, bytes: 0 };
    entry.files += 1;
    entry.lines += lines;
    entry.bytes += file.size;
    byLanguage.set(language, entry);
    sized.push({ file: file.relPath, lines, bytes: file.size });
  }

  sized.sort((left, right) => right.lines - left.lines);

  return {
    totalFiles,
    totalLines,
    totalBytes,
    languages: [...byLanguage.values()].sort((left, right) => right.lines - left.lines),
    largestFiles: sized.slice(0, LARGEST_FILES_LIMIT),
    truncated
  };
}
