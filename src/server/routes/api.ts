import { constants, existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import spawn from 'cross-spawn';
import type { Hono } from 'hono';
import open from 'open';
import {
  DockerComposeController,
  DockerOperationError,
  type DockerController
} from '../../core/docker/compose.js';
import type { ProcessManager } from '../../core/process/manager.js';
import {
  isDangerousCommand,
  resolveConfiguredCommand,
  resolvePackageInstallCommand,
  resolvePackageRunCommand
} from '../../core/process/runner.js';
import { runDoctor } from '../../core/doctor/index.js';
import { setEnvValue } from '../../core/env/write.js';
import { renderMarkdownReport } from '../../core/report/markdown.js';
import { renderReadinessBadge } from '../../core/badge/index.js';
import { freePort } from '../../core/ports/free.js';
import { detectPorts } from '../../core/scanner/ports.js';
import { findPortOwners } from '../../core/scanner/portOwner.js';
import type { RunHistoryStore } from '../../core/history/index.js';
import { buildOnboardingPlan } from '../../core/onboarding/index.js';
import { buildFactSheet, buildPlainSummary } from '../../core/summary/index.js';
import { buildTips } from '../../core/tips/index.js';
import { buildQuickstart } from '../../core/quickstart/index.js';
import { checkSystem } from '../../core/system/index.js';
import { renderPassportHtml } from '../../core/passport/index.js';
import { scanProject } from '../../core/scanner/index.js';
import type { Hub } from '../../core/hub/runtime.js';
import { DEV_SURFACE_VERSION } from '../../version.js';
import { isAllowedLocalOrigin, isSameOrigin } from '../localAccess.js';
import { createApiAccessMiddleware } from '../accessControl.js';
import { hasValidMutationToken } from '../mutationToken.js';
import { isAllowedTerminalCommand } from '../terminal.js';

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isAllowedMutationOrigin(requestUrl: string, origin: string | null): boolean {
  if (origin === null) {
    return true;
  }
  return isAllowedLocalOrigin(origin) && isSameOrigin(requestUrl, origin);
}

function registerMutationGuard(app: Hono, mutationToken: string): void {
  app.use('/api/*', createApiAccessMiddleware());
  app.use('/api/*', async (context, next) => {
    if (context.req.method === 'GET' || context.req.method === 'HEAD') {
      await next();
      return;
    }

    const origin = context.req.header('origin') ?? null;
    const secFetchSite = context.req.header('sec-fetch-site') ?? null;
    const intent = context.req.header('x-devsurface-intent') ?? null;
    const token = context.req.header('x-devsurface-token') ?? null;
    if (
      !hasMutationIntent(intent) ||
      !hasValidMutationToken(token, mutationToken) ||
      isCrossSiteFetch(secFetchSite) ||
      !isAllowedMutationOrigin(context.req.url, origin)
    ) {
      return context.json({ error: 'Cross-origin mutation rejected.' }, 403);
    }

    await next();
  });
}

function isCrossSiteFetch(secFetchSite: string | null): boolean {
  return secFetchSite === 'cross-site';
}

function hasMutationIntent(intent: string | null): boolean {
  return intent === 'dashboard';
}

async function realPathWithinRoot(root: string, target: string): Promise<boolean> {
  if (!isWithinRoot(root, target)) {
    return false;
  }
  try {
    const [realRoot, realTarget] = await Promise.all([fs.realpath(root), fs.realpath(target)]);
    return isWithinRoot(realRoot, realTarget);
  } catch {
    return false;
  }
}

async function writableDestinationWithinRoot(root: string, destination: string): Promise<boolean> {
  if (!isWithinRoot(root, destination)) {
    return false;
  }
  try {
    const [realRoot, realParent] = await Promise.all([
      fs.realpath(root),
      fs.realpath(path.dirname(destination))
    ]);
    return isWithinRoot(realRoot, realParent);
  } catch {
    return false;
  }
}

async function copyFileExclusive(
  source: string,
  destination: string
): Promise<'copied' | 'exists'> {
  const content = await fs.readFile(source);
  let handle: fs.FileHandle | null = null;
  try {
    handle = await fs.open(
      destination,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600
    );
    await handle.writeFile(content);
    return 'copied';
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code === 'EEXIST') {
      return 'exists';
    }
    throw error;
  } finally {
    await handle?.close();
  }
}

