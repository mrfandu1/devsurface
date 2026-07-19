/**
 * Dependency health, computed entirely offline.
 *
 * Four checks people usually need a registry or a CI bot for, answered from
 * node_modules and the source tree alone: which packages weigh the most on
 * disk, which are installed at several versions at once, which declared
 * dependencies nothing imports, and which imports were never declared
 * (phantom dependencies that only work by accident).
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { walkFiles } from '../walk/index.js';
import type { PackageJsonInfo } from '../types.js';

export interface HeavyPackage {
  name: string;
  /** Size of the package folder in bytes (bounded walk). */
  bytes: number;
}

export interface DuplicatePackage {
  name: string;
  /** Distinct installed versions, e.g. ["4.17.21", "3.10.1"]. */
  versions: string[];
}

export interface DepsHealthReport {
  /** Largest node_modules packages by disk size. */
  heaviest: HeavyPackage[];
  /** Packages installed at more than one version. */
  duplicates: DuplicatePackage[];
  /** Declared in package.json but never imported anywhere (heuristic). */
  unused: string[];
  /** Imported in source but not declared in package.json. */
  phantom: string[];
  /** Total size of node_modules in bytes, or null when it does not exist. */
  nodeModulesBytes: number | null;
  installedPackageCount: number;
  scannedSourceFiles: number;
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
  '.astro'
]);

const IMPORT_PATTERNS: RegExp[] = [
  /\bfrom\s+["']([^"'\s]+)["']/g,
  /\brequire\(\s*["']([^"'\s]+)["']\s*\)/g,
  /\bimport\(\s*["']([^"'\s]+)["']\s*\)/g,
  /^\s*import\s+["']([^"'\s]+)["']/gm
];

/** Node built-ins and self-references are never phantom dependencies. */
const IGNORED_SPECIFIER = /^(node:|\.|\/|~|@\/|#)/;

const MAX_PACKAGE_FILES = 2_000;
const MAX_FILE_BYTES = 512 * 1024;

/** Reduce an import specifier to its package name ("@scope/pkg/sub" → "@scope/pkg"). */
export function packageNameOf(specifier: string): string | null {
  if (IGNORED_SPECIFIER.test(specifier)) {
    return null;
  }
  const parts = specifier.split('/');
  if (specifier.startsWith('@')) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : null;
  }
  return parts[0] ?? null;
}

async function directorySize(dir: string): Promise<number> {
  let total = 0;
  let count = 0;
  const queue = [dir];
  while (queue.length > 0 && count < MAX_PACKAGE_FILES) {
    const current = queue.shift() as string;
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const absPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(absPath);
      } else if (entry.isFile()) {
        count += 1;
        try {
          total += (await fs.stat(absPath)).size;
        } catch {
          // Unreadable file — skip.
        }
        if (count >= MAX_PACKAGE_FILES) {
          break;
        }
      }
    }
  }
  return total;
}

async function listInstalledPackages(nodeModules: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(nodeModules, { withFileTypes: true });
  } catch {
    return [];
  }
  const names: string[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) {
      continue;
    }
    if (entry.name.startsWith('@')) {
      try {
        const scoped = await fs.readdir(path.join(nodeModules, entry.name), {
          withFileTypes: true
        });
        for (const inner of scoped) {
          if (inner.isDirectory()) {
            names.push(`${entry.name}/${inner.name}`);
          }
        }
      } catch {
        // Unreadable scope dir — skip.
      }
    } else {
      names.push(entry.name);
    }
  }
  return names;
}

