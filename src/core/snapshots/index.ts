/**
 * Project snapshots: freeze what the scan sees today, then answer "what
 * changed since?" in plain English later.
 *
 * Snapshots are compact digests (script names, env keys — never values —
 * dependency versions, ports, readiness) stored outside the repository at
 * `~/.devsurface/snapshots/<hash>.json`.
 */

import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ScanResult } from '../types.js';

export interface ProjectSnapshot {
  takenAt: string;
  label: string;
  scripts: Record<string, string>;
  envKeys: string[];
  dependencies: Record<string, string>;
  ports: number[];
  warningIds: string[];
  readiness: number | null;
}

export interface SnapshotDiff {
  from: string;
  to: string;
  /** Human sentences describing each change, ready to print. */
  changes: string[];
}

export const SNAPSHOT_LIMIT = 20;

function defaultDataDir(): string {
  return process.env.DEVSURFACE_DATA_DIR ?? path.join(os.homedir(), '.devsurface');
}

/** Build the compact digest a snapshot stores. Env values are never included. */
export function digestScan(
  scan: ScanResult,
  extras: { warningIds?: string[]; readiness?: number | null; label?: string } = {}
): ProjectSnapshot {
  return {
    takenAt: new Date().toISOString(),
    label: (extras.label ?? '').slice(0, 80),
    scripts: { ...scan.scripts },
    envKeys: [...(scan.env?.localKeys ?? [])].sort(),
    dependencies: {
      ...scan.packageJson?.data.dependencies,
      ...scan.packageJson?.data.devDependencies
    },
    ports: scan.ports.map((probe) => probe.port),
    warningIds: [...(extras.warningIds ?? [])].sort(),
    readiness: extras.readiness ?? null
  };
}

function diffKeys(
  before: Record<string, string>,
  after: Record<string, string>,
  noun: string,
  changes: string[]
): void {
  for (const key of Object.keys(after)) {
    if (before[key] === undefined) {
      changes.push(`New ${noun}: "${key}".`);
    } else if (before[key] !== after[key]) {
      changes.push(
        `${noun[0].toUpperCase()}${noun.slice(1)} "${key}" changed (${before[key]} → ${after[key]}).`
      );
    }
  }
  for (const key of Object.keys(before)) {
    if (after[key] === undefined) {
      changes.push(`Removed ${noun}: "${key}".`);
    }
  }
}

function diffList(
  before: string[],
  after: string[],
  added: string,
  removed: string,
  changes: string[]
): void {
  const beforeSet = new Set(before);
  const afterSet = new Set(after);
  const gained = after.filter((item) => !beforeSet.has(item));
  const lost = before.filter((item) => !afterSet.has(item));
  if (gained.length > 0) {
    changes.push(`${added}: ${gained.join(', ')}.`);
  }
  if (lost.length > 0) {
    changes.push(`${removed}: ${lost.join(', ')}.`);
  }
}

/** Compare two snapshots and narrate the differences. */
export function diffSnapshots(before: ProjectSnapshot, after: ProjectSnapshot): SnapshotDiff {
  const changes: string[] = [];
  diffKeys(before.scripts, after.scripts, 'script', changes);
  diffKeys(before.dependencies, after.dependencies, 'dependency', changes);
  diffList(
    before.envKeys,
    after.envKeys,
    'New settings keys in .env',
    'Settings keys removed from .env',
    changes
  );
  diffList(
    before.ports.map(String),
    after.ports.map(String),
    'New project ports',
    'Ports no longer detected',
    changes
  );
  diffList(
    before.warningIds,
    after.warningIds,
    'New health warnings',
    'Health warnings resolved',
    changes
  );
  if (
    typeof before.readiness === 'number' &&
    typeof after.readiness === 'number' &&
    before.readiness !== after.readiness
  ) {
    changes.push(
      `Setup readiness went from ${before.readiness}% to ${after.readiness}% (${after.readiness > before.readiness ? 'better' : 'worse'}).`
    );
  }
  if (changes.length === 0) {
    changes.push('Nothing changed — the project looks exactly like the snapshot.');
  }
  return { from: before.takenAt, to: after.takenAt, changes };
}

export class SnapshotStore {
  private readonly dir: string;

  constructor(dataDir?: string) {
    this.dir = path.join(dataDir ?? defaultDataDir(), 'snapshots');
  }

  private fileFor(root: string): string {
    const hash = createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16);
    return path.join(this.dir, `${hash}.json`);
  }

  async list(root: string): Promise<ProjectSnapshot[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.fileFor(root), 'utf8'));
      return Array.isArray(parsed) ? (parsed as ProjectSnapshot[]) : [];
    } catch {
      return [];
    }
  }

  /** Newest snapshot, or null. */
  async latest(root: string): Promise<ProjectSnapshot | null> {
    const snapshots = await this.list(root);
    return snapshots[0] ?? null;
  }

  async save(root: string, snapshot: ProjectSnapshot): Promise<void> {
    const snapshots = await this.list(root);
    snapshots.unshift(snapshot);
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(
      this.fileFor(root),
      JSON.stringify(snapshots.slice(0, SNAPSHOT_LIMIT), null, 2) + '\n',
      { encoding: 'utf8', mode: 0o600 }
    );
  }

  async clear(root: string): Promise<boolean> {
    try {
      await fs.unlink(this.fileFor(root));
      return true;
    } catch {
      return false;
    }
  }
}
