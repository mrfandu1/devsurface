import net from 'node:net';
import type { FrameworkInfo, PortProbe } from '../types.js';

export const DEFAULT_PORTS = [3000, 5173];
export const MAX_PORT_PROBES = 64;
export const PORT_PROBE_CONCURRENCY = 16;

function uniquePorts(ports: number[]): number[] {
  return Array.from(
    new Set(ports.filter((port) => Number.isInteger(port) && port > 0 && port < 65536))
  );
}

export function inferPortsFromScripts(scripts: Record<string, string>): number[] {
  const ports: number[] = [];

  for (const command of Object.values(scripts)) {
    const patterns = [
      /(?:--port|-p)\s+(\d{2,5})/g,
      /\bPORT=(\d{2,5})\b/g,
      /localhost:(\d{2,5})/g,
      /127\.0\.0\.1:(\d{2,5})/g
    ];

    for (const pattern of patterns) {
      for (const match of command.matchAll(pattern)) {
        ports.push(Number(match[1]));
      }
    }
  }

  return uniquePorts(ports);
}

export function defaultPortsForFramework(framework: FrameworkInfo | null): number[] {
  if (framework === null) {
    return [];
  }

  const ports: number[] = [];
  if (framework.detected.includes('Next.js') || framework.detected.includes('Express')) {
    ports.push(3000);
  }

  if (framework.detected.includes('Vite')) {
    ports.push(5173);
  }

  if (framework.detected.includes('Prisma')) {
    ports.push(5555);
  }

  return uniquePorts(ports);
}

export async function probePort(port: number): Promise<PortProbe> {
  return await new Promise((resolve) => {
    const server = net.createServer();

    server.once('error', () => {
      resolve({ port, inUse: true });
    });

    server.once('listening', () => {
      server.close(() => {
        resolve({ port, inUse: false });
      });
    });

    server.listen(port, '127.0.0.1');
  });
}

export async function detectPorts(ports: number[]): Promise<PortProbe[] | null> {
  const normalized = uniquePorts(ports).slice(0, MAX_PORT_PROBES);
  if (normalized.length === 0) {
    return null;
  }

  const results: PortProbe[] = [];
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < normalized.length) {
      const port = normalized[nextIndex];
      nextIndex += 1;
      results.push(await probePort(port));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(PORT_PROBE_CONCURRENCY, normalized.length) }, () => worker())
  );

  return results.sort(
    (left, right) => normalized.indexOf(left.port) - normalized.indexOf(right.port)
  );
}
