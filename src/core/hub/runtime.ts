import { EventEmitter } from 'node:events';
import { promises as fs } from 'node:fs';
import { ProcessManager } from '../process/manager.js';
import { DockerComposeController, type DockerController } from '../docker/compose.js';
import { RunHistoryStore } from '../history/index.js';
import { WorkspaceRegistry, type WorkspaceEntry } from './registry.js';

export interface WorkspaceRuntime {
  readonly id: string;
  readonly root: string;
  readonly processManager: ProcessManager;
  readonly dockerController: DockerController;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  runningProcesses: number;
  /** True when the workspace directory no longer exists on disk. */
  missing: boolean;
}

async function directoryExists(dirPath: string): Promise<boolean> {
  try {
    return (await fs.stat(dirPath)).isDirectory();
  } catch {
    return false;
  }
}

export class Hub {
  readonly registry: WorkspaceRegistry;
  readonly history: RunHistoryStore;
  /**
   * Cross-layer notifications: "workspaces-changed" (registry mutated) and
   * "workspace-updated" (a workspace's scan-relevant state changed via an
   * action). The WebSocket layer subscribes and pushes to dashboards.
   */
  readonly events = new EventEmitter();
  private readonly runtimes = new Map<string, WorkspaceRuntime>();
  private cleanupInstalled = false;

  constructor(options?: { dataDir?: string }) {
    this.registry = new WorkspaceRegistry(options?.dataDir);
    this.history = new RunHistoryStore(options?.dataDir);
  }

  get(id: string): WorkspaceRuntime | null {
    return this.runtimes.get(id) ?? null;
  }

  ensure(entry: WorkspaceEntry): WorkspaceRuntime {
    const existing = this.runtimes.get(entry.id);
    if (existing) {
      return existing;
    }

    const runtime: WorkspaceRuntime = {
      id: entry.id,
      root: entry.path,
      processManager: new ProcessManager(),
      dockerController: new DockerComposeController(entry.path)
    };
    this.history.attach(entry.path, runtime.processManager);
    this.runtimes.set(entry.id, runtime);
    return runtime;
  }

  async listSummaries(): Promise<WorkspaceSummary[]> {
    const entries = await this.registry.list();
    return await Promise.all(
      entries.map(async (entry) => {
        const runtime = this.runtimes.get(entry.id);
        const running = runtime
          ? runtime.processManager.list().filter((p) => p.status === 'running').length
          : 0;
        return {
          id: entry.id,
          name: entry.name,
          path: entry.path,
          addedAt: entry.addedAt,
          runningProcesses: running,
          missing: !(await directoryExists(entry.path))
        };
      })
    );
  }

  killAll(): void {
    for (const runtime of this.runtimes.values()) {
      runtime.processManager.killAll();
    }
  }

  attachCleanupHandlers(): void {
    if (this.cleanupInstalled) {
      return;
    }
    this.cleanupInstalled = true;

    process.once('exit', () => {
      this.killAll();
    });
    process.once('SIGINT', () => {
      this.killAll();
      process.exit(130);
    });
    process.once('SIGTERM', () => {
      this.killAll();
      process.exit(143);
    });
  }
}
