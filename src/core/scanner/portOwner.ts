/**
 * Identify which local process is listening on a busy port, so the dashboard
 * can say "in use by node.exe (PID 1234)" instead of just "in use".
 *
 * Windows uses `netstat -ano` plus `tasklist` for the process name; other
 * platforms use `lsof`. Lookups are best-effort: any failure, timeout, or
 * unparseable output simply yields no owner (scanner rule: never throw).
 */

import spawn from 'cross-spawn';
import type { PortOwner } from '../types.js';

const LOOKUP_TIMEOUT_MS = 3000;

/** Run a command and capture stdout, resolving null on any failure. */
function captureCommand(command: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: string | null): void => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };

    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'ignore'],
      windowsHide: true
    });
    const chunks: Buffer[] = [];
    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, LOOKUP_TIMEOUT_MS);

    child.stdout?.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    child.on('error', () => {
      clearTimeout(timer);
      finish(null);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      finish(code === 0 ? Buffer.concat(chunks).toString('utf8') : null);
    });
  });
}

/**
 * Parse `netstat -ano -p tcp` output into a port → PID map for listening
 * sockets. Exported for tests.
 */
export function parseNetstatListeners(output: string): Map<number, number> {
  const owners = new Map<number, number>();
  for (const line of output.split(/\r?\n/)) {
    const columns = line.trim().split(/\s+/);
    // TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING  1234
    if (columns.length < 5 || columns[0].toUpperCase() !== 'TCP') {
      continue;
    }
    if (columns[3].toUpperCase() !== 'LISTENING') {
      continue;
    }
    const portMatch = /[.:](\d+)$/.exec(columns[1]);
    const pid = Number(columns[4]);
    if (portMatch === null || !Number.isInteger(pid) || pid <= 0) {
      continue;
    }
    const port = Number(portMatch[1]);
    if (!owners.has(port)) {
      owners.set(port, pid);
    }
  }
  return owners;
}

/** Parse `tasklist /FO CSV /NH` output into a process name. Exported for tests. */
export function parseTasklistName(output: string): string | null {
  const line = output.split(/\r?\n/).find((candidate) => candidate.trim().startsWith('"'));
  if (line === undefined) {
    return null;
  }
  const match = /^"([^"]+)"/.exec(line.trim());
  return match === null ? null : match[1];
}

/**
 * Parse `lsof -nP -iTCP:<port> -sTCP:LISTEN -FpcL` field output into an owner.
 * Exported for tests.
 */
export function parseLsofOwner(output: string): PortOwner | null {
  let pid: number | null = null;
  let name: string | null = null;
  for (const line of output.split(/\r?\n/)) {
    if (line.startsWith('p') && pid === null) {
      const value = Number(line.slice(1));
      if (Number.isInteger(value) && value > 0) {
        pid = value;
      }
    } else if (line.startsWith('c') && name === null) {
      name = line.slice(1) || null;
    }
    if (pid !== null && name !== null) {
      break;
    }
  }
  return pid === null ? null : { pid, name };
}

async function findOwnersWindows(ports: number[]): Promise<Map<number, PortOwner>> {
  const owners = new Map<number, PortOwner>();
  const netstat = await captureCommand('netstat', ['-ano', '-p', 'tcp']);
  if (netstat === null) {
    return owners;
  }
  const listeners = parseNetstatListeners(netstat);

  const nameCache = new Map<number, string | null>();
  for (const port of ports) {
    const pid = listeners.get(port);
    if (pid === undefined) {
      continue;
    }
    if (!nameCache.has(pid)) {
      const tasklist = await captureCommand('tasklist', [
        '/FI',
        `PID eq ${pid}`,
        '/FO',
        'CSV',
        '/NH'
      ]);
      nameCache.set(pid, tasklist === null ? null : parseTasklistName(tasklist));
    }
    owners.set(port, { pid, name: nameCache.get(pid) ?? null });
  }
  return owners;
}

async function findOwnersUnix(ports: number[]): Promise<Map<number, PortOwner>> {
  const owners = new Map<number, PortOwner>();
  for (const port of ports) {
    const output = await captureCommand('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-FpcL']);
    if (output === null) {
      continue;
    }
    const owner = parseLsofOwner(output);
    if (owner !== null) {
      owners.set(port, owner);
    }
  }
  return owners;
}

/**
 * Best-effort lookup of the processes listening on the given ports. Returns a
 * possibly-empty map; never throws.
 */
export async function findPortOwners(ports: number[]): Promise<Map<number, PortOwner>> {
  const unique = Array.from(new Set(ports)).slice(0, 16);
  if (unique.length === 0) {
    return new Map();
  }
  try {
    return process.platform === 'win32'
      ? await findOwnersWindows(unique)
      : await findOwnersUnix(unique);
  } catch {
    return new Map();
  }
}
