import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Hub } from '../src/core/hub/runtime.js';
import { createHubApp } from '../src/server/index.js';
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

async function createHub(dataDir: string) {
  const hub = new Hub({ dataDir });
  const app = await createHubApp({ hub, mutationToken: 'test-token' });
  return { hub, app };
}

const mutHeaders = {
  'X-DevSurface-Intent': 'dashboard',
  'X-DevSurface-Token': 'test-token'
};

describe('hub API routes', () => {
  it('returns hub status', async () => {
    const dataDir = await tempDir();
    const { app } = await createHub(dataDir);

    const response = await app.request('http://127.0.0.1:4567/api/hub/status');
    expect(response.status).toBe(200);

    const body = (await response.json()) as { status: string };
    expect(body.status).toBe('running');
  });

  it('does not disclose the mutation token to DNS-rebound hosts', async () => {
    const dataDir = await tempDir();
    const { app } = await createHub(dataDir);

    const response = await app.request('http://evil.test:4567/api/session');

    expect(response.status).toBe(403);
  });

  it('lists workspaces', async () => {
    const dataDir = await tempDir();
    const projectA = await tempDir();
    await writeJson(path.join(projectA, 'package.json'), { name: 'project-a' });

    const { hub, app } = await createHub(dataDir);
    await hub.registry.add(projectA);

    const response = await app.request('http://127.0.0.1:4567/api/workspaces');
    expect(response.status).toBe(200);

    const list = (await response.json()) as Array<{ name: string }>;
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe('project-a');
  });

  it('registers a workspace via POST', async () => {
    const dataDir = await tempDir();
    const projectA = await tempDir();
    await writeJson(path.join(projectA, 'package.json'), { name: 'via-api' });

    const { app } = await createHub(dataDir);

    const response = await app.request('http://127.0.0.1:4567/api/workspaces', {
      method: 'POST',
      headers: {
        ...mutHeaders,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ path: projectA })
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { id: string; name: string };
    expect(body.name).toBe('via-api');
  });

  it('scans a workspace project', async () => {
    const dataDir = await tempDir();
    const projectA = await tempDir();
    await writeJson(path.join(projectA, 'package.json'), {
      name: 'scan-test',
      scripts: { dev: 'vite' }
    });

    const { hub, app } = await createHub(dataDir);
    const entry = await hub.registry.add(projectA);

    const response = await app.request(`http://127.0.0.1:4567/api/workspaces/${entry.id}/project`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      projectName: string;
      scripts: Record<string, string>;
    };
    expect(body.projectName).toBe('scan-test');
    expect(body.scripts.dev).toBe('vite');
  });

  it('returns 404 for unknown workspace', async () => {
    const dataDir = await tempDir();
    const { app } = await createHub(dataDir);

    const response = await app.request('http://127.0.0.1:4567/api/workspaces/nonexistent/project');
    expect(response.status).toBe(404);
  });

  it('removes a workspace', async () => {
    const dataDir = await tempDir();
    const projectA = await tempDir();

    const { hub, app } = await createHub(dataDir);
    const entry = await hub.registry.add(projectA);

    const deleteResponse = await app.request(`http://127.0.0.1:4567/api/workspaces/${entry.id}`, {
      method: 'DELETE',
      headers: mutHeaders
    });
    expect(deleteResponse.status).toBe(200);

    const listResponse = await app.request('http://127.0.0.1:4567/api/workspaces');
    const list = (await listResponse.json()) as unknown[];
    expect(list).toHaveLength(0);
  });

  it('isolates processes between workspaces', async () => {
    const dataDir = await tempDir();
    const projectA = await tempDir();
    const projectB = await tempDir();
    await writeJson(path.join(projectA, 'package.json'), { name: 'iso-a', scripts: {} });
    await writeJson(path.join(projectB, 'package.json'), { name: 'iso-b', scripts: {} });

    const { hub, app } = await createHub(dataDir);
    const entryA = await hub.registry.add(projectA);
    const entryB = await hub.registry.add(projectB);

    const runtimeA = hub.ensure(entryA);
    const runtimeB = hub.ensure(entryB);

    expect(runtimeA.processManager).not.toBe(runtimeB.processManager);

    const processesA = await app.request(
      `http://127.0.0.1:4567/api/workspaces/${entryA.id}/processes`
    );
    const processesB = await app.request(
      `http://127.0.0.1:4567/api/workspaces/${entryB.id}/processes`
    );

    expect(await processesA.json()).toEqual([]);
    expect(await processesB.json()).toEqual([]);
  });

  it('provides backward-compatible /api/project for the first workspace', async () => {
    const dataDir = await tempDir();
    const projectA = await tempDir();
    await writeJson(path.join(projectA, 'package.json'), {
      name: 'compat-test',
      scripts: {}
    });

    const { hub, app } = await createHub(dataDir);
    await hub.registry.add(projectA);

    const response = await app.request('http://127.0.0.1:4567/api/project');
    expect(response.status).toBe(200);

    const body = (await response.json()) as { projectName: string };
    expect(body.projectName).toBe('compat-test');
  });
});
