import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProcessManager } from '../src/core/process/manager.js';
import type { DockerController } from '../src/core/docker/compose.js';
import { createApp } from '../src/server/index.js';
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

const tempProjects: string[] = [];

afterEach(async () => {
  await Promise.all(tempProjects.splice(0).map((project) => removeTempProject(project)));
});

async function tempProject(): Promise<string> {
  const project = await makeTempProject();
  tempProjects.push(project);
  return project;
}

async function createTestApp(root: string) {
  return await createApp({
    projectRoot: root,
    processManager: new ProcessManager()
  });
}

async function createTestAppWithManager(root: string, processManager: ProcessManager) {
  return await createApp({
    projectRoot: root,
    processManager
  });
}

async function createTestAppWithDocker(root: string, dockerController: DockerController) {
  return await createApp({
    projectRoot: root,
    processManager: new ProcessManager(),
    dockerController
  });
}

async function mutationHeaders(app: Awaited<ReturnType<typeof createTestApp>>) {
  const session = await app.request('http://127.0.0.1:4567/api/session');
  expect(session.status).toBe(200);
  const body = (await session.json()) as { token: string };
  return {
    'X-DevSurface-Intent': 'dashboard',
    'X-DevSurface-Token': body.token
  };
}

describe('api routes', () => {
  it('starts, stops, and reads logs for Docker Compose services', async () => {
    const root = await tempProject();
    const actions: string[] = [];
    const dockerController: DockerController = {
      inspect: async () => null,
      start: async (service) => {
        actions.push(`start:${service}`);
        return { service, action: 'start', output: 'started' };
      },
      stop: async (service) => {
        actions.push(`stop:${service}`);
        return { service, action: 'stop', output: 'stopped' };
      },
      logs: async (service) => {
        actions.push(`logs:${service}`);
        return { service, logs: 'postgres ready' };
      }
    };
    const app = await createTestAppWithDocker(root, dockerController);
    const headers = await mutationHeaders(app);

    const startResponse = await app.request('http://127.0.0.1:4567/api/docker/postgres/start', {
      method: 'POST',
      headers
    });
    const stopResponse = await app.request('http://127.0.0.1:4567/api/docker/postgres/stop', {
      method: 'POST',
      headers
    });
    const logsResponse = await app.request('http://127.0.0.1:4567/api/docker/postgres/logs');

    expect(startResponse.status).toBe(200);
    expect(stopResponse.status).toBe(200);
    expect(await logsResponse.json()).toEqual({
      service: 'postgres',
      logs: 'postgres ready'
    });
    expect(actions).toEqual(['start:postgres', 'stop:postgres', 'logs:postgres']);
  });

  it('copies .env.example to .env without exposing values', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'env-copy-demo',
      scripts: {}
    });
    await fs.writeFile(path.join(root, '.env.example'), 'DATABASE_URL=postgres://secret\n', 'utf8');
    const app = await createTestApp(root);

    const response = await app.request('http://127.0.0.1:4567/api/env/copy', {
      method: 'POST',
      headers: await mutationHeaders(app)
    });

    expect(response.status).toBe(200);
    await expect(fs.readFile(path.join(root, '.env'), 'utf8')).resolves.toBe(
      'DATABASE_URL=postgres://secret\n'
    );

    const projectResponse = await app.request('http://127.0.0.1:4567/api/project');
    const body = await projectResponse.text();
    expect(body).not.toContain('postgres://secret');
  });

  it('returns an onboarding plan with a readiness score', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'onboard-demo',
      scripts: { dev: 'vite' }
    });
    await fs.writeFile(path.join(root, '.env.example'), 'API_KEY=\n', 'utf8');
    const app = await createTestApp(root);

    const response = await app.request('http://127.0.0.1:4567/api/onboarding');
    expect(response.status).toBe(200);

    const plan = (await response.json()) as {
      readiness: number;
      ready: boolean;
      steps: Array<{ id: string; status: string }>;
    };
    expect(typeof plan.readiness).toBe('number');
    expect(plan.steps.some((step) => step.id === 'create-env' && step.status === 'todo')).toBe(
      true
    );
    expect(plan.steps.some((step) => step.id === 'start-app')).toBe(true);
  });

  it('does not overwrite an existing .env file', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'env-copy-existing',
      scripts: {}
    });
    await fs.writeFile(path.join(root, '.env.example'), 'DATABASE_URL=example\n', 'utf8');
    await fs.writeFile(path.join(root, '.env'), 'DATABASE_URL=local\n', 'utf8');
    const app = await createTestApp(root);

    const response = await app.request('http://127.0.0.1:4567/api/env/copy', {
      method: 'POST',
      headers: await mutationHeaders(app)
    });

    expect(response.status).toBe(409);
    await expect(fs.readFile(path.join(root, '.env'), 'utf8')).resolves.toBe(
      'DATABASE_URL=local\n'
    );
  });

  it('rejects cross-origin mutation requests', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'csrf-demo',
      scripts: {
        test: 'node -e "console.log(1)"'
      }
    });
    const app = await createTestApp(root);

    const response = await app.request('http://127.0.0.1:4567/api/run/test', {
      method: 'POST',
      headers: {
        Origin: 'https://attacker.example'
      }
    });

    expect(response.status).toBe(403);
  });

  it('rejects local mutations without dashboard intent', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'intent-demo',
      scripts: {}
    });
    await fs.writeFile(path.join(root, '.env.example'), 'DATABASE_URL=example\n', 'utf8');
    const app = await createTestApp(root);

    const response = await app.request('http://127.0.0.1:4567/api/env/copy', {
      method: 'POST'
    });

    expect(response.status).toBe(403);
    await expect(fs.access(path.join(root, '.env'))).rejects.toBeTruthy();
  });

  it('rejects browser cross-site mutations even without Origin', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'fetch-site-demo',
      scripts: {}
    });
    await fs.writeFile(path.join(root, '.env.example'), 'DATABASE_URL=example\n', 'utf8');
    const app = await createTestApp(root);

    const response = await app.request('http://127.0.0.1:4567/api/env/copy', {
      method: 'POST',
      headers: {
        'Sec-Fetch-Site': 'cross-site'
      }
    });

    expect(response.status).toBe(403);
  });

  it('rejects DNS-rebound mutation hosts', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'host-check-demo',
      scripts: {}
    });
    await fs.writeFile(path.join(root, '.env.example'), 'DATABASE_URL=example\n', 'utf8');
    const app = await createTestApp(root);

    const response = await app.request('http://evil.test:4567/api/env/copy', {
      method: 'POST',
      headers: {
        Origin: 'http://evil.test:4567',
        'Sec-Fetch-Site': 'same-origin',
        'X-DevSurface-Intent': 'dashboard'
      }
    });

    expect(response.status).toBe(403);
    await expect(fs.access(path.join(root, '.env'))).rejects.toBeTruthy();
  });

  it('does not disclose the mutation token to DNS-rebound hosts', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'session-host-check-demo',
      scripts: {}
    });
    const app = await createTestApp(root);

    const response = await app.request('http://evil.test:4567/api/session');

    expect(response.status).toBe(403);
  });

  it('runs configured commands by name from devsurface.config.json', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'configured-command-demo',
      scripts: {}
    });
    await writeJson(path.join(root, 'devsurface.config.json'), {
      commands: {
        probe: `"${process.execPath}" -e "console.log('configured-ok')"`
      }
    });
    const processManager = new ProcessManager();
    const app = await createTestAppWithManager(root, processManager);

    const finalStatePromise = new Promise<void>((resolve) => {
      processManager.on('process', (event) => {
        if (event.script === 'probe' && event.status !== 'running') {
          resolve();
        }
      });
    });
    const response = await app.request('http://127.0.0.1:4567/api/commands/probe', {
      method: 'POST',
      headers: await mutationHeaders(app)
    });
    await finalStatePromise;

    expect(response.status).toBe(200);
    expect(
      processManager
        .listLogs()
        .map((event) => event.message)
        .join('')
    ).toContain('configured-ok');
  });

  it('returns retained process logs over the API', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'log-history-demo',
      scripts: {}
    });
    const processManager = new ProcessManager();
    const app = await createTestAppWithManager(root, processManager);

    const finalStatePromise = new Promise<void>((resolve) => {
      processManager.on('process', (event) => {
        if (event.script === 'history' && event.status !== 'running') {
          resolve();
        }
      });
    });

    processManager.start({
      cwd: root,
      script: 'history',
      command: process.execPath,
      args: ['-e', 'console.log("retained-log")'],
      displayCommand: 'node history'
    });
    await finalStatePromise;

    const response = await app.request('http://127.0.0.1:4567/api/logs');
    const logs = (await response.json()) as Array<{ message: string; script: string }>;

    expect(response.status).toBe(200);
    expect(logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          script: 'history',
          message: expect.stringContaining('retained-log')
        })
      ])
    );
  });

  it('rejects env copy sources that resolve outside the project root', async () => {
    const root = await tempProject();
    const outside = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'source-link-demo',
      scripts: {}
    });
    await writeJson(path.join(root, 'devsurface.config.json'), {
      env: {
        example: path.join('linked-env', '.env.example'),
        local: '.env'
      }
    });
    await fs.writeFile(path.join(outside, '.env.example'), 'OUTSIDE_SECRET=copied\n', 'utf8');
    await fs.symlink(outside, path.join(root, 'linked-env'), 'junction');
    const app = await createTestApp(root);

    const response = await app.request('http://127.0.0.1:4567/api/env/copy', {
      method: 'POST',
      headers: await mutationHeaders(app)
    });

    expect(response.status).not.toBe(200);
    await expect(fs.access(path.join(root, '.env'))).rejects.toBeTruthy();
  });

  it('rejects env copy destinations that resolve outside the project root', async () => {
    const root = await tempProject();
    const outside = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'destination-link-demo',
      scripts: {}
    });
    await writeJson(path.join(root, 'devsurface.config.json'), {
      env: {
        example: '.env.example',
        local: path.join('linked-env', '.env')
      }
    });
    await fs.writeFile(path.join(root, '.env.example'), 'INSIDE_VALUE=written\n', 'utf8');
    await fs.symlink(outside, path.join(root, 'linked-env'), 'junction');
    const app = await createTestApp(root);

    const response = await app.request('http://127.0.0.1:4567/api/env/copy', {
      method: 'POST',
      headers: await mutationHeaders(app)
    });

    expect(response.status).toBe(400);
    await expect(fs.access(path.join(outside, '.env'))).rejects.toBeTruthy();
  });

  it('does not serve dashboard assets from the scanned project root', async () => {
    const root = await tempProject();
    const oldCwd = process.cwd();
    await writeJson(path.join(root, 'package.json'), {
      name: 'asset-fallback-demo',
      scripts: {}
    });
    await fs.mkdir(path.join(root, 'src', 'web', 'dist'), { recursive: true });
    await fs.writeFile(
      path.join(root, 'src', 'web', 'dist', 'index.html'),
      '<!doctype html><script>window.evil=true</script>',
      'utf8'
    );

    try {
      process.chdir(root);
      const app = await createTestApp(root);
      const response = await app.request('http://127.0.0.1:4567/');
      const body = await response.text();
      expect(body).not.toContain('window.evil');
    } finally {
      process.chdir(oldCwd);
    }
  });

  it('rejects local mutations without the session token', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'token-demo',
      scripts: {}
    });
    await fs.writeFile(path.join(root, '.env.example'), 'DATABASE_URL=example\n', 'utf8');
    const app = await createTestApp(root);

    const response = await app.request('http://127.0.0.1:4567/api/env/copy', {
      method: 'POST',
      headers: {
        'X-DevSurface-Intent': 'dashboard'
      }
    });

    expect(response.status).toBe(403);
    await expect(fs.access(path.join(root, '.env'))).rejects.toBeTruthy();
  });

  it('rejects configured commands with shell metacharacters', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'shell-config-demo',
      scripts: {}
    });
    await writeJson(path.join(root, 'devsurface.config.json'), {
      commands: {
        chained: `${process.execPath} -e "console.log(1)"; echo pwned`
      }
    });
    const app = await createTestApp(root);

    const response = await app.request('http://127.0.0.1:4567/api/commands/chained', {
      method: 'POST',
      headers: await mutationHeaders(app)
    });

    expect(response.status).toBe(400);
  });

  it('rejects dangerous configured commands on the server', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'danger-config-demo',
      scripts: {}
    });
    await writeJson(path.join(root, 'devsurface.config.json'), {
      commands: {
        wipe: 'docker volume rm data'
      }
    });
    const app = await createTestApp(root);

    const response = await app.request('http://127.0.0.1:4567/api/commands/wipe', {
      method: 'POST',
      headers: await mutationHeaders(app)
    });

    expect(response.status).toBe(403);
  });

  it('rejects dangerous package scripts on the server', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'danger-script-demo',
      scripts: {
        reset: 'prisma migrate reset --force'
      }
    });
    const app = await createTestApp(root);

    const response = await app.request('http://127.0.0.1:4567/api/run/reset', {
      method: 'POST',
      headers: await mutationHeaders(app)
    });

    expect(response.status).toBe(403);
  });
});