function quotePowerShellString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quotePosixString(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

function resolveCommandPromptExecutable(): string {
  return process.env.ComSpec ?? 'cmd.exe';
}

function findExecutable(command: string): string | null {
  if (path.isAbsolute(command)) {
    return existsSync(command) ? command : null;
  }
  const pathValue = process.env.PATH ?? '';
  for (const directory of pathValue.split(path.delimiter)) {
    if (directory.length === 0) {
      continue;
    }
    const candidate = path.join(directory, command);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function launchDetached(command: string, args: string[], root: string): boolean {
  const child = spawn(command, args, {
    cwd: root,
    detached: true,
    stdio: 'ignore',
    windowsHide: process.platform === 'win32'
  });
  child.on('error', () => undefined);
  child.unref();
  return true;
}

function openTerminalAt(root: string): boolean {
  if (process.platform === 'win32') {
    return launchDetached(
      resolveCommandPromptExecutable(),
      [
        '/d',
        '/c',
        'start',
        '""',
        '/D',
        root,
        'powershell.exe',
        '-NoExit',
        '-NoLogo',
        '-Command',
        `Set-Location -LiteralPath ${quotePowerShellString(root)}`
      ],
      root
    );
  }

  if (process.platform === 'darwin') {
    return launchDetached('open', ['-a', 'Terminal', root], root);
  }

  const configuredTerminal = process.env.TERMINAL?.trim();
  if (
    configuredTerminal !== undefined &&
    configuredTerminal.length > 0 &&
    isAllowedTerminalCommand(configuredTerminal) &&
    findExecutable(configuredTerminal) !== null
  ) {
    return launchDetached(configuredTerminal, [], root);
  }

  const linuxTerminals: Array<{ command: string; args: string[] }> = [
    { command: 'x-terminal-emulator', args: [] },
    { command: 'gnome-terminal', args: ['--working-directory', root] },
    { command: 'konsole', args: ['--workdir', root] },
    { command: 'xfce4-terminal', args: ['--working-directory', root] },
    {
      command: 'xterm',
      args: [
        '-e',
        'sh',
        '-lc',
        `cd ${quotePosixString(root)} && exec ${quotePosixString(process.env.SHELL ?? 'sh')}`
      ]
    }
  ];

  const terminal = linuxTerminals.find((candidate) => findExecutable(candidate.command) !== null);
  if (terminal === undefined) {
    return false;
  }

  return launchDetached(terminal.command, terminal.args, root);
}

/**
 * Pick the editor to open the project in: DEVSURFACE_EDITOR when set (a plain
 * command name on the PATH), otherwise the first common editor CLI found.
 */
function resolveEditorCommand(): string | null {
  const configured = process.env.DEVSURFACE_EDITOR?.trim();
  if (
    configured !== undefined &&
    configured.length > 0 &&
    isAllowedTerminalCommand(configured) &&
    findExecutable(configured) !== null
  ) {
    return configured;
  }

  const candidates =
    process.platform === 'win32'
      ? ['code.cmd', 'code.exe', 'cursor.cmd', 'codium.cmd']
      : ['code', 'cursor', 'codium', 'subl'];
  return candidates.find((candidate) => findExecutable(candidate) !== null) ?? null;
}

function openEditorAt(root: string): boolean {
  const editor = resolveEditorCommand();
  if (editor === null) {
    return false;
  }
  return launchDetached(editor, [root], root);
}

const SERVER_STARTED_AT = Date.now();

/** Ports dev tools habitually claim; scanned on demand from the Ports view. */
const COMMON_DEV_PORTS = [
  3000, 3001, 3306, 4000, 4200, 4321, 4567, 5000, 5173, 5432, 5555, 6006, 6379, 7000, 8000, 8080,
  8081, 8888, 9000, 9090, 27017
];

/** Probe the common dev ports and attach owners to the busy ones. */
async function commonPortsResponse(context: {
  json: (data: unknown) => Response;
}): Promise<Response> {
  const probes = (await detectPorts(COMMON_DEV_PORTS)) ?? [];
  const busy = probes.filter((probe) => probe.inUse).map((probe) => probe.port);
  if (busy.length > 0) {
    const owners = await findPortOwners(busy);
    for (const probe of probes) {
      if (probe.inUse) {
        probe.owner = owners.get(probe.port) ?? null;
      }
    }
  }
  return context.json(probes);
}

/** Shared handler for the port-free endpoints (hub and legacy). */
async function freePortResponse(
  port: string,
  context: { json: (data: unknown, status?: 200 | 400 | 409) => Response }
): Promise<Response> {
  const parsed = Number(port);
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
    return context.json({ error: 'Invalid port number.' }, 400);
  }
  const result = await freePort(parsed);
  if (!result.freed) {
    return context.json(result, 409);
  }
  return context.json(result);
}

function handleDockerError(
  error: unknown,
  context: { json: (data: unknown, status: number) => Response }
): Response {
  if (error instanceof DockerOperationError) {
    if (error.code === 'compose-not-found' || error.code === 'service-not-found') {
      return context.json({ error: error.message, code: error.code }, 404);
    }
    if (error.code === 'docker-not-installed' || error.code === 'docker-not-running') {
      return context.json({ error: error.message, code: error.code }, 503);
    }
    return context.json({ error: error.message, code: error.code }, 502);
  }
  throw error;
}

async function onboardingForRoot(root: string) {
  const scan = await scanProject(root);
  const warnings = await runDoctor(root, scan);
  return buildOnboardingPlan(scan, warnings);
}

/**
 * Everything the Learn view needs in one payload: the plain-English summary,
 * fact sheet, contextual tips, the quickstart recipe, and machine readiness.
 */
async function insightsForRoot(root: string) {
  const scan = await scanProject(root);
  const [quickstart, system] = await Promise.all([buildQuickstart(scan), checkSystem(scan)]);
  return {
    summary: buildPlainSummary(scan),
    facts: buildFactSheet(scan),
    tips: buildTips(scan),
    quickstart,
    system
  };
}

/**
 * Render the shareable Project Passport for a workspace. Inline by default so
 * it previews in a browser tab; `?download=1` sets an attachment filename.
 */
async function passportResponse(
  root: string,
  context: {
    req: { query: (name: string) => string | undefined };
    html: (body: string) => Response | Promise<Response>;
    header: (name: string, value: string) => void;
  }
): Promise<Response> {
  const scan = await scanProject(root);
  const warnings = await runDoctor(root, scan);
  const plan = buildOnboardingPlan(scan, warnings);
  const html = renderPassportHtml({ scan, warnings, plan, version: DEV_SURFACE_VERSION });
  if (context.req.query('download') === '1') {
    const safeName = scan.projectName.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60) || 'project';
    context.header('Content-Disposition', `attachment; filename="${safeName}-passport.html"`);
  }
  return await context.html(html);
}

/**
 * Set one .env value (write-only). The response never includes the value —
 * only the key name and whether it was added or updated.
 */
async function handleEnvSet(
  root: string,
  body: { key?: unknown; value?: unknown } | null
): Promise<{ status: 200 | 400; payload: Record<string, string> }> {
  if (body === null || typeof body.key !== 'string' || typeof body.value !== 'string') {
    return { status: 400, payload: { error: 'key and value are required.' } };
  }
  const scan = await scanProject(root);
  const result = await setEnvValue({
    root,
    localPath: scan.env?.localPath ?? null,
    key: body.key,
    value: body.value
  });
  if (!result.ok) {
    return { status: 400, payload: { error: result.error } };
  }
  return { status: 200, payload: { status: result.action, key: body.key } };
}

function registerWorkspaceRoutes(
  app: Hono,
  resolveWorkspace: (id: string) => Promise<{
    root: string;
    processManager: ProcessManager;
    dockerController: DockerController;
  } | null>,
  history?: RunHistoryStore,
  onWorkspaceMutated?: (id: string) => void
): void {
  app.get('/api/workspaces/:id/history', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    return context.json(history === undefined ? [] : await history.list(ws.root));
  });

  app.post('/api/workspaces/:id/ports/:port/free', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    return freePortResponse(context.req.param('port'), context);
  });

  app.post('/api/workspaces/:id/open/editor', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    const opened = openEditorAt(ws.root);
    return context.json({ opened, target: 'editor' }, opened ? 200 : 501);
  });

  app.get('/api/workspaces/:id/ports/common', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    return commonPortsResponse(context);
  });

  app.get('/api/workspaces/:id/report.md', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    const scan = await scanProject(ws.root);
    const warnings = await runDoctor(ws.root, scan);
    const plan = buildOnboardingPlan(scan, warnings);
    context.header('Content-Type', 'text/markdown; charset=utf-8');
    return context.body(renderMarkdownReport(scan, warnings, plan));
  });

  app.get('/api/workspaces/:id/badge.svg', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    const scan = await scanProject(ws.root);
    const warnings = await runDoctor(ws.root, scan);
    const plan = buildOnboardingPlan(scan, warnings);
    context.header('Content-Type', 'image/svg+xml');
    context.header('Cache-Control', 'no-cache');
    return context.body(renderReadinessBadge(plan.readiness));
  });

  app.post('/api/workspaces/:id/stop-all', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    const running = ws.processManager.list().filter((p) => p.status === 'running').length;
    ws.processManager.killAll();
    return context.json({ stopped: running });
  });

  app.get('/api/workspaces/:id/project', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    return context.json(await scanProject(ws.root));
  });

  app.get('/api/workspaces/:id/health', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    return context.json(await runDoctor(ws.root));
  });

  app.get('/api/workspaces/:id/onboarding', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    return context.json(await onboardingForRoot(ws.root));
  });

  app.get('/api/workspaces/:id/insights', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    return context.json(await insightsForRoot(ws.root));
  });

  app.get('/api/workspaces/:id/passport', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    return passportResponse(ws.root, context);
  });

  app.get('/api/workspaces/:id/processes', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    return context.json(ws.processManager.list());
  });

  app.get('/api/workspaces/:id/logs', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    return context.json(ws.processManager.listLogs());
  });

  app.get('/api/workspaces/:id/docker/:service/logs', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    const service = decodeURIComponent(context.req.param('service'));
    try {
      return context.json(await ws.dockerController.logs(service));
    } catch (error) {
      return handleDockerError(error, context);
    }
  });

  app.post('/api/workspaces/:id/docker/:service/start', async (context) => {
    const id = context.req.param('id');
    const ws = await resolveWorkspace(id);
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    const service = decodeURIComponent(context.req.param('service'));
    try {
      const result = await ws.dockerController.start(service);
      onWorkspaceMutated?.(id);
      return context.json(result);
    } catch (error) {
      return handleDockerError(error, context);
    }
  });

  app.post('/api/workspaces/:id/docker/:service/stop', async (context) => {
    const id = context.req.param('id');
    const ws = await resolveWorkspace(id);
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    const service = decodeURIComponent(context.req.param('service'));
    try {
      const result = await ws.dockerController.stop(service);
      onWorkspaceMutated?.(id);
      return context.json(result);
    } catch (error) {
      return handleDockerError(error, context);
    }
  });

  app.post('/api/workspaces/:id/run/:script', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    const script = decodeURIComponent(context.req.param('script'));
    const scan = await scanProject(ws.root);
    const packageScript = scan.scripts[script];

    if (packageScript === undefined) {
      return context.json({ error: `Script "${script}" was not found.` }, 404);
    }
    if (isDangerousCommand(packageScript)) {
      return context.json({ error: 'Refusing to run dangerous script.' }, 403);
    }

    const command = await resolvePackageRunCommand({
      cwd: ws.root,
      packageManager: scan.packageManager,
      script
    });
    if (command === null) {
      return context.json({ error: 'Package manager executable was not found.' }, 503);
    }

    const processInfo = ws.processManager.start({
      cwd: ws.root,
      script,
      command: command.command,
      args: command.args,
      displayCommand: command.displayCommand
    });
    return context.json({ ...processInfo, packageScript });
  });

  app.post('/api/workspaces/:id/install', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    const scan = await scanProject(ws.root);
    const command = await resolvePackageInstallCommand({
      cwd: ws.root,
      packageManager: scan.packageManager
    });
    if (command === null) {
      return context.json({ error: 'Package manager executable was not found.' }, 503);
    }

    const processInfo = ws.processManager.start({
      cwd: ws.root,
      script: 'install',
      command: command.command,
      args: command.args,
      displayCommand: command.displayCommand
    });
    return context.json(processInfo);
  });

  app.post('/api/workspaces/:id/commands/:name', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    const name = decodeURIComponent(context.req.param('name'));
    const scan = await scanProject(ws.root);
    const configuredCommand =
      scan.config?.config.commands?.[name] ?? scan.presetCommands[name] ?? null;

    if (configuredCommand === null) {
      return context.json({ error: `Configured command "${name}" was not found.` }, 404);
    }
    if (isDangerousCommand(configuredCommand)) {
      return context.json({ error: 'Refusing to run dangerous command.' }, 403);
    }

    const resolvedCommand = await resolveConfiguredCommand(ws.root, configuredCommand);
    if (resolvedCommand === null) {
      return context.json(
        {
          error:
            'Configured command uses unsupported shell syntax. Use a simple executable with arguments, or move complex logic into a package.json script.'
        },
        400
      );
    }

    const processInfo = ws.processManager.start({
      cwd: ws.root,
      script: name,
      command: resolvedCommand.command,
      args: resolvedCommand.args,
      displayCommand: resolvedCommand.displayCommand
    });
    return context.json({ ...processInfo, configuredCommand });
  });

  app.post('/api/workspaces/:id/open/folder', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    await open(ws.root);
    return context.json({ opened: true, target: 'folder' });
  });

  app.post('/api/workspaces/:id/open/package', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    const packagePath = path.join(ws.root, 'package.json');
    if (!(await realPathWithinRoot(ws.root, packagePath))) {
      return context.json({ error: 'package.json was not found inside the project root.' }, 404);
    }
    await open(packagePath);
    return context.json({ opened: true, target: 'package' });
  });

  app.post('/api/workspaces/:id/open/terminal', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    const opened = openTerminalAt(ws.root);
    return context.json({ opened, target: 'terminal' }, opened ? 200 : 501);
  });

  app.post('/api/workspaces/:id/env/copy', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    const scan = await scanProject(ws.root);
    const examplePath = scan.env?.examplePath ?? null;
    const localPath = scan.env?.localPath ?? null;

    if (examplePath === null) {
      return context.json({ error: '.env.example was not found.' }, 404);
    }

    const destination = localPath ?? path.join(ws.root, scan.config?.config.env?.local ?? '.env');
    if (
      !(await realPathWithinRoot(ws.root, examplePath)) ||
      !(await writableDestinationWithinRoot(ws.root, destination))
    ) {
      return context.json({ error: 'Refusing to copy env files outside the project root.' }, 400);
    }

    const copyResult = await copyFileExclusive(examplePath, destination);
    if (copyResult === 'exists') {
      return context.json({ error: '.env already exists.' }, 409);
    }
    return context.json({ copied: true });
  });

  app.post('/api/workspaces/:id/env/set', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    const body = await context.req.json<{ key?: unknown; value?: unknown }>().catch(() => null);
    const result = await handleEnvSet(ws.root, body);
    return context.json(result.payload, result.status);
  });

  app.delete('/api/workspaces/:id/run/:pid', async (context) => {
    const ws = await resolveWorkspace(context.req.param('id'));
    if (!ws) return context.json({ error: 'Workspace not found.' }, 404);
    const pid = decodeURIComponent(context.req.param('pid'));
    const stopped = ws.processManager.stop(pid);
    return context.json({ stopped });
  });
}

