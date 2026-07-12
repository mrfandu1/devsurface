/**
 * Documentation finder for the in-dashboard doc viewer: locates Markdown
 * files at the repository root and in doc-ish folders, and reads one safely
 * (path confined to the repository, Markdown only, size-capped).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { walkFiles } from '../walk/index.js';

export interface DocEntry {
  /** Repo-relative path with forward slashes. */
  path: string;
  /** Filename-derived title, e.g. "CONTRIBUTING" or "docs/setup". */
  title: string;
  size: number;
}

const DOC_DIRS = new Set(['docs', 'doc', 'documentation', 'wiki', '.github']);
const MAX_DOC_BYTES = 512 * 1024;
const MAX_DOCS = 50;

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

/** List Markdown docs at the root and inside common doc folders. */
export async function listDocs(root: string): Promise<DocEntry[]> {
  const files = await walkFiles(root, { maxDepth: 3 });
  const docs = files
    .filter((file) => /\.(md|mdx|markdown)$/i.test(file.relPath))
    .filter((file) => {
      const top = file.relPath.split('/')[0];
      return !file.relPath.includes('/') || DOC_DIRS.has(top.toLowerCase());
    })
    .map((file) => ({
      path: file.relPath,
      title: file.relPath.replace(/\.(md|mdx|markdown)$/i, ''),
      size: file.size
    }))
    .sort((left, right) => {
      // README always first, then root files, then folders alphabetically.
      const rank = (doc: DocEntry): number =>
        /^readme$/i.test(doc.title) ? 0 : doc.path.includes('/') ? 2 : 1;
      return rank(left) - rank(right) || left.path.localeCompare(right.path);
    });
  return docs.slice(0, MAX_DOCS);
}

/**
 * Read one Markdown doc by repo-relative path. Returns null when the path
 * escapes the repository, is not Markdown, or is too large.
 */
export async function readDoc(root: string, relPath: string): Promise<string | null> {
  if (!/\.(md|mdx|markdown)$/i.test(relPath) || relPath.includes('\0')) {
    return null;
  }
  const absPath = path.join(root, relPath);
  if (!isWithinRoot(root, absPath)) {
    return null;
  }
  try {
    const [realRoot, realTarget] = await Promise.all([fs.realpath(root), fs.realpath(absPath)]);
    if (!isWithinRoot(realRoot, realTarget)) {
      return null;
    }
    const stat = await fs.stat(realTarget);
    if (!stat.isFile() || stat.size > MAX_DOC_BYTES) {
      return null;
    }
    return await fs.readFile(realTarget, 'utf8');
  } catch {
    return null;
  }
}
