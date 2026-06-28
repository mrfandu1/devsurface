import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { assertWithinWorkspaceRoots } from './workspaceRoots.js';

export interface WorkspaceEntry {
  id: string;
  name: string;
  path: string;
  addedAt: string;
}

function workspaceId(realPath: string): string {
  const base =
    path
      .basename(realPath)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 32) || 'workspace';
  const hash = createHash('sha256').update(realPath).digest('hex').slice(0, 6);
  return `${base}-${hash}`;
}

function defaultDataDir(): string {
  return process.env.DEVSURFACE_DATA_DIR ?? path.join(os.homedir(), '.devsurface');
}

async function readPackageName(dirPath: string): Promise<string | null> {
  try {
    const raw = JSON.parse(await fs.readFile(path.join(dirPath, 'package.json'), 'utf8'));
    return typeof raw?.name === 'string' && raw.name.length > 0 ? raw.name : null;
  } catch {
    return null;
  }
}

export class WorkspaceRegistry {
  private readonly filePath: string;
  private seeded = false;

  constructor(dataDir?: string) {
    const dir = dataDir ?? defaultDataDir();
    this.filePath = path.join(dir, 'workspaces.json');
  }

  async list(): Promise<WorkspaceEntry[]> {
    await this.seedFromEnv();
    return await this.read();
  }

  async add(dirPath: string): Promise<WorkspaceEntry> {
    const realDir = await this.resolveDir(dirPath);
    await assertWithinWorkspaceRoots(realDir);
    const entries = await this.read();

    const existing = entries.find((entry) => entry.path === realDir);
    if (existing) {
      return existing;
    }

    const name = (await readPackageName(realDir)) ?? path.basename(realDir);
    const entry: WorkspaceEntry = {
      id: workspaceId(realDir),
      name,
      path: realDir,
      addedAt: new Date().toISOString()
    };
    entries.push(entry);
    await this.write(entries);
    return entry;
  }

  async remove(id: string): Promise<boolean> {
    const entries = await this.read();
    const filtered = entries.filter((entry) => entry.id !== id);
    if (filtered.length === entries.length) {
      return false;
    }
    await this.write(filtered);
    return true;
  }

  async findByPath(dirPath: string): Promise<WorkspaceEntry | null> {
    try {
      const realDir = await fs.realpath(path.resolve(dirPath));
      const entries = await this.read();
      return entries.find((entry) => entry.path === realDir) ?? null;
    } catch {
      return null;
    }
  }

  async resolve(id: string): Promise<WorkspaceEntry | null> {
    const entries = await this.read();
    const entry = entries.find((item) => item.id === id);
    if (!entry) {
      return null;
    }

    try {
      const realDir = await this.resolveDir(entry.path);
      await assertWithinWorkspaceRoots(realDir);
      if (realDir !== entry.path) {
        const updated: WorkspaceEntry = { ...entry, path: realDir };
        await this.write(entries.map((item) => (item.id === id ? updated : item)));
        return updated;
      }
      return entry;
    } catch {
      await this.remove(id);
      return null;
    }
  }

  private async resolveDir(dirPath: string): Promise<string> {
    const resolved = path.resolve(dirPath);
    const realDir = await fs.realpath(resolved);
    const stat = await fs.stat(realDir);
    if (!stat.isDirectory()) {
      throw new Error(`${dirPath} is not a directory.`);
    }
    return realDir;
  }

  private async read(): Promise<WorkspaceEntry[]> {
    try {
      const content = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  private async write(entries: WorkspaceEntry[]): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(entries, null, 2) + '\n', {
      encoding: 'utf8',
      mode: 0o600
    });
  }

  private async seedFromEnv(): Promise<void> {
    if (this.seeded) {
      return;
    }
    this.seeded = true;

    const seedValue = process.env.DEVSURFACE_WORKSPACES;
    if (!seedValue) {
      return;
    }

    const paths = seedValue
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    for (const p of paths) {
      try {
        await this.add(p);
      } catch {
        // Skip invalid seed paths.
      }
    }
  }
}