export function registerHubApiRoutes(
  app: Hono,
  options: {
    hub: Hub;
    mutationToken: string;
  }
): void {
  const { hub } = options;
  registerMutationGuard(app, options.mutationToken);

  async function resolveWorkspace(id: string) {
    const entry = await hub.registry.resolve(id);
    if (!entry) return null;
    const runtime = hub.ensure(entry);
    return {
      root: runtime.root,
      processManager: runtime.processManager,
      dockerController: runtime.dockerController
    };
  }

  app.get('/api/session', (context) => {
    return context.json({ token: options.mutationToken });
  });

  app.get('/api/hub/status', async (context) => {
    const entries = await hub.registry.list();
    return context.json({
      status: 'running',
      version: DEV_SURFACE_VERSION,
      uptimeSeconds: Math.round((Date.now() - SERVER_STARTED_AT) / 1000),
      workspaceCount: entries.length
    });
  });

  app.get('/api/workspaces', async (context) => {
    return context.json(await hub.listSummaries());
  });

  app.post('/api/workspaces', async (context) => {
    const body = await context.req.json<{ path: string }>().catch(() => null);
    if (!body?.path) {
      return context.json({ error: 'path is required.' }, 400);
    }
    try {
      const entry = await hub.registry.add(body.path);
      hub.events.emit('workspaces-changed');
      return context.json(entry, 201);
    } catch (error) {
      return context.json({ error: error instanceof Error ? error.message : 'Invalid path.' }, 400);
    }
  });

  app.delete('/api/workspaces/:id', async (context) => {
    const id = context.req.param('id');
    const runtime = hub.get(id);
    if (runtime) {
      runtime.processManager.killAll();
    }
    const removed = await hub.registry.remove(id);
    if (removed) {
      hub.events.emit('workspaces-changed');
    }
    return context.json({ removed }, removed ? 200 : 404);
  });

  app.post('/api/workspaces/prune', async (context) => {
    const removed = await hub.registry.prune();
    if (removed.length > 0) {
      hub.events.emit('workspaces-changed');
    }
    return context.json({ removed });
  });

  registerWorkspaceRoutes(app, resolveWorkspace, hub.history, (id) =>
    hub.events.emit('workspace-updated', id)
  );

  // Backward-compatible single-project aliases: proxy to the first workspace
  app.get('/api/project', async (context) => {
    const entries = await hub.registry.list();
    if (entries.length === 0) return context.json({ error: 'No workspaces registered.' }, 404);
    return context.json(await scanProject(hub.ensure(entries[0]).root));
  });

  app.get('/api/health', async (context) => {
    const entries = await hub.registry.list();
    if (entries.length === 0) return context.json({ error: 'No workspaces registered.' }, 404);
    return context.json(await runDoctor(hub.ensure(entries[0]).root));
  });

  app.get('/api/onboarding', async (context) => {
    const entries = await hub.registry.list();
    if (entries.length === 0) return context.json({ error: 'No workspaces registered.' }, 404);
    return context.json(await onboardingForRoot(hub.ensure(entries[0]).root));
  });

  app.get('/api/insights', async (context) => {
    const entries = await hub.registry.list();
    if (entries.length === 0) return context.json({ error: 'No workspaces registered.' }, 404);
    return context.json(await insightsForRoot(hub.ensure(entries[0]).root));
  });

  app.get('/api/passport', async (context) => {
    const entries = await hub.registry.list();
    if (entries.length === 0) return context.json({ error: 'No workspaces registered.' }, 404);
    return passportResponse(hub.ensure(entries[0]).root, context);
  });

  app.get('/api/processes', async (context) => {
    const entries = await hub.registry.list();
    if (entries.length === 0) return context.json([]);
    return context.json(hub.ensure(entries[0]).processManager.list());
  });

  app.get('/api/logs', async (context) => {
    const entries = await hub.registry.list();
    if (entries.length === 0) return context.json([]);
    return context.json(hub.ensure(entries[0]).processManager.listLogs());
  });
}

