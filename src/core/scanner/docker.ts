import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import spawn from 'cross-spawn';
import { parse as parseYaml } from 'yaml';
import { resolveExecutableOutsideRoot } from '../process/executable.js';
import type { DockerInfo, DockerServiceInfo } from '../types.js';

const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function getComposeFiles(root: string): Promise<string[]> {
  const checks = await Promise.all(
    COMPOSE_FILES.map(async (file) => {
      const filePath = path.join(root, file);
      return (await fileExists(filePath)) ? filePath : null;
    })
  );

  return checks.filter((filePath): filePath is string => filePath !== null);
}

async function extractServices(composePath: string): Promise<string[]> {
  try {
    const content = await fs.readFile(composePath, 'utf8');
    const parsed = parseYaml(content) as unknown;
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'services' in parsed &&
      typeof parsed.services === 'object' &&
      parsed.services !== null
    ) {
      return Object.keys(parsed.services);
    }
  } catch {
    return [];
  }

  return [];
}

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function dockerCommandCwd(root: string): string {
  const candidates = [os.homedir(), os.tmpdir(), path.parse(path.resolve(root)).root];
  return candidates.find((candidate) => !isWithinRoot(root, candidate)) ?? os.homedir();
}

async function runDockerCommand(
  root: string,
  args: string[],
  timeoutMs = 2500
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const dockerExecutable = await resolveExecutableOutsideRoot(root, 'docker');
  if (dockerExecutable === null) {
    return { code: null, stdout: '', stderr: '' };
  }

  return await new Promise((resolve) => {
    const child = spawn(dockerExecutable, args, {
      cwd: dockerCommandCwd(root),
      windowsHide: true
    });
    let settled = false;
    let stdout = '';
    let stderr = '';

    const timeout = setTimeout(() => {
      settled = true;
      child.kill();
      resolve({ code: null, stdout, stderr });
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    child.on('error', () => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        resolve({ code: null, stdout, stderr });
      }
    });

    child.on('close', (code) => {
      clearTimeout(timeout);
      if (!settled) {
        settled = true;
        resolve({ code, stdout, stderr });
      }
    });
  });
}

export async function isDockerRunning(root: string): Promise<boolean> {
  const result = await runDockerCommand(root, ['info']);
  return result.code === 0;
}

function parseComposePs(output: string): Map<string, DockerServiceInfo> {
  const statuses = new Map<string, DockerServiceInfo>();
  const compactOutput = output.trim();
  if (!compactOutput) {
    return statuses;
  }

  try {
    const parsed = JSON.parse(compactOutput) as unknown;
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    for (const row of rows) {
      addComposeStatusRow(statuses, row);
    }
    return statuses;
  } catch {
    // Older Docker Compose builds can write one JSON object per line.
  }

  const rows = compactOutput
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const row of rows) {
    try {
      const parsed = JSON.parse(row) as {
        Service?: unknown;
        State?: unknown;
        ID?: unknown;
      };
      addComposeStatusRow(statuses, parsed);
    } catch {
      return statuses;
    }
  }

  return statuses;
}

function addComposeStatusRow(statuses: Map<string, DockerServiceInfo>, row: unknown): void {
  if (typeof row !== 'object' || row === null) {
    return;
  }

  const record = row as {
    Service?: unknown;
    State?: unknown;
    ID?: unknown;
  };
  if (typeof record.Service !== 'string') {
    return;
  }

  const state = typeof record.State === 'string' ? record.State.toLowerCase() : '';
  statuses.set(record.Service, {
    name: record.Service,
    status: state === 'running' ? 'running' : state ? 'stopped' : 'unknown',
    containerId: typeof record.ID === 'string' && record.ID.length > 0 ? record.ID : null
  });
}

async function getServiceStatuses(
  root: string,
  serviceNames: string[],
  dockerRunning: boolean
): Promise<DockerServiceInfo[]> {
  if (serviceNames.length === 0) {
    return [];
  }

  if (!dockerRunning) {
    return serviceNames.map((service) => ({
      name: service,
      status: 'unknown',
      containerId: null
    }));
  }

  const ps = await runDockerCommand(root, [
    'compose',
    '--project-directory',
    root,
    'ps',
    '--format',
    'json'
  ]);
  const statuses = ps.code === 0 ? parseComposePs(ps.stdout) : new Map<string, DockerServiceInfo>();

  return serviceNames.map(
    (service) =>
      statuses.get(service) ?? {
        name: service,
        status: 'stopped',
        containerId: null
      }
  );
}

export async function detectDocker(root: string): Promise<DockerInfo | null> {
  const composeFiles = await getComposeFiles(root);
  if (composeFiles.length === 0) {
    return null;
  }

  const serviceLists = await Promise.all(
    composeFiles.map((composeFile) => extractServices(composeFile))
  );
  const serviceNames = Array.from(new Set(serviceLists.flat()));
  const dockerRunning = await isDockerRunning(root);

  return {
    composeFiles,
    services: await getServiceStatuses(root, serviceNames, dockerRunning),
    dockerRunning
  };
}
