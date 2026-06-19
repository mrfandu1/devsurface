import { promises as fs } from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdaptorServer } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import open from 'open';
import { ProcessManager } from '../core/process/manager.js';
import { registerApiRoutes } from './routes/api.js';
import { setupWebSocket } from './routes/ws.js';

export const HOST = '127.0.0.1';
export const DEFAULT_PORT = 4567;

export interface DevSurfaceServer {
  url: string;
  port: number;
  close: () => Promise<void>;
  processManager: ProcessManager;
}

function assertLocalHost(host: string): void {
  if (host !== HOST) {
    throw new Error('DevSurface must bind only to 127.0.0.1.');
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findWebDistDir(): Promise<string | null> {
  const moduleDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.join(moduleDir, '..', 'web', 'dist'),
    path.join(moduleDir, '..', '..', 'src', 'web', 'dist'),
    path.join(moduleDir, 'web', 'dist')
  ];

  for (const candidate of candidates) {
    if (await fileExists(path.join(candidate, 'index.html'))) {
      return candidate;
    }
  }

  return null;
}

function toListenError(error: unknown, port: number): Error {
  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;

  if (code === 'EADDRINUSE') {
    return new Error(
      `Port ${port} is already in use on ${HOST}. Stop the other process or run DevSurface with --port ${port + 1}.`,
      { cause: error }
    );
  }

  if (code === 'EACCES') {
    return new Error(`DevSurface does not have permission to bind to ${HOST}:${port}.`, {
      cause: error
    });
  }

  return error instanceof Error ? error : new Error(String(error));
}

async function listenOnLocalHost(
  server: Server,
  wss: ReturnType<typeof setupWebSocket>,
  port: number
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      server.off('error', onError);
      server.off('listening', onListening);
      wss.off('error', onError);
    };

    const onError = (error: unknown) => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      reject(toListenError(error, port));
    };

    const onListening = () => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve();
    };

    wss.once('error', onError);
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, HOST);
  });
}

async function closeWebSocketServer(wss: ReturnType<typeof setupWebSocket>): Promise<void> {
  await new Promise<void>((resolve) => {
    wss.close(() => resolve());
  });
}

async function closeHttpServer(server: Server): Promise<void> {
  if (!server.listening) {
    return;
  }

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

export async function createApp(options: {
  projectRoot: string;
  processManager: ProcessManager;
}): Promise<Hono> {
  const app = new Hono();
  registerApiRoutes(app, options);

  const webDistDir = await findWebDistDir();
  if (webDistDir !== null) {
    app.use('/assets/*', serveStatic({ root: webDistDir }));
    app.get('/favicon.svg', serveStatic({ root: webDistDir }));
    app.get('*', async (context) => {
      const html = await fs.readFile(path.join(webDistDir, 'index.html'), 'utf8');
      return context.html(html);
    });
  } else {
    app.get('*', (context) =>
      context.html(
        '<!doctype html><title>DevSurface</title><main><h1>DevSurface</h1><p>Run npm run build:web to build the dashboard.</p></main>',
        503
      )
    );
  }

  return app;
}

export async function startDevSurfaceServer(options: {
  projectRoot: string;
  port?: number;
  openBrowser?: boolean;
}): Promise<DevSurfaceServer> {
  assertLocalHost(HOST);
  const port = options.port ?? DEFAULT_PORT;
  const processManager = new ProcessManager();
  processManager.attachCleanupHandlers();
  const app = await createApp({
    projectRoot: options.projectRoot,
    processManager
  });

  const server = createAdaptorServer({
    fetch: app.fetch,
    hostname: HOST
  }) as Server;
  const wss = setupWebSocket(server, processManager);
  await listenOnLocalHost(server, wss, port);
  processManager.attachCleanupHandlers();

  const url = `http://${HOST}:${port}`;

  if (options.openBrowser !== false) {
    await open(url);
  }

  return {
    url,
    port,
    processManager,
    close: async () => {
      processManager.killAll();
      await closeWebSocketServer(wss);
      await closeHttpServer(server);
    }
  };
}