// Legacy single-project API for backward compatibility with tests
export function registerApiRoutes(
  app: Hono,
  options: {
    projectRoot: string;
    processManager: ProcessManager;
    dockerController?: DockerController;
    mutationToken: string;
  }
): void {
  const dockerController =
    options.dockerController ?? new DockerComposeController(options.projectRoot);
  registerMutationGuard(app, options.mutationToken);

  app.get('/api/session', (context) => {
    return context.json({ token: options.mutationToken });
  });

  app.get('/api/hub/status', (context) => {
    return context.json({
      status: 'running',
      version: DEV_SURFACE_VERSION,
      uptimeSeconds: Math.round((Date.now() - SERVER_STARTED_AT) / 1000),
      workspaceCount: 1
    });
  });

  app.get('/api/project', async (context) => {
    return context.json(await scanProject(options.projectRoot));
  });

  app.get('/api/health', async (context) => {
    return context.json(await runDoctor(options.projectRoot));
  });

  app.get('/api/onboarding', async (context) => {
    return context.json(await onboardingForRoot(options.projectRoot));
  });

  app.get('/api/insights', async (context) => {
    return context.json(await insightsForRoot(options.projectRoot));
  });

  app.get('/api/passport', async (context) => {
    return passportResponse(options.projectRoot, context);
  });

  app.get('/api/processes', (context) => {
    return context.json(options.processManager.list());
  });

  app.get('/api/logs', (context) => {
    return context.json(options.processManager.listLogs());
  });

  app.get('/api/docker/:service/logs', async (context) => {
    const service = decodeURIComponent(context.req.param('service'));
    try {
      return context.json(await dockerController.logs(service));
    } catch (error) {
      return handleDockerError(error, context);
    }
  });

  app.post('/api/docker/:service/start', async (context) => {
    const service = decodeURIComponent(context.req.param('service'));
    try {
      return context.json(await dockerController.start(service));
    } catch (error) {
      return handleDockerError(error, context);
    }
  });

  app.post('/api/docker/:service/stop', async (context) => {
    const service = decodeURIComponent(context.req.param('service'));
    try {
      return context.json(await dockerController.stop(service));
    } catch (error) {
      return handleDockerError(error, context);
    }
  });

  app.post('/api/run/:script', async (context) => {
    const script = decodeURIComponent(context.req.param('script'));
    const scan = await scanProject(options.projectRoot);
    const packageScript = scan.scripts[script];

    if (packageScript === undefined) {
      return context.json({ error: `Script "${script}" was not found.` }, 404);
    }
    if (isDangerousCommand(packageScript)) {
      return context.json({ error: 'Refusing to run dangerous script.' }, 403);
    }

    const command = await resolvePackageRunCommand({
      cwd: options.projectRoot,
      packageManager: scan.packageManager,
      script
    });
    if (command === null) {
      return context.json({ error: 'Package manager executable was not found.' }, 503);
    }

    const processInfo = options.processManager.start({
      cwd: options.projectRoot,
      script,
      command: command.command,
      args: command.args,
      displayCommand: command.displayCommand
    });
    return context.json({ ...processInfo, packageScript });
  });

  app.post('/api/install', async (context) => {
    const scan = await scanProject(options.projectRoot);
    const command = await resolvePackageInstallCommand({
      cwd: options.projectRoot,
      packageManager: scan.packageManager
    });
    if (command === null) {
      return context.json({ error: 'Package manager executable was not found.' }, 503);
    }

    const processInfo = options.processManager.start({
      cwd: options.projectRoot,
      script: 'install',
      command: command.command,
      args: command.args,
      displayCommand: command.displayCommand
    });
    return context.json(processInfo);
  });

  app.post('/api/commands/:name', async (context) => {
    const name = decodeURIComponent(context.req.param('name'));
    const scan = await scanProject(options.projectRoot);
    const configuredCommand =
      scan.config?.config.commands?.[name] ?? scan.presetCommands[name] ?? null;

    if (configuredCommand === null) {
      return context.json({ error: `Configured command "${name}" was not found.` }, 404);
    }
    if (isDangerousCommand(configuredCommand)) {
      return context.json({ error: 'Refusing to run dangerous command.' }, 403);
    }

    const resolvedCommand = await resolveConfiguredCommand(options.projectRoot, configuredCommand);
    if (resolvedCommand === null) {
      return context.json(
        {
          error:
            'Configured command uses unsupported shell syntax. Use a simple executable with arguments, or move complex logic into a package.json script.'
        },
        400
      );
    }

    const processInfo = options.processManager.start({
      cwd: options.projectRoot,
      script: name,
      command: resolvedCommand.command,
      args: resolvedCommand.args,
      displayCommand: resolvedCommand.displayCommand
    });
    return context.json({ ...processInfo, configuredCommand });
  });

  app.post('/api/open/folder', async (context) => {
    await open(options.projectRoot);
    return context.json({ opened: true, target: 'folder' });
  });

  app.post('/api/open/package', async (context) => {
    const packagePath = path.join(options.projectRoot, 'package.json');
    if (!(await realPathWithinRoot(options.projectRoot, packagePath))) {
      return context.json({ error: 'package.json was not found inside the project root.' }, 404);
    }
    await open(packagePath);
    return context.json({ opened: true, target: 'package' });
  });

  app.post('/api/open/terminal', (context) => {
    const opened = openTerminalAt(options.projectRoot);
    return context.json({ opened, target: 'terminal' }, opened ? 200 : 501);
  });

  app.post('/api/open/editor', (context) => {
    const opened = openEditorAt(options.projectRoot);
    return context.json({ opened, target: 'editor' }, opened ? 200 : 501);
  });

  app.post('/api/ports/:port/free', async (context) => {
    return freePortResponse(context.req.param('port'), context);
  });

  app.get('/api/ports/common', async (context) => {
    return commonPortsResponse(context);
  });

  app.post('/api/stop-all', (context) => {
    const running = options.processManager.list().filter((p) => p.status === 'running').length;
    options.processManager.killAll();
    return context.json({ stopped: running });
  });

  app.post('/api/env/copy', async (context) => {
    const scan = await scanProject(options.projectRoot);
    const examplePath = scan.env?.examplePath ?? null;
    const localPath = scan.env?.localPath ?? null;

    if (examplePath === null) {
      return context.json({ error: '.env.example was not found.' }, 404);
    }

    const destination =
      localPath ?? path.join(options.projectRoot, scan.config?.config.env?.local ?? '.env');
    if (
      !(await realPathWithinRoot(options.projectRoot, examplePath)) ||
      !(await writableDestinationWithinRoot(options.projectRoot, destination))
    ) {
      return context.json({ error: 'Refusing to copy env files outside the project root.' }, 400);
    }

    const copyResult = await copyFileExclusive(examplePath, destination);
    if (copyResult === 'exists') {
      return context.json({ error: '.env already exists.' }, 409);
    }
    return context.json({ copied: true });
  });

  app.post('/api/env/set', async (context) => {
    const body = await context.req.json<{ key?: unknown; value?: unknown }>().catch(() => null);
    const result = await handleEnvSet(options.projectRoot, body);
    return context.json(result.payload, result.status);
  });

  app.delete('/api/run/:pid', (context) => {
    const pid = decodeURIComponent(context.req.param('pid'));
    const stopped = options.processManager.stop(pid);
    return context.json({ stopped });
  });
}