async function readInstalledVersion(nodeModules: string, name: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(path.join(nodeModules, name, 'package.json'), 'utf8');
    const parsed = JSON.parse(raw) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

/** Find nested duplicate installs: pkgA/node_modules/pkgB at another version. */
async function findDuplicates(
  nodeModules: string,
  topLevel: string[]
): Promise<DuplicatePackage[]> {
  const versions = new Map<string, Set<string>>();
  const record = (name: string, version: string | null): void => {
    if (version === null) {
      return;
    }
    const set = versions.get(name) ?? new Set<string>();
    set.add(version);
    versions.set(name, set);
  };

  for (const name of topLevel) {
    record(name, await readInstalledVersion(nodeModules, name));
  }
  // One level of nesting catches the vast majority of real duplicates.
  for (const name of topLevel.slice(0, 300)) {
    const nested = path.join(nodeModules, name, 'node_modules');
    const nestedNames = await listInstalledPackages(nested);
    for (const nestedName of nestedNames) {
      record(nestedName, await readInstalledVersion(nested, nestedName));
    }
  }

  return [...versions.entries()]
    .filter(([, set]) => set.size > 1)
    .map(([name, set]) => ({ name, versions: [...set].sort() }))
    .sort((left, right) => right.versions.length - left.versions.length)
    .slice(0, 30);
}

/** Collect every package name imported anywhere in the source tree. */
export async function collectImportedPackages(
  root: string
): Promise<{ imported: Set<string>; scanned: number }> {
  const files = await walkFiles(root);
  const sourceFiles = files.filter(
    (file) =>
      SOURCE_EXTENSIONS.has(path.extname(file.relPath).toLowerCase()) && file.size <= MAX_FILE_BYTES
  );
  const imported = new Set<string>();
  for (const file of sourceFiles) {
    let content: string;
    try {
      content = await fs.readFile(file.absPath, 'utf8');
    } catch {
      continue;
    }
    for (const pattern of IMPORT_PATTERNS) {
      pattern.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = pattern.exec(content)) !== null) {
        const name = packageNameOf(match[1]);
        if (name !== null) {
          imported.add(name);
        }
      }
    }
  }
  return { imported, scanned: sourceFiles.length };
}

/** Packages whose absence from imports is expected (CLIs, plugins, types). */
function isToolingPackage(name: string): boolean {
  return (
    name.startsWith('@types/') ||
    /^(eslint|prettier|typescript|vite|vitest|jest|tsup|tsx|ts-node|nodemon|husky|lint-staged|rimraf|cross-env|concurrently|npm-run-all|turbo|lerna|nx|webpack|rollup|babel|postcss|tailwindcss|autoprefixer|playwright|cypress|storybook|commitlint|semantic-release|changesets)/.test(
      name.replace(/^@[^/]+\//, '')
    )
  );
}

/** Build the full offline dependency health report. */
export async function checkDepsHealth(
  root: string,
  packageJson: PackageJsonInfo | null
): Promise<DepsHealthReport> {
  const nodeModules = path.join(root, 'node_modules');
  const topLevel = await listInstalledPackages(nodeModules);

  const declared = {
    ...(packageJson?.data.dependencies ?? {}),
    ...(packageJson?.data.devDependencies ?? {})
  };
  const declaredNames = Object.keys(declared);

  const { imported, scanned } = await collectImportedPackages(root);

  const unused = declaredNames
    .filter((name) => !imported.has(name) && !isToolingPackage(name))
    .sort();

  const runtimeDeclared = new Set(declaredNames);
  const phantom = [...imported]
    .filter((name) => !runtimeDeclared.has(name) && topLevel.includes(name))
    .sort()
    .slice(0, 30);

  // Size the declared packages (bounded) — the ones the user chose.
  const sized: HeavyPackage[] = [];
  let nodeModulesBytes: number | null = topLevel.length > 0 ? 0 : null;
  for (const name of topLevel.slice(0, 400)) {
    const bytes = await directorySize(path.join(nodeModules, name));
    if (nodeModulesBytes !== null) {
      nodeModulesBytes += bytes;
    }
    sized.push({ name, bytes });
  }
  const heaviest = sized.sort((left, right) => right.bytes - left.bytes).slice(0, 15);

  const duplicates = await findDuplicates(nodeModules, topLevel);

  return {
    heaviest,
    duplicates,
    unused,
    phantom,
    nodeModulesBytes,
    installedPackageCount: topLevel.length,
    scannedSourceFiles: scanned
  };
}
