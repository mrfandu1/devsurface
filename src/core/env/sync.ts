import { promises as fs } from 'node:fs';
import type { EnvInfo } from '../types.js';

export interface EnvSyncResult {
  ok: boolean;
  /** Keys appended to .env (values come from the example's own lines). */
  added: string[];
  created: boolean;
  error: string | null;
}

/** The example lines belonging to the given keys, in file order. */
export function exampleLinesForKeys(
  exampleContent: string,
  keys: string[]
): Array<{ key: string; line: string }> {
  const wanted = new Set(keys);
  const lines: Array<{ key: string; line: string }> = [];
  for (const rawLine of exampleContent.split(/\r?\n/)) {
    const line = rawLine.trim();
    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const separator = normalized.indexOf('=');
    if (separator <= 0) {
      continue;
    }
    const key = normalized.slice(0, separator).trim();
    if (wanted.has(key)) {
      lines.push({ key, line: rawLine });
      wanted.delete(key);
    }
  }
  return lines;
}

/**
 * Append the example's lines for every missing key to .env. Existing keys and
 * values are never modified; the file is created when absent. This documents
 * new settings on machines that copied .env before the example grew.
 */
export async function syncEnvFromExample(env: EnvInfo | null): Promise<EnvSyncResult> {
  if (env === null || !env.hasExample || env.examplePath === null) {
    return { ok: false, added: [], created: false, error: 'No .env.example was found.' };
  }
  if (env.missingKeys.length === 0) {
    return { ok: true, added: [], created: false, error: null };
  }

  const exampleContent = await fs.readFile(env.examplePath, 'utf8');
  const lines = exampleLinesForKeys(exampleContent, env.missingKeys);
  if (lines.length === 0) {
    return { ok: true, added: [], created: false, error: null };
  }

  const targetPath = env.localPath ?? env.examplePath.replace(/\.example$/, '');
  if (targetPath === env.examplePath) {
    return { ok: false, added: [], created: false, error: 'Could not derive the .env path.' };
  }

  const creating = !env.hasLocal;
  const existing = creating ? '' : await fs.readFile(targetPath, 'utf8');
  const needsNewline = existing.length > 0 && !existing.endsWith('\n');
  const block = `${needsNewline ? '\n' : ''}# Added by devsurface env sync (values may need filling in)\n${lines.map((entry) => entry.line).join('\n')}\n`;
  await fs.writeFile(targetPath, existing + block, { encoding: 'utf8', mode: 0o600 });

  return { ok: true, added: lines.map((entry) => entry.key), created: creating, error: null };
}
