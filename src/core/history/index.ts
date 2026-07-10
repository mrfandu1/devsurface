import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ManagedProcessSnapshot } from '../types.js';
import type { ProcessManager } from '../process/manager.js';

export interface RunHistoryEntry {
  script: string;
  command: string;
  status: 'exited' | 'failed' | 'stopped';
  exitCode: number | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}

/** Newest entries win; older runs beyond this are dropped. */
export const HISTORY_LIMIT = 100;

function defaultDataDir(): string {
  return process.env.DEVSURFACE_DATA_DIR ?? path.join(os.homedir(), '.devsurface');
}

/** Convert a finished process snapshot into a history entry, or null if it has not ended. */
export function historyEntryFromSnapshot(snapshot: ManagedProcessSnapshot): RunHistoryEntry | null {
  if (snapshot.endedAt === null || snapshot.status === 'running') {
    return null;
  }
  const started = new Date(snapshot.startedAt).getTime();
  const ended = new Date(snapshot.endedAt).getTime();
  return {
    script: snapshot.script,
    command: snapshot.command,
    status: snapshot.status,
    exitCode: snapshot.exitCode,
    startedAt: snapshot.startedAt,
    endedAt: snapshot.endedAt,
    durationMs:
      Number.isFinite(started) && Number.isFinite(ended) ? Math.max(ended - started, 0) : 0
  };
}

/**
 * Persisted per-project run history, stored outside the repository
 * (`~/.devsurface/history/<hash>.json`) so it never dirties the working tree.
 */
export class RunHistoryStore {
  private readonly dir: string;

  constructor(dataDir?: string) {
    this.dir = path.join(dataDir ?? defaultDataDir(), 'history');
  }

  private fileFor(root: string): string {
    const hash = createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16);
    return path.join(this.dir, `${hash}.json`);
  }

  async list(root: string, limit = HISTORY_LIMIT): Promise<RunHistoryEntry[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.fileFor(root), 'utf8'));
      return Array.isArray(parsed) ? parsed.slice(0, limit) : [];
    } catch {
      return [];
    }
  }

  /** Delete the stored history for one project. */
  async clear(root: string): Promise<boolean> {
    try {
      await fs.unlink(this.fileFor(root));
      return true;
    } catch {
      return false;
    }
  }

  async record(root: string, entry: RunHistoryEntry): Promise<void> {
    const entries = await this.list(root);
    entries.unshift(entry);
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(
      this.fileFor(root),
      JSON.stringify(entries.slice(0, HISTORY_LIMIT), null, 2) + '\n',
      { encoding: 'utf8', mode: 0o600 }
    );
  }

  /**
   * Record every process the manager finishes, once per process. Failures to
   * write history never disturb the process lifecycle.
   */
  attach(root: string, manager: ProcessManager): void {
    const recorded = new Set<string>();
    manager.on('process', (snapshot: ManagedProcessSnapshot) => {
      const entry = historyEntryFromSnapshot(snapshot);
      if (entry === null || recorded.has(snapshot.pid)) {
        return;
      }
      recorded.add(snapshot.pid);
      void this.record(root, entry).catch(() => undefined);
    });
  }
}
