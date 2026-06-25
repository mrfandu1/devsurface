import { describe, expect, it } from 'vitest';
import { escapeWorkflowProperty, escapeWorkflowValue } from '../src/action/runtime.js';
import { isDangerousCommand } from '../src/core/security/dangerousCommand.js';
import { safeDisplayText } from '../src/core/security/text.js';
import { isSafeHttpUrl } from '../src/core/security/url.js';
import { createMutationToken, hasValidMutationToken } from '../src/server/mutationToken.js';
import {
  isAllowedClientConnection,
  isAllowedRemoteAddress,
  isLoopbackRemoteAddress,
  isPrivateRemoteAddress,
  resolveHost,
  resetListenHost,
  setListenHost
} from '../src/server/listenConfig.js';
import { isAllowedTerminalCommand } from '../src/server/terminal.js';

describe('security helpers', () => {
  it('accepts only http and https docs URLs', () => {
    expect(isSafeHttpUrl('https://docs.example.com')).toBe(true);
    expect(isSafeHttpUrl('http://localhost:3000/docs')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
  });

  it('strips terminal escape sequences from display text', () => {
    const ESC = '\u001B';
    expect(safeDisplayText(`${ESC}[31mhello${ESC}[0m`)).toBe('hello');
    expect(safeDisplayText(`${ESC}]8;;https://evil.example${ESC}\\link${ESC}]8;;${ESC}\\`)).toBe(
      'link'
    );
  });

  it('escapes GitHub workflow annotation injection characters', () => {
    expect(escapeWorkflowValue('line1\nline2::warning title=%25')).toBe(
      'line1%0Aline2::warning title=%2525'
    );
    expect(escapeWorkflowProperty('src/app.ts:42,title')).toBe('src/app.ts%3A42%2Ctitle');
  });

  it('uses one shared dangerous-command heuristic', () => {
    expect(isDangerousCommand('docker volume rm data')).toBe(true);
    expect(isDangerousCommand('git clean -fdx')).toBe(true);
    expect(isDangerousCommand('npm run dev')).toBe(false);
    expect(isDangerousCommand('vite build')).toBe(false);
  });

  it('validates mutation tokens with a constant-time comparison', () => {
    const token = createMutationToken();
    expect(hasValidMutationToken(token, token)).toBe(true);
    expect(hasValidMutationToken(`${token}x`, token)).toBe(false);
    expect(hasValidMutationToken('', token)).toBe(false);
    expect(hasValidMutationToken(null, token)).toBe(false);
  });

  it('accepts safe terminal basenames only', () => {
    expect(isAllowedTerminalCommand('gnome-terminal')).toBe(true);
    expect(isAllowedTerminalCommand('x-terminal-emulator')).toBe(true);
    expect(isAllowedTerminalCommand('../../bin/sh')).toBe(false);
    expect(isAllowedTerminalCommand('evil;rm')).toBe(false);
    expect(isAllowedTerminalCommand('my term')).toBe(false);
  });

  it('allows loopback clients when bound to localhost', () => {
    setListenHost('127.0.0.1');
    expect(isLoopbackRemoteAddress('127.0.0.1')).toBe(true);
    expect(isLoopbackRemoteAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isAllowedRemoteAddress('8.8.8.8', '127.0.0.1')).toBe(false);
    expect(isAllowedClientConnection('127.0.0.1', '127.0.0.1')).toBe(true);
    resetListenHost();
  });

  it('allows only private-network clients when bound to all interfaces', () => {
    setListenHost('0.0.0.0');
    expect(isPrivateRemoteAddress('172.17.0.1')).toBe(true);
    expect(isAllowedRemoteAddress('203.0.113.10', '0.0.0.0')).toBe(false);
    expect(isAllowedRemoteAddress('10.0.0.5', '0.0.0.0')).toBe(true);
    resetListenHost();
  });

  it('rejects all-interface binding outside the container runtime', () => {
    const previousHost = process.env.DEVSURFACE_HOST;
    const previousContainer = process.env.DEVSURFACE_CONTAINER;
    process.env.DEVSURFACE_HOST = '0.0.0.0';
    delete process.env.DEVSURFACE_CONTAINER;

    try {
      expect(() => resolveHost()).toThrow('All-interface');
    } finally {
      if (previousHost === undefined) {
        delete process.env.DEVSURFACE_HOST;
      } else {
        process.env.DEVSURFACE_HOST = previousHost;
      }
      if (previousContainer === undefined) {
        delete process.env.DEVSURFACE_CONTAINER;
      } else {
        process.env.DEVSURFACE_CONTAINER = previousContainer;
      }
    }
  });

  it('rejects explicit non-loopback interface binding', () => {
    const previousHost = process.env.DEVSURFACE_HOST;
    const previousContainer = process.env.DEVSURFACE_CONTAINER;
    process.env.DEVSURFACE_HOST = '192.168.1.20';
    delete process.env.DEVSURFACE_CONTAINER;

    try {
      expect(() => resolveHost()).toThrow('loopback');
    } finally {
      if (previousHost === undefined) {
        delete process.env.DEVSURFACE_HOST;
      } else {
        process.env.DEVSURFACE_HOST = previousHost;
      }
      if (previousContainer === undefined) {
        delete process.env.DEVSURFACE_CONTAINER;
      } else {
        process.env.DEVSURFACE_CONTAINER = previousContainer;
      }
    }
  });

  it('keeps non-loopback interface binding rejected inside containers', () => {
    const previousHost = process.env.DEVSURFACE_HOST;
    const previousContainer = process.env.DEVSURFACE_CONTAINER;
    process.env.DEVSURFACE_HOST = '192.168.1.20';
    process.env.DEVSURFACE_CONTAINER = 'true';

    try {
      expect(() => resolveHost()).toThrow('loopback');
    } finally {
      if (previousHost === undefined) {
        delete process.env.DEVSURFACE_HOST;
      } else {
        process.env.DEVSURFACE_HOST = previousHost;
      }
      if (previousContainer === undefined) {
        delete process.env.DEVSURFACE_CONTAINER;
      } else {
        process.env.DEVSURFACE_CONTAINER = previousContainer;
      }
    }
  });

  it('allows all-interface binding inside the container runtime', () => {
    const previousHost = process.env.DEVSURFACE_HOST;
    const previousContainer = process.env.DEVSURFACE_CONTAINER;
    process.env.DEVSURFACE_HOST = '0.0.0.0';
    process.env.DEVSURFACE_CONTAINER = 'true';

    try {
      expect(resolveHost()).toBe('0.0.0.0');
    } finally {
      if (previousHost === undefined) {
        delete process.env.DEVSURFACE_HOST;
      } else {
        process.env.DEVSURFACE_HOST = previousHost;
      }
      if (previousContainer === undefined) {
        delete process.env.DEVSURFACE_CONTAINER;
      } else {
        process.env.DEVSURFACE_CONTAINER = previousContainer;
      }
    }
  });
});
