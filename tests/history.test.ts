import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  HISTORY_LIMIT,
  historyEntryFromSnapshot,
  RunHistoryStore
} from '../src/core/history/index.js';
import { ProcessManager } from '../src/core/process/manager.js';
import type { ManagedProcessSnapshot } from '../src/core/types.js';
import { makeTempProject, removeTempProject } from './testUtils.js';

function snapshot(overrides: Partial<ManagedProcessSnapshot> = {}): ManagedProcessSnapshot {
  return {
    pid: '1234',
    script: 'test',
    command: 'npm run test',
    status: 'exited',
    startedAt: '2026-07-10T10:00:00.000Z',
    endedAt: '2026-07-10T10:00:05.000Z',
    exitCode: 0,
    ...overrides
  };
}

describe('historyEntryFromSnapshot', () => {
  it('converts a finished process into a history entry with duration', () => {
    const entry = historyEntryFromSnapshot(snapshot());
    expect(entry).toEqual({
      script: 'test',
      command: 'npm run test',
      status: 'exited',
      exitCode: 0,
      startedAt: '2026-07-10T10:00:00.000Z',
      endedAt: '2026-07-10T10:00:05.000Z',
      durationMs: 5000
    });
  });

  it('returns null while the process is still running', () => {
    expect(historyEntryFromSnapshot(snapshot({ status: 'running', endedAt: null }))).toBeNull();
  });
});

describe('RunHistoryStore', () => {
  let dataDir: string;
  let projectRoot: string;

  beforeEach(async () => {
    dataDir = await makeTempProject();
    projectRoot = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(dataDir);
    await removeTempProject(projectRoot);
  });

  it('records entries newest-first and lists them per project', async () => {
    const store = new RunHistoryStore(dataDir);
    const first = historyEntryFromSnapshot(snapshot({ script: 'first' }));
    const second = historyEntryFromSnapshot(snapshot({ script: 'second' }));
    await store.record(projectRoot, first!);
    await store.record(projectRoot, second!);

    const entries = await store.list(projectRoot);
    expect(entries.map((entry) => entry.script)).toEqual(['second', 'first']);
    // Another project has an independent history.
    expect(await store.list(dataDir)).toEqual([]);
  });

  it('caps stored history at the limit', async () => {
    const store = new RunHistoryStore(dataDir);
    // Seed a full history file directly, then record once more over it.
    await store.record(projectRoot, historyEntryFromSnapshot(snapshot({ script: 'seed' }))!);
    const historyDir = path.join(dataDir, 'history');
    const [file] = await fs.readdir(historyDir);
    const full = Array.from({ length: HISTORY_LIMIT }, (_, index) =>
      historyEntryFromSnapshot(snapshot({ script: `s${index}` }))
    );
    await fs.writeFile(path.join(historyDir, file), JSON.stringify(full), 'utf8');

    await store.record(projectRoot, historyEntryFromSnapshot(snapshot({ script: 'newest' }))!);

    const entries = await store.list(projectRoot, HISTORY_LIMIT + 10);
    expect(entries).toHaveLength(HISTORY_LIMIT);
    expect(entries[0].script).toBe('newest');
    // The oldest seeded entry fell off the end.
    expect(entries.at(-1)?.script).toBe(`s${HISTORY_LIMIT - 2}`);
  });

  it('records finished manager processes exactly once', async () => {
    const store = new RunHistoryStore(dataDir);
    const recordSpy = vi.spyOn(store, 'record');
    const manager = new ProcessManager();
    store.attach(projectRoot, manager);

    manager.emit('process', snapshot({ status: 'running', endedAt: null }));
    manager.emit('process', snapshot());
    manager.emit('process', snapshot());

    expect(recordSpy).toHaveBeenCalledTimes(1);
    await vi.waitFor(async () => {
      expect(await store.list(projectRoot)).toHaveLength(1);
    });
  });
});
