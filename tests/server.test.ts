import net from 'node:net';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DEFAULT_HOST, startDevSurfaceServer } from '../src/server/index.js';
import type { DevSurfaceServer } from '../src/server/index.js';

const HOST = DEFAULT_HOST;
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

const tempProjects: string[] = [];
const occupiedServers: net.Server[] = [];
const devSurfaceServers: DevSurfaceServer[] = [];

afterEach(async () => {
  await Promise.all(devSurfaceServers.splice(0).map((server) => server.close()));
  await Promise.all(
    occupiedServers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          });
        })
    )
  );
  await Promise.all(tempProjects.splice(0).map((project) => removeTempProject(project)));
});

async function tempProject(): Promise<string> {
  const root = await makeTempProject();
  tempProjects.push(root);
  await writeJson(path.join(root, 'package.json'), {
    name: 'server-start-demo',
    scripts: {}
  });
  return root;
}

async function occupyLocalPort(): Promise<number> {
  const server = net.createServer();

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, HOST, resolve);
  });

  occupiedServers.push(server);
  return (server.address() as AddressInfo).port;
}

describe('server startup', () => {
  it('rejects with an actionable error when the requested dashboard port is occupied', async () => {
    const root = await tempProject();
    const port = await occupyLocalPort();

    await expect(
      startDevSurfaceServer({
        projectRoot: root,
        port,
        openBrowser: false
      })
    ).rejects.toThrow(`Port ${port} is already in use`);
  });
});
