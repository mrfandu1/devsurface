import { describe, expect, it } from 'vitest';
import {
  appUrlForPort,
  candidatePortsForScript,
  chooseAutoOpenPort,
  inferPortsFromCommand,
  scriptLooksLikeServer
} from '../src/web/src/autoOpen.js';
import type { ScanResult } from '../src/web/src/types.js';

function scanWithPorts(scripts: Record<string, string>, ports: ScanResult['ports']): ScanResult {
  return {
    root: '/workspace/app',
    projectName: 'app',
    packageJson: null,
    packageManager: 'npm',
    language: {
      primary: 'node',
      detected: ['node'],
      files: []
    },
    scripts,
    env: null,
    docker: null,
    git: null,
    framework: null,
    presets: [],
    presetCommands: {},
    presetGroups: {},
    ports,
    readme: { exists: true },
    license: { exists: true },
    config: null
  };
}

describe('dashboard auto-open helpers', () => {
  it('infers common local app ports from package scripts', () => {
    expect(inferPortsFromCommand('vite --host 127.0.0.1 --port 5173')).toEqual([5173]);
    expect(inferPortsFromCommand('next dev -p 3001')).toEqual([3001]);
    expect(inferPortsFromCommand('set PORT=4111 && node server.js')).toEqual([4111]);
    expect(inferPortsFromCommand('$env:PORT = 5222; npm run serve')).toEqual([5222]);
  });

  it('only treats server-like scripts as auto-open candidates', () => {
    expect(scriptLooksLikeServer('dev', 'vite --port 5173')).toBe(true);
    expect(scriptLooksLikeServer('preview', 'vite preview')).toBe(true);
    expect(scriptLooksLikeServer('test', 'vitest run')).toBe(false);
    expect(scriptLooksLikeServer('build', 'vite build')).toBe(false);
  });

  it('prioritizes the script port before other detected project ports', () => {
    const project = scanWithPorts(
      {
        'dev:web': 'vite --host 127.0.0.1 --port 5173'
      },
      [
        { port: 3000, inUse: false },
        { port: 5173, inUse: false }
      ]
    );

    expect(candidatePortsForScript(project, 'dev:web')).toEqual([5173, 3000]);
  });

  it('chooses the candidate port once it is listening', () => {
    expect(
      chooseAutoOpenPort([{ port: 5173, inUse: false }], [{ port: 5173, inUse: true }], [5173])
    ).toBe(5173);
  });

  it('falls back to a newly occupied detected port when the command has no explicit port', () => {
    expect(
      chooseAutoOpenPort(
        [
          { port: 3000, inUse: false },
          { port: 5173, inUse: false }
        ],
        [
          { port: 3000, inUse: false },
          { port: 5173, inUse: true }
        ],
        []
      )
    ).toBe(5173);
  });

  it('normalizes opened app URLs to 127.0.0.1', () => {
    expect(appUrlForPort(5173)).toBe('http://127.0.0.1:5173');
  });
});
