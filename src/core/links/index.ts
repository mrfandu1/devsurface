/**
 * Markdown link checker.
 *
 * Reads the Markdown docs in a repo and verifies that every *relative* link
 * and image points at a file that actually exists — the single most common
 * kind of documentation rot. External http(s) links are listed but never
 * fetched (DevSurface makes no network calls). Read-only, path-confined.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { walkFiles } from '../walk/index.js';

export interface BrokenLink {
  /** The doc the link lives in (repo-relative). */
  source: string;
  /** 1-based line number. */
  line: number;
  /** The raw link target. */
  target: string;
  /** Why it is considered broken. */
  reason: string;
}

export interface LinkCheckReport {
  /** Number of Markdown files scanned. */
  docsScanned: number;
  /** Total relative links checked. */
  relativeLinks: number;
  /** Total external (http/https) links found but not fetched. */
  externalLinks: number;
  broken: BrokenLink[];
  truncated: boolean;
}

const LINK_PATTERN = /(?:!?\[[^\]]*\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\))/g;

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_BROKEN = 200;

function isExternal(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('//');
}

function isAnchorOnly(target: string): boolean {
  return target.startsWith('#');
}

async function pathExists(candidate: string): Promise<boolean> {
  try {
    await fs.access(candidate);
    return true;
  } catch {
    return false;
  }
}

/** Check every relative Markdown link in the repo's docs. */
export async function checkLinks(root: string): Promise<LinkCheckReport> {
  const files = await walkFiles(root);
  const docs = files.filter(
    (file) => file.relPath.toLowerCase().endsWith('.md') && file.size <= MAX_FILE_BYTES
  );

  const broken: BrokenLink[] = [];
  let relativeLinks = 0;
  let externalLinks = 0;
  let truncated = false;

  for (const doc of docs) {
    if (broken.length >= MAX_BROKEN) {
      truncated = true;
      break;
    }
    let content: string;
    try {
      content = await fs.readFile(doc.absPath, 'utf8');
    } catch {
      continue;
    }
    const lines = content.split(/\r?\n/);
    const docDir = path.dirname(doc.absPath);

    for (let index = 0; index < lines.length; index += 1) {
      LINK_PATTERN.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = LINK_PATTERN.exec(lines[index])) !== null) {
        const rawTarget = match[1];
        if (isExternal(rawTarget) || isAnchorOnly(rawTarget)) {
          externalLinks += isExternal(rawTarget) ? 1 : 0;
          continue;
        }
        relativeLinks += 1;

        // Strip a trailing anchor (#section) before resolving the path.
        const withoutAnchor = rawTarget.split('#')[0];
        if (withoutAnchor.length === 0) {
          continue;
        }
        const decoded = decodeURIComponent(withoutAnchor);
        const resolved = path.resolve(docDir, decoded);

        // Never report on links that escape the repo — just skip them.
        const relToRoot = path.relative(path.resolve(root), resolved);
        if (relToRoot.startsWith('..') || path.isAbsolute(relToRoot)) {
          continue;
        }

        if (!(await pathExists(resolved))) {
          broken.push({
            source: doc.relPath,
            line: index + 1,
            target: rawTarget,
            reason: 'points to a file that does not exist'
          });
          if (broken.length >= MAX_BROKEN) {
            truncated = true;
            break;
          }
        }
      }
    }
  }

  broken.sort((left, right) => left.source.localeCompare(right.source) || left.line - right.line);

  return { docsScanned: docs.length, relativeLinks, externalLinks, broken, truncated };
}
