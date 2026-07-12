/**
 * "Is my computer ready?" — a friendly readiness report for the machine
 * DevSurface is running on. Checks the tools a typical project needs (Node,
 * a package manager, git, Docker) and reports OS facts in plain English.
 * Version probes run locally with a short timeout; nothing leaves the machine.
 */

import os from 'node:os';
import spawn from 'cross-spawn';
import type { ScanResult } from '../types.js';
import type { ChildProcess } from 'node:child_process';

export interface SystemCheckItem {
  id: string;
  /** Friendly name, e.g. "Node.js". */
  label: string;
  /** true = ready, false = missing/problem, null = not needed for this project. */
  ok: boolean | null;
  /** What we found, e.g. "v20.11.0" or "not installed". */
  detail: string;
  /** Plain-English next step when not ok. */
  hint?: string;
}

export interface SystemReport {
  /** e.g. "Windows 11", "macOS", "Linux". */
  osName: string;
  arch: string;
  cpuCount: number;
  totalMemoryGb: number;
  freeMemoryGb: number;
  hostname: string;
  checks: SystemCheckItem[];
  /** One friendly verdict sentence. */
  verdict: string;
}

const PROBE_TIMEOUT_MS = 3_000;

/** First line of `command --version`, or null when the tool is unavailable. */
function probeVersion(command: string, args: string[] = ['--version']): Promise<string | null> {
  return new Promise((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
    } catch {
      resolve(null);
      return;
    }
    let stdout = '';
    let settled = false;
    const finish = (value: string | null): void => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(value);
      }
    };
    const timer = setTimeout(() => {
      child.kill();
      finish(null);
    }, PROBE_TIMEOUT_MS);
    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.on('error', () => finish(null));
    child.on('close', (code) => {
      const firstLine = stdout.trim().split(/\r?\n/)[0] ?? '';
      finish(code === 0 && firstLine.length > 0 ? firstLine : null);
    });
  });
}

function friendlyOsName(): string {
  const platform = os.platform();
  if (platform === 'win32') {
    return os.release().startsWith('10.0.2') ? 'Windows 11' : 'Windows';
  }
  if (platform === 'darwin') {
    return 'macOS';
  }
  if (platform === 'linux') {
    return 'Linux';
  }
  return platform;
}

function toGb(bytes: number): number {
  return Math.round((bytes / 1024 ** 3) * 10) / 10;
}

/**
 * Build the machine readiness report. When a scan is provided, checks that a
 * project does not need are marked "not needed" instead of failing.
 */
export async function checkSystem(scan?: ScanResult): Promise<SystemReport> {
  const checks: SystemCheckItem[] = [];
  const needsDocker = scan === undefined || (scan.docker?.composeFiles.length ?? 0) > 0;
  const isNodeProject = scan === undefined || scan.language.detected.includes('node');

  checks.push({
    id: 'node',
    label: 'Node.js',
    ok: true,
    detail: process.version
  });

  const managers: Array<{ id: string; label: string; command: string }> = [
    { id: 'npm', label: 'npm', command: 'npm' },
    { id: 'pnpm', label: 'pnpm', command: 'pnpm' },
    { id: 'yarn', label: 'yarn', command: 'yarn' },
    { id: 'bun', label: 'bun', command: 'bun' }
  ];
  const wanted = scan?.packageManager ?? 'npm';
  const relevantManagers = managers.filter(
    (manager) => manager.id === wanted || (manager.id === 'npm' && isNodeProject)
  );

  const [managerVersions, gitVersion, dockerVersion] = await Promise.all([
    Promise.all(relevantManagers.map((manager) => probeVersion(manager.command))),
    probeVersion('git'),
    probeVersion('docker')
  ]);

  relevantManagers.forEach((manager, index) => {
    const version = managerVersions[index];
    checks.push({
      id: manager.id,
      label: manager.label,
      ok: version !== null,
      detail: version ?? 'not installed',
      hint:
        version !== null
          ? undefined
          : manager.id === 'npm'
            ? 'npm normally ships with Node.js — reinstalling Node from nodejs.org restores it.'
            : `This project uses ${manager.label}. Install it with "npm install -g ${manager.command}".`
    });
  });

  checks.push({
    id: 'git',
    label: 'Git',
    ok: gitVersion !== null,
    detail: gitVersion ?? 'not installed',
    hint:
      gitVersion === null
        ? 'Install Git from git-scm.com to download and track code changes.'
        : undefined
  });

  checks.push({
    id: 'docker',
    label: 'Docker',
    ok: needsDocker ? dockerVersion !== null : null,
    detail: dockerVersion ?? (needsDocker ? 'not installed' : 'not installed (not needed here)'),
    hint:
      needsDocker && dockerVersion === null
        ? 'This project uses Docker services. Install Docker Desktop from docker.com.'
        : undefined
  });

  const totalMemoryGb = toGb(os.totalmem());
  const freeMemoryGb = toGb(os.freemem());
  checks.push({
    id: 'memory',
    label: 'Memory (RAM)',
    ok: totalMemoryGb >= 8 ? true : totalMemoryGb >= 4 ? null : false,
    detail: `${totalMemoryGb} GB total, ${freeMemoryGb} GB free right now`,
    hint:
      totalMemoryGb < 4
        ? 'Under 4 GB of RAM makes modern dev tools painful; close everything you can while building.'
        : undefined
  });

  const problems = checks.filter((check) => check.ok === false);
  const verdict =
    problems.length === 0
      ? 'Your computer is ready for development on this project. ✅'
      : `Almost there — ${problems.length} thing${problems.length === 1 ? ' needs' : 's need'} attention: ${problems
          .map((problem) => problem.label)
          .join(', ')}.`;

  return {
    osName: friendlyOsName(),
    arch: os.arch(),
    cpuCount: os.cpus().length,
    totalMemoryGb,
    freeMemoryGb,
    hostname: os.hostname(),
    checks,
    verdict
  };
}
