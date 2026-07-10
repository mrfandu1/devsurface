import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Hub } from '../src/core/hub/runtime.js';
import { WorkspaceRegistry } from '../src/core/hub/registry.js';
import { makeTempProject, removeTempProject } from './testUtils.js';

describe('workspace pruning', () => {
  let dataDir: string;
  let existingDir: string;
  let vanishingDir: string;

  beforeEach(async () => {
    dataDir = await makeTempProject();
    existingDir = await makeTempProject();
    vanishingDir = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(dataDir);
    await removeTempProject(existingDir);
    await removeTempProject(vanishingDir);
  });

  it('removes only the workspaces whose directories are gone', async () => {
    const registry = new WorkspaceRegistry(dataDir);
    await registry.add(existingDir);
    const doomed = await registry.add(vanishingDir);
    await removeTempProject(vanishingDir);

    const removed = await registry.prune();
    expect(removed.map((entry) => entry.id)).toEqual([doomed.id]);

    const remaining = await registry.list();
    expect(remaining).toHaveLength(1);

    // A second prune is a no-op.
    expect(await registry.prune()).toEqual([]);
  });

  it('marks missing workspaces in hub summaries', async () => {
    const hub = new Hub({ dataDir });
    await hub.registry.add(existingDir);
    await hub.registry.add(vanishingDir);
    await removeTempProject(vanishingDir);

    const summaries = await hub.listSummaries();
    const byPath = new Map(summaries.map((summary) => [summary.path, summary.missing]));
    expect(byPath.get(await realPath(existingDir))).toBe(false);
    expect([...byPath.values()].filter((missing) => missing)).toHaveLength(1);
  });
});

async function realPath(dir: string): Promise<string> {
  const { promises: fs } = await import('node:fs');
  return await fs.realpath(dir);
}
