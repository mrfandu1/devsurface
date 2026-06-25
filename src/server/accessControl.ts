import type { IncomingMessage } from 'node:http';
import type { Context, Next } from 'hono';
import { isAllowedLocalHostHeader } from './localAccess.js';
import { getListenHost, isAllowedClientConnection } from './listenConfig.js';

export function remoteAddressFromRequest(request: IncomingMessage | undefined): string | undefined {
  return request?.socket?.remoteAddress;
}

export function createRemoteAccessMiddleware() {
  return async (context: Context, next: Next) => {
    const env = context.env as { incoming?: IncomingMessage } | undefined;
    const remoteAddress = remoteAddressFromRequest(env?.incoming);
    if (!isAllowedClientConnection(remoteAddress, getListenHost())) {
      return context.json({ error: 'Remote client rejected.' }, 403);
    }
    await next();
  };
}

export function createApiAccessMiddleware() {
  return async (context: Context, next: Next) => {
    const host = context.req.header('host') ?? new URL(context.req.url).host;
    if (!isAllowedLocalHostHeader(host)) {
      return context.json({ error: 'Non-local host rejected.' }, 403);
    }

    const env = context.env as { incoming?: IncomingMessage } | undefined;
    const remoteAddress = remoteAddressFromRequest(env?.incoming);
    if (!isAllowedClientConnection(remoteAddress, getListenHost())) {
      return context.json({ error: 'Remote client rejected.' }, 403);
    }

    await next();
  };
}
