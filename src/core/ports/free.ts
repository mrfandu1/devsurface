import spawn from 'cross-spawn';
import { findPortOwners } from '../scanner/portOwner.js';
import { probePort } from '../scanner/ports.js';

export interface FreePortResult {
  freed: boolean;
  port: number;
  pid: number | null;
  name: string | null;
  error: string | null;
}

/**
 * PIDs DevSurface must never terminate: system/idle processes and the
 * DevSurface server itself (killing it would take the dashboard down mid-request).
 */
export function isProtectedPid(
  pid: number,
  selfPid = process.pid,
  parentPid = process.ppid
): boolean {
  return !Number.isInteger(pid) || pid <= 4 || pid === selfPid || pid === parentPid;
}

function killPid(pid: number): boolean {
  if (process.platform === 'win32') {
    const result = spawn.sync('taskkill', ['/pid', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true
    });
    return result.error === undefined && result.status === 0;
  }
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Terminate the process listening on `port` so a dev server can start there.
 * Only ever runs from an explicit user action behind a confirmation prompt.
 */
export async function freePort(port: number): Promise<FreePortResult> {
  const base: FreePortResult = { freed: false, port, pid: null, name: null, error: null };

  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return { ...base, error: 'Invalid port number.' };
  }

  if (!(await probePort(port)).inUse) {
    return { ...base, error: `Port ${port} is already free.` };
  }

  const owner = (await findPortOwners([port])).get(port) ?? null;
  if (owner === null) {
    return { ...base, error: `Could not identify the process using port ${port}.` };
  }
  const result = { ...base, pid: owner.pid, name: owner.name };

  if (isProtectedPid(owner.pid)) {
    return { ...result, error: `Refusing to stop protected process PID ${owner.pid}.` };
  }

  if (!killPid(owner.pid)) {
    return {
      ...result,
      error: `Could not stop PID ${owner.pid}. It may require elevated permissions.`
    };
  }

  // Give the OS a moment to release the socket, then verify.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await delay(250);
    if (!(await probePort(port)).inUse) {
      return { ...result, freed: true };
    }
  }

  return {
    ...result,
    error: `Sent a stop signal to PID ${owner.pid}, but port ${port} is still in use.`
  };
}
