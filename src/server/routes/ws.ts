import type { Server } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ProcessManager } from '../../core/process/manager.js';
import type { ManagedProcessSnapshot, ProcessLogEvent } from '../../core/types.js';
import { isAllowedLocalHostHeader, isAllowedLocalOrigin } from '../localAccess.js';

function isAllowedWebSocketRequest(request: IncomingMessage): boolean {
  const origin = request.headers.origin;
  const host = request.headers.host;
  const secFetchSite = request.headers['sec-fetch-site'];

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
