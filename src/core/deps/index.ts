/**
 * Dependency explorer: what is actually installed, in plain terms.
 *
 * For every dependency in package.json this reads the installed package's
 * own metadata from node_modules (locally — no registry calls): the real
 * installed version, its one-line description, license, and homepage. Also
 * rolls the licenses up into a report and flags packages that are declared
 * but not installed.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PackageJsonInfo } from '../types.js';

export interface DependencyEntry {
  name: string;
  /** Version range from package.json, e.g. "^4.18.0". */
  declared: string;
  /** Actual installed version from node_modules, or null when missing. */
  installed: string | null;
  /** true = devDependency, false = runtime dependency. */
  dev: boolean;
  description: string | null;
  license: string | null;
  homepage: string | null;
}

export interface LicenseCount {
  license: string;
  count: number;
  packages: string[];
}

export interface DependencyReport {
  entries: DependencyEntry[];
  /** Declared packages with nothing installed — a fresh install fixes these. */
  missing: string[];
  licenses: LicenseCount[];
  runtimeCount: number;
  devCount: number;
}

async function readInstalledMeta(
  root: string,
  name: string
): Promise<{
  version: string;
  description: string | null;
  license: string | null;
  homepage: string | null;
} | null> {
  try {
    const raw = await fs.readFile(
      path.join(root, 'node_modules', ...name.split('/'), 'package.json'),
      'utf8'
    );
    const data = JSON.parse(raw) as {
      version?: unknown;
      description?: unknown;
      license?: unknown;
      homepage?: unknown;
    };
    const license =
      typeof data.license === 'string'
        ? data.license
        : typeof (data.license as { type?: unknown } | undefined)?.type === 'string'
          ? String((data.license as { type: string }).type)
          : null;
    return {
      version: typeof data.version === 'string' ? data.version : 'unknown',
      description: typeof data.description === 'string' ? data.description.slice(0, 200) : null,
      license,
      homepage:
        typeof data.homepage === 'string' && /^https?:\/\//.test(data.homepage)
          ? data.homepage
          : null
    };
  } catch {
    return null;
  }
}

/** Build the full dependency report for a project. */
export async function exploreDependencies(
  root: string,
  packageJson: PackageJsonInfo | null
): Promise<DependencyReport> {
  const runtime = Object.entries(packageJson?.data.dependencies ?? {});
  const dev = Object.entries(packageJson?.data.devDependencies ?? {});

  const entries: DependencyEntry[] = [];
  for (const [group, isDev] of [
    [runtime, false],
    [dev, true]
  ] as Array<[Array<[string, string]>, boolean]>) {
    for (const [name, declared] of group) {
      const meta = await readInstalledMeta(root, name);
      entries.push({
        name,
        declared,
        installed: meta?.version ?? null,
        dev: isDev,
        description: meta?.description ?? null,
        license: meta?.license ?? null,
        homepage: meta?.homepage ?? null
      });
    }
  }
  entries.sort((left, right) => left.name.localeCompare(right.name));

  const licenseMap = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.installed === null) {
      continue;
    }
    const license = entry.license ?? 'Unknown';
    licenseMap.set(license, [...(licenseMap.get(license) ?? []), entry.name]);
  }
  const licenses: LicenseCount[] = [...licenseMap.entries()]
    .map(([license, packages]) => ({ license, count: packages.length, packages }))
    .sort((left, right) => right.count - left.count);

  return {
    entries,
    missing: entries.filter((entry) => entry.installed === null).map((entry) => entry.name),
    licenses,
    runtimeCount: runtime.length,
    devCount: dev.length
  };
}
