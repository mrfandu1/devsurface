import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import path from 'node:path';
import { Hub } from '../src/core/hub/runtime.js';
import { ProcessManager } from '../src/core/process/manager.js';
import { setupHubWebSocket, setupWebSocket } from '../src/server/routes/ws.js';
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

const servers: Array<{ close: () => Promise<void> }> = [];
const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
  await Promise.all(tempDirs.splice(0).map((dir) => removeTempProject(dir)));
});

async function createWsServer(
  processManager = new ProcessManager()
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer();
  const wss = setupWebSocket(server, processManager);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const handle = {
    url: `ws://127.0.0.1:${address.port}/ws`,
    close: async () => {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  };
  servers.push(handle);
  return handle;
}

async function tempDir(): Promise<string> {
  const dir = await makeTempProject();
  tempDirs.push(dir);
  return dir;
}

async function createHubWsServer(hub: Hub): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer();
  const wss = setupHubWebSocket(server, hub);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  const handle = {
    url: `ws://127.0.0.1:${address.port}/ws`,
    close: async () => {
      await new Promise<void>((resolve) => wss.close(() => resolve()));
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    }
  };
  servers.push(handle);
  return handle;
}

async function nextMessage(socket: WebSocket): Promise<string> {
  return await new Promise<string>((resolve, reject) => {
    socket.once('message', (data) => resolve(String(data)));
    socket.once('error', reject);
  });
}

describe('websocket security', () => {
  it('allows same-origin dashboard connections', async () => {
    const server = await createWsServer();
    const sameOrigin = server.url.replace('ws://', 'http://').replace('/ws', '');
    const socket = new WebSocket(server.url, {
      headers: {
        Origin: sameOrigin
      }
    });

    const message = await new Promise<string>((resolve, reject) => {
      socket.once('message', (data) => resolve(String(data)));
      socket.once('error', reject);
    });
    socket.close();

    expect(message).toContain('"type":"hello"');
  });

  it('rejects cross-origin browser connections', async () => {
    const server = await createWsServer();
    const socket = new WebSocket(server.url, {
      headers: {
        Origin: 'https://attacker.example'
      }
    });

    const outcome = await new Promise<'closed' | 'opened'>((resolve) => {
      socket.once('open', () => resolve('opened'));
      socket.once('unexpected-response', () => resolve('closed'));
      socket.once('error', () => resolve('closed'));
      socket.once('close', () => resolve('closed'));
    });
    socket.close();

    expect(outcome).toBe('closed');
  });

  it('rejects DNS-rebound websocket hosts', async () => {
    const server = await createWsServer();
    const port = new URL(server.url).port;
    const socket = new WebSocket(server.url, {
      headers: {
        Host: `evil.test:${port}`,
        Origin: `http://evil.test:${port}`,
        'Sec-Fetch-Site': 'same-origin'
      }
    });

    const outcome = await new Promise<'closed' | 'opened'>((resolve) => {
      socket.once('open', () => resolve('opened'));
      socket.once('unexpected-response', () => resolve('closed'));
      socket.once('error', () => resolve('closed'));
      socket.once('close', () => resolve('closed'));
    });
    socket.close();

    expect(outcome).toBe('closed');
  });

  it('sends retained process logs on hello', async () => {
    const processManager = new ProcessManager();
    const finalStatePromise = new Promise<void>((resolve) => {
      processManager.on('process', (event) => {
        if (event.status !== 'running') {
          resolve();
        }
      });
    });

    processManager.start({
      cwd: process.cwd(),
      script: 'history-probe',
      command: process.execPath,
      args: ['-e', 'console.log("websocket-history")'],
      displayCommand: 'node -e console.log'
    });
    await finalStatePromise;

    const server = await createWsServer(processManager);
    const sameOrigin = server.url.replace('ws://', 'http://').replace('/ws', '');
    const socket = new WebSocket(server.url, {
      headers: {
        Origin: sameOrigin
      }
    });

    const message = await new Promise<string>((resolve, reject) => {
      socket.once('message', (data) => resolve(String(data)));
      socket.once('error', reject);
    });
    socket.close();

    expect(message).toContain('"type":"hello"');
    expect(message).toContain('websocket-history');
  });

  it('scopes hub websocket broadcasts to the selected workspace', async () => {
    const dataDir = await tempDir();
    const projectA = await tempDir();
    const projectB = await tempDir();
    await writeJson(path.join(projectA, 'package.json'), { name: 'ws-a', scripts: {} });
    await writeJson(path.join(projectB, 'package.json'), { name: 'ws-b', scripts: {} });

    const hub = new Hub({ dataDir });
    const entryA = await hub.registry.add(projectA);
    const entryB = await hub.registry.add(projectB);
    const runtimeA = hub.ensure(entryA);
    hub.ensure(entryB);

    const server = await createHubWsServer(hub);
    const sameOrigin = server.url.replace('ws://', 'http://').replace('/ws', '');
    const socketA = new WebSocket(`${server.url}?workspace=${encodeURIComponent(entryA.id)}`, {
      headers: { Origin: sameOrigin }
    });
    const socketB = new WebSocket(`${server.url}?workspace=${encodeURIComponent(entryB.id)}`, {
      headers: { Origin: sameOrigin }
    });

    await Promise.all([nextMessage(socketA), nextMessage(socketB)]);

    const unexpectedB = new Promise<'leaked' | 'quiet'>((resolve) => {
      socketB.once('message', () => resolve('leaked'));
      setTimeout(() => resolve('quiet'), 100);
    });
    const messageA = nextMessage(socketA);
    runtimeA.processManager.emit('log', {
      pid: 'manual',
      script: 'probe',
      stream: 'stdout',
      message: 'workspace-a-only',
      timestamp: new Date().toISOString()
    });

    expect(await messageA).toContain('workspace-a-only');
    expect(await unexpectedB).toBe('quiet');
    socketA.close();
    socketB.close();
  });
});
