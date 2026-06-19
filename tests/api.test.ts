import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ProcessManager } from '../src/core/process/manager.js';
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

describe('api routes', () => {
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
      headers: {
        'X-DevSurface-Intent': 'dashboard'
      }
    });

    expect(response.status).toBe(200);
    await expect(fs.readFile(path.join(root, '.env'), 'utf8')).resolves.toBe(
      'DATABASE_URL=postgres://secret\n'
    );

    const projectResponse = await app.request('http://127.0.0.1:4567/api/project');
    const body = await projectResponse.text();
    expect(body).not.toContain('postgres://secret');
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
      headers: {
        'X-DevSurface-Intent': 'dashboard'
      }
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
      headers: {
        'X-DevSurface-Intent': 'dashboard'
      }
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
      headers: {
        'X-DevSurface-Intent': 'dashboard'
      }
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
      headers: {
        'X-DevSurface-Intent': 'dashboard'
      }
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
});
