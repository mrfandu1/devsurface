/**
 * Write-only .env editing: set the value of a single key from the dashboard
 * without ever reading values back out. The API response and UI only ever see
 * key names and presence — values go in, never come out.
 */

import { constants, promises as fs } from 'node:fs';
import path from 'node:path';

/** Standard dotenv-style key: letters, digits, underscores, not digit-first. */
export function isValidEnvKey(key: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && key.length <= 128;
}

/**
 * A value must stay on one line and contain no control characters, so it can
 * never break the file structure or smuggle in extra keys.
 */
export function isValidEnvValue(value: string): boolean {
  if (value.length > 4096) {
    return false;
  }
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) {
      return false;
    }
  }
  return true;
}

/** Quote the value only when it needs it (spaces, #, or quotes). */
function formatEnvLine(key: string, value: string): string {
  if (value === '' || /[\s#'"\\]/.test(value)) {
    const escaped = value.replaceAll('\\', '\\\\').replaceAll('"', '\\"');
    return `${key}="${escaped}"`;
  }
  return `${key}=${value}`;
}

/**
 * Pure content transform: replace the key's line if it exists (first match,
 * comments untouched), otherwise append it. Exported for tests.
 */
export function applyEnvValue(
  content: string,
  key: string,
  value: string
): { content: string; action: 'updated' | 'added' } {
  const lines = content.split(/\r?\n/);
  const prefix = new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`);
  const index = lines.findIndex((line) => prefix.test(line));
  if (index >= 0) {
    lines[index] = formatEnvLine(key, value);
    return { content: lines.join('\n'), action: 'updated' };
  }

  const body = content.length === 0 || content.endsWith('\n') ? content : `${content}\n`;
  return { content: `${body}${formatEnvLine(key, value)}\n`, action: 'added' };
}

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export type SetEnvResult = { ok: true; action: 'updated' | 'added' } | { ok: false; error: string };

/**
 * Set one key in the project's local .env file, creating the file when it does
 * not exist yet. The file is created with owner-only permissions.
 */
export async function setEnvValue(options: {
  root: string;
  /** Path of the local env file from the scanner, or null to use root/.env. */
  localPath: string | null;
  key: string;
  value: string;
}): Promise<SetEnvResult> {
  const { root, key, value } = options;
  if (!isValidEnvKey(key)) {
    return { ok: false, error: 'Invalid key name.' };
  }
  if (!isValidEnvValue(value)) {
    return { ok: false, error: 'Value must be a single line under 4096 characters.' };
  }

  const target = options.localPath ?? path.join(root, '.env');
  if (!isWithinRoot(root, target)) {
    return { ok: false, error: 'The env file must live inside the project.' };
  }
  try {
    const realParent = await fs.realpath(path.dirname(target));
    const realRoot = await fs.realpath(root);
    if (!isWithinRoot(realRoot, realParent)) {
      return { ok: false, error: 'The env file must live inside the project.' };
    }

    let current = '';
    try {
      current = await fs.readFile(target, 'utf8');
    } catch {
      // Missing file is fine — it will be created below.
    }
    const next = applyEnvValue(current, key, value);
    const handle = await fs.open(
      target,
      constants.O_CREAT | constants.O_WRONLY | constants.O_TRUNC,
      0o600
    );
    try {
      await handle.writeFile(next.content, 'utf8');
    } finally {
      await handle.close();
    }
    return { ok: true, action: next.action };
  } catch {
    return { ok: false, error: 'Could not write the env file.' };
  }
}
