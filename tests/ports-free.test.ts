import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { freePort, isProtectedPid } from '../src/core/ports/free.js';

describe('isProtectedPid', () => {
  it('protects system pids and the DevSurface process itself', () => {
    expect(isProtectedPid(0)).toBe(true);
    expect(isProtectedPid(4)).toBe(true);
    expect(isProtectedPid(process.pid)).toBe(true);
    expect(isProtectedPid(process.ppid)).toBe(true);
    expect(isProtectedPid(Number.NaN)).toBe(true);
    expect(isProtectedPid(2.5)).toBe(true);
  });

  it('allows ordinary pids', () => {
    expect(isProtectedPid(54321, 100, 101)).toBe(false);
  });
});

describe('freePort', () => {
  let server: net.Server | null = null;

  afterEach(async () => {
    if (server !== null) {
      await new Promise((resolve) => server?.close(resolve));
      server = null;
    }
  });

  it('rejects invalid ports', async () => {
    expect((await freePort(0)).error).toContain('Invalid');
    expect((await freePort(70000)).error).toContain('Invalid');
  });

  it('reports when the port is already free', async () => {
    // Grab a free port number, then release it before calling freePort.
    const probe = net.createServer();
    const port = await new Promise<number>((resolve) => {
      probe.listen(0, '127.0.0.1', () => {
        const address = probe.address();
        resolve(typeof address === 'object' && address !== null ? address.port : 0);
      });
    });
    await new Promise((resolve) => probe.close(resolve));

    const result = await freePort(port);
    expect(result.freed).toBe(false);
    expect(result.error).toContain('already free');
  });

  it('refuses to kill the process that runs DevSurface itself', async () => {
    server = net.createServer();
    const port = await new Promise<number>((resolve) => {
      server?.listen(0, '127.0.0.1', () => {
        const address = server?.address();
        resolve(typeof address === 'object' && address !== null ? address.port : 0);
      });
    });

    const result = await freePort(port);
    expect(result.freed).toBe(false);
    // The port owner is this test process — the guardrail must refuse,
    // whether or not the platform identified the owner at all.
    if (result.pid !== null) {
      expect(result.pid).toBe(process.pid);
      expect(result.error).toContain('protected');
    } else {
      expect(result.error).not.toBeNull();
    }
    // Either way the server must still be alive.
    expect(server.listening).toBe(true);
  });
});
