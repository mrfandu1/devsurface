import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import spawn from 'cross-spawn';
import { parse as parseYaml } from 'yaml';
import { resolveExecutableOutsideRoot } from '../process/executable.js';
import type {
  DockerDaemonStatus,
  DockerInfo,
  DockerServiceInfo,
  DockerServiceStatus
} from '../types.js';

const COMPOSE_FILES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'];
const COMMAND_OUTPUT_LIMIT = 200_000;
const ESC = String.fromCharCode(27);
const ANSI_CSI_SEQUENCE = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]`, 'g');

export interface DockerCommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  error: 'not-found' | 'timeout' | 'spawn' | null;
}

export interface DockerCommandOptions {
  timeoutMs?: number;
  outputLimit?: number;
}

export type DockerCommandRunner = (
  root: string,
  args: string[],
  options?: DockerCommandOptions
) => Promise<DockerCommandResult>;

export interface DockerActionResult {
  service: string;
  action: 'start' | 'stop';
  output: string;
}

export interface DockerLogsResult {
  service: string;
  logs: string;
}

export interface DockerController {
  inspect(): Promise<DockerInfo | null>;
  start(service: string): Promise<DockerActionResult>;
  stop(service: string): Promise<DockerActionResult>;
  logs(service: string): Promise<DockerLogsResult>;
}

export type DockerOperationErrorCode =
  | 'compose-not-found'
  | 'service-not-found'
  | 'docker-not-installed'
  | 'docker-not-running'
  | 'command-failed';

export class DockerOperationError extends Error {
  constructor(
    public readonly code: DockerOperationErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DockerOperationError';
  }
}

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function dockerCommandCwd(root: string): string {
  const candidates = [os.homedir(), os.tmpdir(), path.parse(path.resolve(root)).root];
  return candidates.find((candidate) => !isWithinRoot(root, candidate)) ?? os.homedir();
}

function appendBounded(current: string, chunk: string, limit: number): string {
  const combined = current + chunk;
  return combined.length <= limit ? combined : combined.slice(-limit);
}

export const runDockerCommand: DockerCommandRunner = async (root, args, options = {}) => {
  const dockerExecutable = await resolveExecutableOutsideRoot(root, 'docker');
  if (dockerExecutable === null) {
    return { code: null, stdout: '', stderr: '', error: 'not-found' };
  }

  const timeoutMs = options.timeoutMs ?? 5000;
  const outputLimit = options.outputLimit ?? COMMAND_OUTPUT_LIMIT;

  return await new Promise((resolve) => {
    const child = spawn(dockerExecutable, args, {
      cwd: dockerCommandCwd(root),
      windowsHide: true
    });
    let settled = false;
    let stdout = '';
    let stderr = '';

    const finish = (result: DockerCommandResult) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timeout);
      resolve(result);
    };

    const timeout = setTimeout(() => {
      child.kill();
      finish({ code: null, stdout, stderr, error: 'timeout' });
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = appendBounded(stdout, chunk.toString(), outputLimit);
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = appendBounded(stderr, chunk.toString(), outputLimit);
    });
    child.on('error', () => {
      finish({ code: null, stdout, stderr, error: 'spawn' });
    });
    child.on('close', (code) => {
      finish({ code, stdout, stderr, error: null });
    });
  });
};

async function findComposeFiles(root: string): Promise<string[]> {
  const resolvedRoot = await fs.realpath(root).catch(() => path.resolve(root));
  const matches: string[] = [];

  for (const file of COMPOSE_FILES) {
    const candidate = path.join(root, file);
    try {
      const [stat, realCandidate] = await Promise.all([fs.stat(candidate), fs.realpath(candidate)]);
      if (stat.isFile() && isWithinRoot(resolvedRoot, realCandidate)) {
        matches.push(realCandidate);
      }
    } catch {
      // Continue through the supported Compose filenames.
    }
  }

  return matches;
}

async function serviceNamesFromFiles(composeFiles: string[]): Promise<string[]> {
  const names = new Set<string>();

  for (const composeFile of composeFiles) {
    try {
      const parsed = parseYaml(await fs.readFile(composeFile, 'utf8')) as unknown;
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        !('services' in parsed) ||
        typeof parsed.services !== 'object' ||
        parsed.services === null ||
        Array.isArray(parsed.services)
      ) {
        continue;
      }

      for (const name of Object.keys(parsed.services)) {
        if (name.length > 0) {
          names.add(name);
        }
      }
    } catch {
      // Malformed files remain visible as Compose files, but expose no actions.
    }
  }

  return Array.from(names);
}

function composeArgs(root: string, composeFiles: string[], args: string[]): string[] {
  return [
    'compose',
    ...composeFiles.flatMap((composeFile) => ['-f', composeFile]),
    '--project-directory',
    root,
    ...args
  ];
}

function cleanMessage(value: string): string {
  return value.replace(ANSI_CSI_SEQUENCE, '').trim().slice(-1000);
}

function resultMessage(result: DockerCommandResult): string {
  return cleanMessage(result.stderr || result.stdout);
}

function daemonStatus(
  result: DockerCommandResult,
  platform: NodeJS.Platform
): {
  status: DockerDaemonStatus;
  running: boolean;
  message: string | null;
} {
  if (result.error === 'not-found') {
    return {
      status: 'not-installed',
      running: false,
      message: 'Docker CLI was not found. Install Docker and refresh this page.'
    };
  }

  if (result.code === 0) {
    return { status: 'running', running: true, message: null };
  }

  if (platform === 'win32' || platform === 'darwin') {
    return {
      status: 'stopped',
      running: false,
      message:
        'Docker is installed, but its engine is not responding. Start Docker Desktop and refresh.'
    };
  }

  const detail = resultMessage(result);
  return {
    status: result.error === 'timeout' ? 'unknown' : 'stopped',
    running: false,
    message: detail
      ? `Docker is installed, but its daemon is not responding: ${detail}`
      : 'Docker is installed, but its daemon is not responding. Start Docker and refresh.'
  };
}

function exitCodeFromRow(record: Record<string, unknown>): number | null {
  if (typeof record.ExitCode === 'number') {
    return record.ExitCode;
  }
  if (typeof record.ExitCode === 'string' && /^\d+$/.test(record.ExitCode)) {
    return Number(record.ExitCode);
  }
  if (typeof record.Status === 'string') {
    const match = /\bExited\s+\((\d+)\)/i.exec(record.Status);
    if (match?.[1]) {
      return Number(match[1]);
    }
  }
  return null;
}

function serviceStatusFromRow(record: Record<string, unknown>): DockerServiceStatus {
  const state = typeof record.State === 'string' ? record.State.toLowerCase() : '';
  const exitCode = exitCodeFromRow(record);

  if (state === 'running') {
    return 'running';
  }
  if (exitCode !== null && exitCode > 0) {
    return 'error';
  }
  if (state === 'created' || state === 'exited' || state === 'stopped') {
    return 'stopped';
  }
  if (state === 'dead' || state === 'restarting' || state === 'paused') {
    return 'error';
  }
  return 'unknown';
}

function addComposeStatusRow(statuses: Map<string, DockerServiceInfo>, row: unknown): void {
  if (typeof row !== 'object' || row === null) {
    return;
  }

  const record = row as Record<string, unknown>;
  if (typeof record.Service !== 'string') {
    return;
  }

  const detail =
    typeof record.Status === 'string' && record.Status.trim()
      ? record.Status.trim()
      : typeof record.State === 'string' && record.State.trim()
        ? record.State.trim()
        : null;

  statuses.set(record.Service, {
    name: record.Service,
    status: serviceStatusFromRow(record),
    statusDetail: detail,
    containerId: typeof record.ID === 'string' && record.ID.length > 0 ? record.ID : null
  });
}

function parseComposePs(output: string): Map<string, DockerServiceInfo> {
  const statuses = new Map<string, DockerServiceInfo>();
  const compactOutput = output.trim();
  if (!compactOutput) {
    return statuses;
  }

  try {
    const parsed = JSON.parse(compactOutput) as unknown;
    for (const row of Array.isArray(parsed) ? parsed : [parsed]) {
      addComposeStatusRow(statuses, row);
    }
    return statuses;
  } catch {
    // Older Compose builds can emit one JSON object per line.
  }

  for (const line of compactOutput.split(/\r?\n/)) {
    try {
      addComposeStatusRow(statuses, JSON.parse(line) as unknown);
    } catch {
      return new Map();
    }
  }

  return statuses;
}

function unknownServices(serviceNames: string[]): DockerServiceInfo[] {
  return serviceNames.map((name) => ({
    name,
    status: 'unknown',
    statusDetail: null,
    containerId: null
  }));
}

function commandFailureMessage(action: string, result: DockerCommandResult): string {
  const detail = resultMessage(result);
  return detail ? `Docker Compose ${action} failed: ${detail}` : `Docker Compose ${action} failed.`;
}

export class DockerComposeController implements DockerController {
  private readonly runner: DockerCommandRunner;
  private readonly platform: NodeJS.Platform;

  constructor(
    private readonly root: string,
    options: {
      runner?: DockerCommandRunner;
      platform?: NodeJS.Platform;
    } = {}
  ) {
    this.runner = options.runner ?? runDockerCommand;
    this.platform = options.platform ?? process.platform;
  }

  private async definition(): Promise<{
    composeFiles: string[];
    serviceNames: string[];
  } | null> {
    const composeFiles = await findComposeFiles(this.root);
    if (composeFiles.length === 0) {
      return null;
    }
    return {
      composeFiles,
      serviceNames: await serviceNamesFromFiles(composeFiles)
    };
  }

  private async requireService(service: string): Promise<{
    composeFiles: string[];
    serviceNames: string[];
  }> {
    const definition = await this.definition();
    if (definition === null) {
      throw new DockerOperationError('compose-not-found', 'No Docker Compose file was found.');
    }
    if (!definition.serviceNames.includes(service)) {
      throw new DockerOperationError(
        'service-not-found',
        `Docker Compose service "${service}" was not found.`
      );
    }
    return definition;
  }

  private async requireDaemon(): Promise<void> {
    const result = await this.runner(this.root, ['info'], { timeoutMs: 5000 });
    const daemon = daemonStatus(result, this.platform);
    if (daemon.status === 'not-installed') {
      throw new DockerOperationError('docker-not-installed', daemon.message ?? 'Docker not found.');
    }
    if (!daemon.running) {
      throw new DockerOperationError(
        'docker-not-running',
        daemon.message ?? 'Docker is not running.'
      );
    }
  }

  async inspect(): Promise<DockerInfo | null> {
    const definition = await this.definition();
    if (definition === null) {
      return null;
    }

    const infoResult = await this.runner(this.root, ['info'], { timeoutMs: 5000 });
    const daemon = daemonStatus(infoResult, this.platform);
    if (!daemon.running) {
      return {
        composeFiles: definition.composeFiles,
        services: unknownServices(definition.serviceNames),
        dockerRunning: false,
        daemonStatus: daemon.status,
        message: daemon.message
      };
    }

    const ps = await this.runner(
      this.root,
      composeArgs(this.root, definition.composeFiles, ['ps', '--all', '--format', 'json']),
      { timeoutMs: 8000 }
    );
    if (ps.code !== 0 || ps.error !== null) {
      return {
        composeFiles: definition.composeFiles,
        services: definition.serviceNames.map((name) => ({
          name,
          status: 'error',
          statusDetail: null,
          containerId: null
        })),
        dockerRunning: true,
        daemonStatus: 'running',
        message: commandFailureMessage('status check', ps)
      };
    }

    const statuses = parseComposePs(ps.stdout);
    return {
      composeFiles: definition.composeFiles,
      services: definition.serviceNames.map(
        (name) =>
          statuses.get(name) ?? {
            name,
            status: 'stopped',
            statusDetail: null,
            containerId: null
          }
      ),
      dockerRunning: true,
      daemonStatus: 'running',
      message: null
    };
  }

  private async action(service: string, action: 'start' | 'stop'): Promise<DockerActionResult> {
    const definition = await this.requireService(service);
    await this.requireDaemon();
    const composeCommand =
      action === 'start' ? ['up', '-d', '--', service] : ['stop', '--', service];
    const result = await this.runner(
      this.root,
      composeArgs(this.root, definition.composeFiles, composeCommand),
      { timeoutMs: 60_000 }
    );
    if (result.code !== 0 || result.error !== null) {
      throw new DockerOperationError('command-failed', commandFailureMessage(action, result));
    }
    return {
      service,
      action,
      output: cleanMessage(result.stdout || result.stderr)
    };
  }

  async start(service: string): Promise<DockerActionResult> {
    return await this.action(service, 'start');
  }

  async stop(service: string): Promise<DockerActionResult> {
    return await this.action(service, 'stop');
  }

  async logs(service: string): Promise<DockerLogsResult> {
    const definition = await this.requireService(service);
    await this.requireDaemon();
    const result = await this.runner(
      this.root,
      composeArgs(this.root, definition.composeFiles, [
        'logs',
        '--no-color',
        '--tail',
        '200',
        '--',
        service
      ]),
      { timeoutMs: 15_000, outputLimit: COMMAND_OUTPUT_LIMIT }
    );
    if (result.code !== 0 || result.error !== null) {
      throw new DockerOperationError('command-failed', commandFailureMessage('logs', result));
    }
    return {
      service,
      logs: appendBounded('', `${result.stdout}${result.stderr}`, COMMAND_OUTPUT_LIMIT)
    };
  }
}
