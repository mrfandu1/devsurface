import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { LOG_MESSAGE_LIMIT, ProcessManager } from '../src/core/process/manager.js';
import {
  containsShellMetacharacters,
  getPackageInstallCommand,
  getPackageRunCommand,
  isDangerousCommand,
  resolveConfiguredCommand,
  runPackageScriptToTerminal,
  splitCommandLine
} from '../src/core/process/runner.js';
import { makeTempProject, removeTempProject } from './testUtils.js';

describe('process runner', () => {
  it('builds package run commands for detected package managers', () => {
    expect(getPackageRunCommand('pnpm', 'dev')).toEqual({
      command: 'pnpm',
      args: ['run', 'dev'],
      displayCommand: 'pnpm run dev'
    });
  });

  it('builds package install commands for detected package managers', () => {
    expect(getPackageInstallCommand('npm')).toEqual({
      command: 'npm',
      args: ['ci'],
      displayCommand: 'npm ci'
    });
    expect(getPackageInstallCommand('pnpm')).toEqual({
      command: 'pnpm',
      args: ['install', '--frozen-lockfile'],
      displayCommand: 'pnpm install --frozen-lockfile'
    });
    expect(getPackageInstallCommand('bun')).toEqual({
      command: 'bun',
      args: ['install'],
      displayCommand: 'bun install'
    });
  });

  it('detects dangerous commands for UI warning treatment', () => {
    expect(isDangerousCommand('docker volume rm data')).toBe(true);
    expect(isDangerousCommand('git clean -fdx')).toBe(true);
    expect(isDangerousCommand('npm run dev')).toBe(false);
  });

  it('parses configured commands without shell metacharacters', () => {
    expect(splitCommandLine(`"${process.execPath}" -e "console.log('ok')"`)).toEqual([
      process.execPath,
      '-e',
      "console.log('ok')"
    ]);
    expect(containsShellMetacharacters('npm run dev')).toBe(false);
    expect(containsShellMetacharacters('node -e "x"; rm -rf /')).toBe(true);
  });

  it('resolves configured commands to executable argv pairs', async () => {
    const root = await makeTempProject();
    try {
      const resolved = await resolveConfiguredCommand(
        root,
        `"${process.execPath}" -e "console.log('configured-ok')"`
      );
      expect(resolved).not.toBeNull();
      expect(resolved?.args).toEqual(['-e', "console.log('configured-ok')"]);
      expect(path.basename(resolved?.command ?? '')).toBe(path.basename(process.execPath));
    } finally {
      await removeTempProject(root);
    }
  });

  it('bounds individual process log messages', async () => {
    const manager = new ProcessManager();
    const logs: string[] = [];
    manager.on('log', (event: { message: string }) => {
      logs.push(event.message);
    });

    manager.start({
      cwd: process.cwd(),
      script: 'large-log',
      command: process.execPath,
      args: ['-e', `process.stdout.write('${'x'.repeat(LOG_MESSAGE_LIMIT + 100)}')`],
      displayCommand: 'node large-log'
    });

    await new Promise<void>((resolve) => {
      manager.on('process', (event: { script: string; status: string }) => {
        if (event.script === 'large-log' && event.status !== 'running') {
          resolve();
        }
      });
    });

    const output = logs.find((message) => message.includes('x'));
    expect(output?.length).toBeLessThanOrEqual(LOG_MESSAGE_LIMIT);
  });

  it('tracks process logs and exit state', async () => {
    const manager = new ProcessManager();
    const logs: string[] = [];
    manager.on('log', (event: { message: string }) => {
      logs.push(event.message);
    });

    const finalStatePromise = new Promise<string>((resolve) => {
      manager.on('process', (event: { status: string }) => {
        if (event.status !== 'running') {
          resolve(event.status);
        }
      });
    });

    manager.start({
      cwd: process.cwd(),
      script: 'node-probe',
      command: process.execPath,
      args: ['-e', 'console.log("devsurface-ok")'],
      displayCommand: 'node -e console.log'
    });

    const finalState = await finalStatePromise;

    expect(finalState).toBe('exited');
    expect(logs.join('')).toContain('devsurface-ok');
    expect(
      manager
        .listLogs()
        .map((event) => event.message)
        .join('')
    ).toContain('devsurface-ok');
  });

  it('stops a running managed process', async () => {
    const manager = new ProcessManager();
    const processInfo = manager.start({
      cwd: process.cwd(),
      script: 'long-running',
      command: process.execPath,
      args: ['-e', 'setTimeout(() => undefined, 30000)'],
      displayCommand: 'node long-running'
    });

    expect(manager.stop(processInfo.pid)).toBe(true);
    expect(manager.list()[0]).toMatchObject({
      pid: processInfo.pid,
      status: 'stopped'
    });
  });

  if (process.platform === 'win32') {
    it('does not execute a repo-local package-manager shim', async () => {
      const root = await makeTempProject();
      const marker = path.join(root, 'npm-ran.txt');
      const oldPath = process.env.PATH;
      try {
        await fs.writeFile(
          path.join(root, 'npm.cmd'),
          `@echo off\r\necho ran>>"${marker}"\r\nexit /b 0\r\n`,
          'utf8'
        );
        process.env.PATH = root;

        const exitCode = await runPackageScriptToTerminal({
          cwd: root,
          packageManager: 'npm',
          script: 'dev'
        });

        expect(exitCode).toBe(1);
        await expect(fs.access(marker)).rejects.toBeTruthy();
      } finally {
        process.env.PATH = oldPath;
        await removeTempProject(root);
      }
    });
  }
});
