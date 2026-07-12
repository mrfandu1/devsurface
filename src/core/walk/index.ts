/**
 * Bounded repository walker shared by the TODO scanner, code statistics, and
 * doc finder. Hard caps on depth, file count, and file size keep every
 * consumer fast and predictable on giant repositories.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface WalkedFile {
  /** Absolute path. */
  absPath: string;
  /** Path relative to the walk root, with forward slashes. */
  relPath: string;
  /** File size in bytes. */
  size: number;
}

export interface WalkOptions {
  /** Directory names never descended into (in addition to the defaults). */
  ignoreDirs?: string[];
  /** Maximum directory depth (root = 0). */
  maxDepth?: number;
  /** Stop after this many files. */
  maxFiles?: number;
}

/** Generated/vendor directories no scan should descend into. */
export const DEFAULT_IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.nuxt',
  '.output',
  '.svelte-kit',
  '.turbo',
  '.cache',
  '.parcel-cache',
  '.vite',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  'vendor',
  '.idea',
  '.vscode',
  '.devsurface',
  '.codegraph'
]);

const DEFAULT_MAX_DEPTH = 8;
const DEFAULT_MAX_FILES = 5_000;

/** Walk the tree breadth-first and return regular files, bounded by the caps. */
export async function walkFiles(root: string, options: WalkOptions = {}): Promise<WalkedFile[]> {
  const ignore = new Set([...DEFAULT_IGNORED_DIRS, ...(options.ignoreDirs ?? [])]);
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const maxFiles = options.maxFiles ?? DEFAULT_MAX_FILES;

  const files: WalkedFile[] = [];
  const queue: Array<{ dir: string; depth: number }> = [{ dir: path.resolve(root), depth: 0 }];

  while (queue.length > 0 && files.length < maxFiles) {
    const { dir, depth } = queue.shift() as { dir: string; depth: number };
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (files.length >= maxFiles) {
        break;
      }
      const absPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (depth < maxDepth && !ignore.has(entry.name) && !entry.name.startsWith('.git')) {
          queue.push({ dir: absPath, depth: depth + 1 });
        }
        continue;
      }
      if (!entry.isFile()) {
        continue;
      }
      let size = 0;
      try {
        size = (await fs.stat(absPath)).size;
      } catch {
        continue;
      }
      files.push({
        absPath,
        relPath: path.relative(path.resolve(root), absPath).split(path.sep).join('/'),
        size
      });
    }
  }

  return files;
}
