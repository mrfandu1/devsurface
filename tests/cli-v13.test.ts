import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { badgeCommand } from '../src/cli/commands/badge.js';
import { historyCommand } from '../src/cli/commands/history.js';
import { scanCommand } from '../src/cli/commands/scan.js';
import { RunHistoryStore, historyEntryFromSnapshot } from '../src/core/history/index.js';
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

describe('v0.13 CLI flags', () => {
  let root: string;
  let logs: string[];

  beforeEach(async () => {
    root = await makeTempProject();
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((message: unknown) => {
      logs.push(String(message));
    });
    process.exitCode = undefined;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    await removeTempProject(root);
  });

  it('badge --score prints only the readiness number', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await badgeCommand(root, undefined, { score: true });
    expect(logs).toHaveLength(1);
    expect(Number(logs[0])).toBeGreaterThanOrEqual(0);
    expect(Number(logs[0])).toBeLessThanOrEqual(100);
    // No SVG file was written.
    await expect(fs.access(path.join(root, 'devsurface-readiness.svg'))).rejects.toThrow();
  });

  it('scan --summary prints a single line', async () => {
    await writeJson(path.join(root, 'package.json'), {
      name: 'summary-project',
      scripts: { dev: 'vite' }
    });
    await scanCommand(root, { summary: true });
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('summary-project');
    expect(logs[0]).toContain('% ready');
    expect(logs[0]).not.toContain('\n');
  });

  it('history --clear removes stored history', async () => {
    const dataDir = await makeTempProject();
    const previous = process.env.DEVSURFACE_DATA_DIR;
    process.env.DEVSURFACE_DATA_DIR = dataDir;
    try {
      const realRoot = await fs.realpath(root);
      const store = new RunHistoryStore(dataDir);
      await store.record(
        realRoot,
        historyEntryFromSnapshot({
          pid: '1',
          script: 'dev',
          command: 'npm run dev',
          status: 'exited',
          startedAt: '2026-07-10T10:00:00.000Z',
          endedAt: '2026-07-10T10:00:01.000Z',
          exitCode: 0
        })!
      );
      expect(await store.list(realRoot)).toHaveLength(1);

      await historyCommand(root, 20, { clear: true });
      expect(await store.list(realRoot)).toHaveLength(0);
      expect(logs.join('\n')).toContain('cleared');
    } finally {
      if (previous === undefined) {
        delete process.env.DEVSURFACE_DATA_DIR;
      } else {
        process.env.DEVSURFACE_DATA_DIR = previous;
      }
      await removeTempProject(dataDir);
    }
  });
});
