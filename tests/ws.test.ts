import { createServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { ProcessManager } from '../src/core/process/manager.js';
import { setupWebSocket } from '../src/server/routes/ws.js';

const servers: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
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
});
