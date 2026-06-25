import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkspaceRegistry } from '../src/core/hub/registry.js';
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => removeTempProject(dir)));
});

async function tempDir(): Promise<string> {
  const dir = await makeTempProject();
  tempDirs.push(dir);
  return dir;
}

describe('WorkspaceRegistry', () => {
  it('adds and lists workspaces', async () => {
    const dataDir = await tempDir();
    const projectDir = await tempDir();
    await writeJson(path.join(projectDir, 'package.json'), { name: 'test-app' });

    const registry = new WorkspaceRegistry(dataDir);
    const entry = await registry.add(projectDir);

    expect(entry.name).toBe('test-app');
    expect(entry.id).toMatch(/^[a-zA-Z0-9_-]+-[a-f0-9]{6}$/);

    const list = await registry.list();
    expect(list).toHaveLength(1);
    expect(list[0].path).toBe(await fs.realpath(projectDir));
  });

  it('returns existing entry when adding a duplicate path', async () => {
    const dataDir = await tempDir();
    const projectDir = await tempDir();

    const registry = new WorkspaceRegistry(dataDir);
    const first = await registry.add(projectDir);
    const second = await registry.add(projectDir);

    expect(first.id).toBe(second.id);
    expect((await registry.list()).length).toBe(1);
  });

  it('removes workspaces by id', async () => {
    const dataDir = await tempDir();
    const projectDir = await tempDir();

    const registry = new WorkspaceRegistry(dataDir);
    const entry = await registry.add(projectDir);

    expect(await registry.remove(entry.id)).toBe(true);
    expect(await registry.list()).toHaveLength(0);
    expect(await registry.remove(entry.id)).toBe(false);
  });

  it('rejects non-directory paths', async () => {
    const dataDir = await tempDir();
    const projectDir = await tempDir();
    const filePath = path.join(projectDir, 'not-a-dir.txt');
    await fs.writeFile(filePath, 'hello', 'utf8');

    const registry = new WorkspaceRegistry(dataDir);
    await expect(registry.add(filePath)).rejects.toThrow('not a directory');
  });

  it('rejects non-existent paths', async () => {
    const dataDir = await tempDir();
    const registry = new WorkspaceRegistry(dataDir);
    await expect(registry.add('/nonexistent/fake/path')).rejects.toThrow();
  });

  it('resolves workspaces by id', async () => {
    const dataDir = await tempDir();
    const projectDir = await tempDir();

    const registry = new WorkspaceRegistry(dataDir);
    const entry = await registry.add(projectDir);

    expect(await registry.resolve(entry.id)).toEqual(entry);
    expect(await registry.resolve('nonexistent')).toBeNull();
  });

  it('finds workspaces by path', async () => {
    const dataDir = await tempDir();
    const projectDir = await tempDir();

    const registry = new WorkspaceRegistry(dataDir);
    await registry.add(projectDir);

    const found = await registry.findByPath(projectDir);
    expect(found).not.toBeNull();
    expect(found?.path).toBe(await fs.realpath(projectDir));

    expect(await registry.findByPath('/nonexistent')).toBeNull();
  });

  it('falls back to directory basename when package.json is missing', async () => {
    const dataDir = await tempDir();
    const projectDir = await tempDir();

    const registry = new WorkspaceRegistry(dataDir);
    const entry = await registry.add(projectDir);

    expect(entry.name).toBe(path.basename(await fs.realpath(projectDir)));
  });

  it('rejects paths outside configured workspace roots', async () => {
    const dataDir = await tempDir();
    const rootDir = await tempDir();
    const projectDir = await tempDir();
    const previous = process.env.DEVSURFACE_WORKSPACE_ROOTS;
    process.env.DEVSURFACE_WORKSPACE_ROOTS = rootDir;

    try {
      const registry = new WorkspaceRegistry(dataDir);
      await expect(registry.add(projectDir)).rejects.toThrow('configured workspace root');
    } finally {
      if (previous === undefined) {
        delete process.env.DEVSURFACE_WORKSPACE_ROOTS;
      } else {
        process.env.DEVSURFACE_WORKSPACE_ROOTS = previous;
      }
    }
  });

  it('drops stale workspace entries on resolve', async () => {
    const dataDir = await tempDir();
    const projectDir = await tempDir();

    const registry = new WorkspaceRegistry(dataDir);
    const entry = await registry.add(projectDir);
    await fs.rm(projectDir, { recursive: true, force: true });

    expect(await registry.resolve(entry.id)).toBeNull();
    expect(await registry.list()).toHaveLength(0);
  });

  it('ignores symlink paths that escape outside the project when added via path resolution', async () => {
    const dataDir = await tempDir();
    const projectDir = await tempDir();
    const outside = await tempDir();

    await fs.symlink(outside, path.join(projectDir, 'link'), 'junction');

    const registry = new WorkspaceRegistry(dataDir);
    const entry = await registry.add(path.join(projectDir, 'link'));
    expect(entry.path).toBe(await fs.realpath(outside));
  });
});
