import type { Server } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ProcessManager } from '../../core/process/manager.js';
import type { Hub } from '../../core/hub/runtime.js';
import type { ManagedProcessSnapshot, ProcessLogEvent } from '../../core/types.js';
import { isAllowedLocalHostHeader, isAllowedLocalOrigin } from '../localAccess.js';
import { getListenHost, isAllowedClientConnection } from '../listenConfig.js';
import { remoteAddressFromRequest } from '../accessControl.js';

function isAllowedWebSocketRequest(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  const host = request.headers.host;
  const secFetchSite = request.headers['sec-fetch-site'];

  if (!isAllowedClientConnection(remoteAddressFromRequest(request), getListenHost())) {
    return false;
  }

  if (typeof host !== 'string' || !isAllowedLocalHostHeader(host)) {
    return false;
  }

  if (secFetchSite === 'cross-site') {
    return false;
  }

  if (typeof origin !== 'string') {
    return true;
  }

  if (!isAllowedLocalOrigin(origin)) {
    return false;
  }

  try {
    return new URL(origin).host.toLowerCase() === host.toLowerCase();
  } catch {
    return false;
  }
}

function workspaceIdFromUrl(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = new URL(url, 'http://localhost');
    return parsed.searchParams.get('workspace');
  } catch {
    return null;
  }
}

// Legacy single-ProcessManager WebSocket (backward compat with tests)
export function setupWebSocket(server: Server, processManager: ProcessManager): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: (info: { req: IncomingMessage }) => isAllowedWebSocketRequest(info.req)
  });

  function broadcast(payload: unknown): void {
    const serialized = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(serialized);
      }
    }
  }

  processManager.on('log', (event: ProcessLogEvent) => {
    broadcast({ type: 'log', event });
  });

  processManager.on('process', (processInfo: ManagedProcessSnapshot) => {
    broadcast({ type: 'process', process: processInfo });
  });

  wss.on('connection', (socket) => {
    socket.send(
      JSON.stringify({
        type: 'hello',
        processes: processManager.list(),
        logs: processManager.listLogs()
      })
    );
  });

  return wss;
}

// Hub-aware WebSocket: each connection is scoped to a workspace via ?workspace=<id>
export function setupHubWebSocket(server: Server, hub: Hub): WebSocketServer {
  const wss = new WebSocketServer({
    server,
    path: '/ws',
    verifyClient: (info: { req: IncomingMessage }) => isAllowedWebSocketRequest(info.req)
  });

  const clientWorkspaces = new WeakMap<WebSocket, string>();
  const attachedManagers = new Set<string>();

  function attachManager(workspaceId: string, processManager: ProcessManager): void {
    if (attachedManagers.has(workspaceId)) {
      return;
    }
    attachedManagers.add(workspaceId);

    processManager.on('log', (event: ProcessLogEvent) => {
      broadcastToWorkspace(workspaceId, { type: 'log', event });
    });

    processManager.on('process', (processInfo: ManagedProcessSnapshot) => {
      broadcastToWorkspace(workspaceId, { type: 'process', process: processInfo });
    });
  }

  function broadcastToWorkspace(workspaceId: string, payload: unknown): void {
    const serialized = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN && clientWorkspaces.get(client) === workspaceId) {
        client.send(serialized);
      }
    }
  }

  wss.on('connection', async (socket, request) => {
    const workspaceId = workspaceIdFromUrl(request.url);
    if (!workspaceId) {
      socket.close(4000, 'Missing workspace query parameter.');
      return;
    }

    const entry = await hub.registry.resolve(workspaceId);
    if (!entry) {
      socket.close(4004, 'Workspace not found.');
      return;
    }

    const runtime = hub.ensure(entry);
    clientWorkspaces.set(socket, workspaceId);
    attachManager(workspaceId, runtime.processManager);

    socket.send(
      JSON.stringify({
        type: 'hello',
        workspace: workspaceId,
        processes: runtime.processManager.list(),
        logs: runtime.processManager.listLogs()
      })
    );
  });

  return wss;
}
