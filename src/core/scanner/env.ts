import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { DevSurfaceConfig, EnvInfo } from '../types.js';

interface ParsedEnv {
  keys: string[];
  emptyKeys: string[];
}

async function readIfPresent(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function resolveInsideRoot(root: string, configuredPath: string): string | null {
  const resolvedRoot = path.resolve(root);
  const resolvedPath = path.resolve(resolvedRoot, configuredPath);
  const relative = path.relative(resolvedRoot, resolvedPath);
  const insideRoot = relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  return insideRoot ? resolvedPath : null;
}

async function resolveExistingInsideRoot(
  root: string,
  configuredPath: string
): Promise<string | null> {
  const candidate = resolveInsideRoot(root, configuredPath);
  if (candidate === null) {
    return null;
  }

  try {
    const [realRoot, realCandidate] = await Promise.all([
      fs.realpath(root),
      fs.realpath(candidate)
    ]);
    const relative = path.relative(realRoot, realCandidate);
    const insideRoot =
      relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
    return insideRoot ? candidate : null;
  } catch {
    return null;
  }
}

export function parseEnvKeys(content: string): ParsedEnv {
  const keys: string[] = [];
  const emptyKeys: string[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const separator = normalized.indexOf('=');
    if (separator <= 0) {
      continue;
    }

    const key = normalized.slice(0, separator).trim();
    const value = normalized.slice(separator + 1).trim();
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
      keys.push(key);
      if (value.length === 0 || value === '""' || value === "''") {
        emptyKeys.push(key);
      }
    }
  }

  return { keys: Array.from(new Set(keys)), emptyKeys: Array.from(new Set(emptyKeys)) };
}

/**
 * Harvest human descriptions for env keys from the contiguous comment lines
 * directly above each key in the example file.
 */
export function parseEnvDescriptions(content: string): Record<string, string> {
  const descriptions: Record<string, string> = {};
  let pendingComment: string[] = [];

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.startsWith('#')) {
      pendingComment.push(line.replace(/^#+\s?/, '').trim());
      continue;
    }
    if (line.length === 0) {
      pendingComment = [];
      continue;
    }
    const normalized = line.startsWith('export ') ? line.slice('export '.length).trim() : line;
    const separator = normalized.indexOf('=');
    if (separator > 0) {
      const key = normalized.slice(0, separator).trim();
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) && pendingComment.length > 0) {
        const description = pendingComment.join(' ').trim().slice(0, 200);
        if (description.length > 0) {
          descriptions[key] = description;
        }
      }
    }
    pendingComment = [];
  }

  return descriptions;
}

const ADDITIONAL_ENV_FILES = ['.env.local', '.env.development', '.env.production', '.env.test'];

async function detectAdditionalEnvFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  for (const name of ADDITIONAL_ENV_FILES) {
    try {
      if ((await fs.stat(path.join(root, name))).isFile()) {
        found.push(name);
      }
    } catch {
      // Not present.
    }
  }
  return found;
}

export async function detectEnv(
  root: string,
  config?: DevSurfaceConfig | null
): Promise<EnvInfo | null> {
  const exampleName = config?.env?.example ?? '.env.example';
  const localName = config?.env?.local ?? '.env';
  const [examplePath, localPath] = await Promise.all([
    resolveExistingInsideRoot(root, exampleName),
    resolveExistingInsideRoot(root, localName)
  ]);
  const [exampleContent, localContent] = await Promise.all([
    examplePath === null ? null : readIfPresent(examplePath),
    localPath === null ? null : readIfPresent(localPath)
  ]);

  if (exampleContent === null && localContent === null) {
    return null;
  }

  const example =
    exampleContent === null ? { keys: [], emptyKeys: [] } : parseEnvKeys(exampleContent);
  const local = localContent === null ? { keys: [], emptyKeys: [] } : parseEnvKeys(localContent);
  const localKeySet = new Set(local.keys);
  const localEmptySet = new Set(local.emptyKeys);
  const exampleKeySet = new Set(example.keys);
  const missingKeys = example.keys.filter((key) => !localKeySet.has(key));
  const emptyKeys = local.keys.filter((key) => localEmptySet.has(key));
  const extraKeys =
    exampleContent === null ? [] : local.keys.filter((key) => !exampleKeySet.has(key));

  return {
    examplePath: exampleContent === null ? null : examplePath,
    localPath: localContent === null ? null : localPath,
    hasExample: exampleContent !== null,
    hasLocal: localContent !== null,
    exampleKeys: example.keys,
    localKeys: local.keys,
    missingKeys,
    emptyKeys,
    extraKeys,
    keys: example.keys.map((key) => ({
      key,
      present: localKeySet.has(key),
      empty: localEmptySet.has(key)
    })),
    additionalFiles: await detectAdditionalEnvFiles(root),
    descriptions: exampleContent === null ? {} : parseEnvDescriptions(exampleContent)
  };
}
