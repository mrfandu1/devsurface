/**
 * Repository bloat finder.
 *
 * Surfaces the things that quietly make a repo heavy and awkward to clone:
 * very large tracked files, binary blobs that probably belong in Git LFS or
 * external storage, generated files that look committed by mistake, and the
 * biggest directories by file count. Read-only, bounded walk.
 */

import { walkFiles } from '../walk/index.js';

export interface LargeFile {
  file: string;
  bytes: number;
  /** True when the extension looks like a binary/media asset. */
  binary: boolean;
}

export interface BloatReport {
  /** Largest files in the tree (source dirs only; vendored dirs excluded). */
  largest: LargeFile[];
  /** Binary/media files over the size threshold — LFS candidates. */
  lfsCandidates: LargeFile[];
  /** Files whose names suggest they were generated and committed by mistake. */
  suspiciousCommitted: string[];
  /** Directories ranked by how many files they hold. */
  heaviestDirs: Array<{ dir: string; files: number; bytes: number }>;
  totalFiles: number;
  totalBytes: number;
}

const BINARY_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.tiff',
  '.ico',
  '.webp',
  '.psd',
  '.ai',
  '.mp4',
  '.mov',
  '.avi',
  '.mkv',
  '.webm',
  '.mp3',
  '.wav',
  '.flac',
  '.ogg',
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.pdf',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.eot',
  '.wasm',
  '.exe',
  '.dll',
  '.so',
  '.dylib',
  '.bin',
  '.dat',
  '.sqlite',
  '.db'
]);

/** File names that usually indicate generated output committed by accident. */
const SUSPICIOUS_NAMES = [
  /\.min\.(js|css)$/,
  /\.map$/,
  /^bundle\./,
  /\.log$/,
  /\.tsbuildinfo$/,
  /\.DS_Store$/,
  /Thumbs\.db$/,
  /\.orig$/,
  /\.bak$/,
  /~$/
];

const LARGE_FILE_THRESHOLD = 512 * 1024; // 512 KB
const LFS_THRESHOLD = 1024 * 1024; // 1 MB

function extensionOf(relPath: string): string {
  const dot = relPath.lastIndexOf('.');
  return dot === -1 ? '' : relPath.slice(dot).toLowerCase();
}

function baseNameOf(relPath: string): string {
  const slash = relPath.lastIndexOf('/');
  return slash === -1 ? relPath : relPath.slice(slash + 1);
}

function topDir(relPath: string): string {
  const slash = relPath.indexOf('/');
  return slash === -1 ? '.' : relPath.slice(0, slash);
}

/** Build the bloat report for a repository. */
export async function findBloat(root: string): Promise<BloatReport> {
  const files = await walkFiles(root, { maxFiles: 20_000 });

  const largeFiles: LargeFile[] = [];
  const suspiciousCommitted: string[] = [];
  const dirStats = new Map<string, { files: number; bytes: number }>();
  let totalBytes = 0;

  for (const file of files) {
    totalBytes += file.size;

    const dir = topDir(file.relPath);
    const stat = dirStats.get(dir) ?? { files: 0, bytes: 0 };
    stat.files += 1;
    stat.bytes += file.size;
    dirStats.set(dir, stat);

    const base = baseNameOf(file.relPath);
    if (SUSPICIOUS_NAMES.some((pattern) => pattern.test(base))) {
      suspiciousCommitted.push(file.relPath);
    }

    if (file.size >= LARGE_FILE_THRESHOLD) {
      largeFiles.push({
        file: file.relPath,
        bytes: file.size,
        binary: BINARY_EXTENSIONS.has(extensionOf(base))
      });
    }
  }

  largeFiles.sort((left, right) => right.bytes - left.bytes);

  const heaviestDirs = [...dirStats.entries()]
    .map(([dir, stat]) => ({ dir, files: stat.files, bytes: stat.bytes }))
    .sort((left, right) => right.files - left.files)
    .slice(0, 15);

  return {
    largest: largeFiles.slice(0, 20),
    lfsCandidates: largeFiles
      .filter((file) => file.binary && file.bytes >= LFS_THRESHOLD)
      .slice(0, 20),
    suspiciousCommitted: suspiciousCommitted.slice(0, 30),
    heaviestDirs,
    totalFiles: files.length,
    totalBytes
  };
}
