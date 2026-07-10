import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { MonorepoInfo, PackageJsonInfo, WorkspacePackageInfo } from '../types.js';

/** Cap directory listings so a glob like "*" cannot make scans crawl. */
const MAX_PACKAGES = 60;

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function workspaceGlobsFromPackageJson(packageJson: PackageJsonInfo | null): string[] {
  const workspaces = packageJson?.data.workspaces;
  if (Array.isArray(workspaces)) {
    return workspaces.filter((entry): entry is string => typeof entry === 'string');
  }
  if (workspaces !== undefined && workspaces !== null && Array.isArray(workspaces.packages)) {
    return workspaces.packages.filter((entry): entry is string => typeof entry === 'string');
  }
  return [];
}

async function workspaceGlobsFromPnpm(root: string): Promise<string[]> {
  try {
    const content = await fs.readFile(path.join(root, 'pnpm-workspace.yaml'), 'utf8');
    const parsed = parseYaml(content) as { packages?: unknown } | null;
    if (parsed !== null && Array.isArray(parsed.packages)) {
      return parsed.packages.filter((entry): entry is string => typeof entry === 'string');
    }
  } catch {
    // No pnpm workspace file, or it does not parse — treat as absent.
  }
  return [];
}

/**
 * Resolve simple workspace globs ("packages/*", "apps/web", "tools/**") to
 * directories that contain a package.json. Negations and mid-path wildcards
 * are skipped: this powers a dashboard summary, not an installer.
 */
export async function resolveWorkspacePackages(
  root: string,
  globs: string[]
): Promise<WorkspacePackageInfo[]> {
  const dirs = new Set<string>();

  for (const glob of globs) {
    if (
      glob.startsWith('!') ||
      glob.includes('*') !== glob.endsWith('*') ||
      dirs.size >= MAX_PACKAGES
    ) {
      continue;
    }

    if (!glob.includes('*')) {
      dirs.add(glob.replace(/\/+$/, ''));
      continue;
    }

    // "dir/*" or "dir/**": list the immediate children of dir.
    const base = glob.replace(/\/?\*+$/, '');
    if (base.includes('*') || base.length === 0) {
      continue;
    }
    try {
      const entries = await fs.readdir(path.join(root, base), { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && dirs.size < MAX_PACKAGES) {
          dirs.add(`${base}/${entry.name}`);
        }
      }
    } catch {
      // Base directory missing — the glob simply matches nothing.
    }
  }

  const packages: WorkspacePackageInfo[] = [];
  for (const dir of dirs) {
    const packageJsonPath = path.join(root, dir, 'package.json');
    try {
      const raw = JSON.parse(await fs.readFile(packageJsonPath, 'utf8')) as {
        name?: unknown;
        scripts?: unknown;
      };
      const scripts = raw.scripts;
      packages.push({
        name: typeof raw.name === 'string' && raw.name.length > 0 ? raw.name : path.basename(dir),
        dir: dir.replace(/\\/g, '/'),
        scriptCount:
          typeof scripts === 'object' && scripts !== null && !Array.isArray(scripts)
            ? Object.keys(scripts).length
            : 0
      });
    } catch {
      // Not a package directory — skip silently.
    }
  }

  return packages.sort((left, right) => left.dir.localeCompare(right.dir));
}

/**
 * Detect monorepo/workspace tooling: npm/yarn/bun workspaces (package.json),
 * pnpm workspaces, Turborepo, Nx, and Lerna. Returns null for single-package
 * repositories so the dashboard can hide the section entirely.
 */
export async function detectMonorepo(
  root: string,
  packageJson: PackageJsonInfo | null
): Promise<MonorepoInfo | null> {
  const tools: string[] = [];
  const packageJsonGlobs = workspaceGlobsFromPackageJson(packageJson);
  const pnpmGlobs = await workspaceGlobsFromPnpm(root);

  if (packageJsonGlobs.length > 0) {
    tools.push('workspaces');
  }
  if (pnpmGlobs.length > 0) {
    tools.push('pnpm workspaces');
  }
  if (await pathExists(path.join(root, 'turbo.json'))) {
    tools.push('Turborepo');
  }
  if (await pathExists(path.join(root, 'nx.json'))) {
    tools.push('Nx');
  }
  if (await pathExists(path.join(root, 'lerna.json'))) {
    tools.push('Lerna');
  }

  if (tools.length === 0) {
    return null;
  }

  const packageGlobs = [...new Set([...packageJsonGlobs, ...pnpmGlobs])];
  const packages = await resolveWorkspacePackages(root, packageGlobs);

  return {
    tools,
    packageGlobs,
    packages,
    packageCount: packages.length
  };
}
