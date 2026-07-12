/**
 * TODO / FIXME comment scanner.
 *
 * Surfaces the little promises developers leave themselves in the code —
 * grouped by file, tagged by marker, capped so it stays fast on any repo.
 * Read-only and fully local.
 */

import { promises as fs } from 'node:fs';
import { walkFiles } from '../walk/index.js';

export type TodoMarker = 'TODO' | 'FIXME' | 'HACK' | 'BUG' | 'XXX' | 'NOTE';

export interface TodoItem {
  marker: TodoMarker;
  /** The comment text after the marker, trimmed. */
  text: string;
  /** Repo-relative file path with forward slashes. */
  file: string;
  /** 1-based line number. */
  line: number;
}

export interface TodoReport {
  items: TodoItem[];
  /** Count per marker for the summary chips. */
  counts: Record<TodoMarker, number>;
  /** Files scanned (after caps). */
  scannedFiles: number;
  /** True when caps stopped the scan before covering everything. */
  truncated: boolean;
}

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
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.css',
  '.scss',
  '.less',
  '.html',
  '.sh',
  '.ps1',
  '.sql',
  '.yaml',
  '.yml',
  '.toml',
  '.md'
]);

const MARKER_PATTERN = /(?:\/\/|\/\*|#|<!--|--|;)\s*(TODO|FIXME|HACK|BUG|XXX|NOTE)\b[:\s-]*(.*)/;

const MAX_FILE_BYTES = 512 * 1024;
const MAX_ITEMS = 500;

function extensionOf(relPath: string): string {
  const dot = relPath.lastIndexOf('.');
  return dot === -1 ? '' : relPath.slice(dot).toLowerCase();
}

/** Scan the repository for TODO-style comments. */
export async function scanTodos(root: string): Promise<TodoReport> {
  const files = await walkFiles(root);
  const sourceFiles = files.filter(
    (file) => SOURCE_EXTENSIONS.has(extensionOf(file.relPath)) && file.size <= MAX_FILE_BYTES
  );

  const items: TodoItem[] = [];
  const counts: Record<TodoMarker, number> = {
    TODO: 0,
    FIXME: 0,
    HACK: 0,
    BUG: 0,
    XXX: 0,
    NOTE: 0
  };
  let truncated = false;

  for (const file of sourceFiles) {
    if (items.length >= MAX_ITEMS) {
      truncated = true;
      break;
    }
    let content: string;
    try {
      content = await fs.readFile(file.absPath, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const match = MARKER_PATTERN.exec(lines[index]);
      if (match === null) {
        continue;
      }
      const marker = match[1] as TodoMarker;
      const text = match[2].replace(/\s*(\*\/|-->)\s*$/, '').trim();
      items.push({
        marker,
        text: text.slice(0, 300),
        file: file.relPath,
        line: index + 1
      });
      counts[marker] += 1;
      if (items.length >= MAX_ITEMS) {
        truncated = true;
        break;
      }
    }
  }

  // Urgent markers first, then by file for stable grouping.
  const priority: Record<TodoMarker, number> = {
    FIXME: 0,
    BUG: 1,
    HACK: 2,
    TODO: 3,
    XXX: 4,
    NOTE: 5
  };
  items.sort(
    (left, right) =>
      priority[left.marker] - priority[right.marker] ||
      left.file.localeCompare(right.file) ||
      left.line - right.line
  );

  return { items, counts, scannedFiles: sourceFiles.length, truncated };
}
