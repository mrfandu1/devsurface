import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCleanupReport, deleteCleanupTarget } from '../src/core/cleanup/index.js';
import { digestScan, diffSnapshots, SnapshotStore } from '../src/core/snapshots/index.js';
import type { ScanResult } from '../src/core/types.js';
import { makeTempProject, mkdirp, removeTempProject } from './testUtils.js';

describe('cleanup advisor', () => {
  it('reports regenerable folders with sizes and deletes only allowlisted ones', async () => {
    const root = await makeTempProject();
    await mkdirp(path.join(root, 'dist'));
    await fs.writeFile(path.join(root, 'dist', 'bundle.js'), 'x'.repeat(2048));
    await mkdirp(path.join(root, 'src'));
    await fs.writeFile(path.join(root, 'src', 'precious.ts'), 'const keep = true;');

    const report = await buildCleanupReport(root);
    const dist = report.targets.find((target) => target.name === 'dist');
    expect(dist?.bytes).toBeGreaterThanOrEqual(2048);
    expect(report.targets.some((target) => target.name === 'src')).toBe(false);

    // Never deletes anything off-list — including source folders.
    const refusedSrc = await deleteCleanupTarget(root, 'src');
    expect(refusedSrc.deleted).toBe(false);
    const refusedEscape = await deleteCleanupTarget(root, '../outside');
    expect(refusedEscape.deleted).toBe(false);

    const deleted = await deleteCleanupTarget(root, 'dist');
    expect(deleted.deleted).toBe(true);
    await expect(fs.access(path.join(root, 'dist'))).rejects.toThrow();
    await expect(fs.access(path.join(root, 'src', 'precious.ts'))).resolves.toBeUndefined();
    await removeTempProject(root);
  });
});

function fakeScan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    root: '/tmp/x',
    projectName: 'x',
    packageJson: {
      path: '/tmp/x/package.json',
      data: { dependencies: { express: '^4.0.0' }, devDependencies: {} }
    },
    packageManager: 'npm',
    language: { primary: 'node', detected: ['node'], files: [] },
    scripts: { dev: 'vite' },
    env: null,
    docker: null,
    git: null,
    framework: null,
    presets: [],
    presetCommands: {},
    presetGroups: {},
    ports: [{ port: 3000, inUse: false }],
    readme: { path: null, exists: false },
    license: { path: null, exists: false },
    monorepo: null,
    dependencies: null,
    toolchain: {
      testRunner: null,
      linter: null,
      formatter: null,
      bundler: null,
      orm: null,
      styling: null,
      ci: null
    },
    nodeRequirement: null,
    readmeCommands: [],
    config: null,
    ...overrides
  };
}

describe('snapshots', () => {
  it('narrates script, dependency, port, and readiness changes', () => {
    const before = digestScan(fakeScan(), { readiness: 50, warningIds: ['missing-env'] });
    const after = digestScan(
      fakeScan({
        scripts: { dev: 'vite', test: 'vitest run' },
        packageJson: {
          path: '/tmp/x/package.json',
          data: { dependencies: { express: '^5.0.0' }, devDependencies: {} }
        },
        ports: [
          { port: 3000, inUse: false },
          { port: 5432, inUse: false }
        ]
      }),
      { readiness: 80, warningIds: [] }
    );
    const diff = diffSnapshots(before, after);
    const text = diff.changes.join(' ');
    expect(text).toContain('New script: "test"');
    expect(text).toContain('"express" changed');
    expect(text).toContain('5432');
    expect(text).toContain('Health warnings resolved: missing-env');
    expect(text).toContain('50% to 80%');
  });

  it('says so when nothing changed, and persists snapshots per project', async () => {
    const dataDir = await makeTempProject();
    const store = new SnapshotStore(dataDir);
    const snapshot = digestScan(fakeScan(), { readiness: 50 });
    expect(diffSnapshots(snapshot, snapshot).changes[0]).toContain('Nothing changed');

    await store.save('/tmp/project-a', snapshot);
    expect(await store.list('/tmp/project-a')).toHaveLength(1);
    expect(await store.latest('/tmp/project-b')).toBeNull();
    await removeTempProject(dataDir);
  });
});
