import { promises as fs } from 'node:fs';
import type { Server } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAdaptorServer } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import open from 'open';
import type { DockerController } from '../core/docker/compose.js';
import { ProcessManager } from '../core/process/manager.js';
import { Hub } from '../core/hub/runtime.js';
import { registerApiRoutes, registerHubApiRoutes } from './routes/api.js';
import { setupWebSocket, setupHubWebSocket } from './routes/ws.js';
import { createMutationToken } from './mutationToken.js';
import { initializeListenHost, DEFAULT_PORT } from './listenConfig.js';

export { DEFAULT_HOST, DEFAULT_PORT, resolveHost } from './listenConfig.js';

export interface DevSurfaceServer {
  url: string;
  port: number;
  host: string;
  hub: Hub;
  close: () => Promise<void>;
  processManager: ProcessManager;
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

function toListenError(error: unknown, host: string, port: number): Error {
  const code = error instanceof Error ? (error as NodeJS.ErrnoException).code : undefined;

  if (code === 'EADDRINUSE') {
    return new Error(
      `Port ${port} is already in use on ${host}. Stop the other process or run DevSurface with --port ${port + 1}.`,
      { cause: error }
    );
  }

  if (code === 'EACCES') {
    return new Error(`DevSurface does not have permission to bind to ${host}:${port}.`, {
      cause: error
    });
  }

  return error instanceof Error ? error : new Error(String(error));
}

async function listenOnHost(
  server: Server,
  wss: ReturnType<typeof setupWebSocket>,
  host: string,
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
      if (settled) return;
      settled = true;
      cleanup();
      reject(toListenError(error, host, port));
    };

    const onListening = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve();
    };

    wss.once('error', onError);
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, host);
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

async function mountWebUi(app: Hono): Promise<void> {
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
}

// Legacy single-project createApp (backward compat with existing tests)
export async function createApp(options: {
  projectRoot: string;
  processManager: ProcessManager;
  dockerController?: DockerController;
  mutationToken?: string;
}): Promise<Hono> {
  const app = new Hono();
  registerApiRoutes(app, {
    ...options,
    mutationToken: options.mutationToken ?? createMutationToken()
  });
  await mountWebUi(app);
  return app;
}

// Hub-mode createApp
export async function createHubApp(options: { hub: Hub; mutationToken?: string }): Promise<Hono> {
  const app = new Hono();
  registerHubApiRoutes(app, {
    hub: options.hub,
    mutationToken: options.mutationToken ?? createMutationToken()
  });
  await mountWebUi(app);
  return app;
}

export async function startHubServer(options: {
  port?: number;
  openBrowser?: boolean;
  dataDir?: string;
  initialWorkspace?: string;
}): Promise<DevSurfaceServer> {
  const host = initializeListenHost();
  const port = options.port ?? DEFAULT_PORT;
  const hub = new Hub({ dataDir: options.dataDir });
  hub.attachCleanupHandlers();

  if (options.initialWorkspace) {
    await hub.registry.add(options.initialWorkspace);
  }

  const mutationToken = createMutationToken();
  const app = await createHubApp({ hub, mutationToken });

  const server = createAdaptorServer({
    fetch: app.fetch,
    hostname: host
  }) as Server;
  const wss = setupHubWebSocket(server, hub);
  await listenOnHost(server, wss, host, port);

  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;

  if (options.openBrowser !== false) {
    const entries = await hub.registry.list();
    const deepLink = entries.length > 0 ? `${url}/?workspace=${entries[0].id}` : url;
    await open(deepLink);
  }

  const dummyProcessManager = new ProcessManager();

  return {
    url,
    port,
    host,
    hub,
    processManager: dummyProcessManager,
    close: async () => {
      hub.killAll();
      await closeWebSocketServer(wss);
      await closeHttpServer(server);
    }
  };
}

// Legacy single-project server (used by old tests)
export async function startDevSurfaceServer(options: {
  projectRoot: string;
  port?: number;
  openBrowser?: boolean;
}): Promise<DevSurfaceServer> {
  const host = initializeListenHost();
  const port = options.port ?? DEFAULT_PORT;
  const hub = new Hub();
  hub.attachCleanupHandlers();

  await hub.registry.add(options.projectRoot);
  const processManager = new ProcessManager();
  processManager.attachCleanupHandlers();

  const app = await createApp({
    projectRoot: options.projectRoot,
    processManager
  });

  const server = createAdaptorServer({
    fetch: app.fetch,
    hostname: host
  }) as Server;
  const wss = setupWebSocket(server, processManager);
  await listenOnHost(server, wss, host, port);

  const url = `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`;

  if (options.openBrowser !== false) {
    await open(url);
  }

  return {
    url,
    port,
    host,
    hub,
    processManager,
    close: async () => {
      processManager.killAll();
      hub.killAll();
      await closeWebSocketServer(wss);
      await closeHttpServer(server);
    }
  };
}
