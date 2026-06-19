import { constants, existsSync } from 'node:fs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import spawn from 'cross-spawn';
import type { Hono } from 'hono';
import open from 'open';
import type { ProcessManager } from '../../core/process/manager.js';
import {
  resolvePackageInstallCommand,
  resolvePackageRunCommand
} from '../../core/process/runner.js';
import { runDoctor } from '../../core/doctor/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { isAllowedLocalHostHeader, isAllowedLocalOrigin, isSameOrigin } from '../localAccess.js';

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

  const configuredTerminal = process.env.TERMINAL;
  if (configuredTerminal !== undefined && findExecutable(configuredTerminal) !== null) {
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

export function registerApiRoutes(
  app: Hono,
  options: {
    projectRoot: string;
    processManager: ProcessManager;
  }
): void {
  app.use('/api/*', async (context, next) => {
    const host = context.req.header('host') ?? new URL(context.req.url).host;
    if (!isAllowedLocalHostHeader(host)) {
      return context.json({ error: 'Non-local host rejected.' }, 403);
    }

    if (context.req.method !== 'GET' && context.req.method !== 'HEAD') {
      const origin = context.req.header('origin') ?? null;
      const secFetchSite = context.req.header('sec-fetch-site') ?? null;
      const intent = context.req.header('x-devsurface-intent') ?? null;
      if (
        !hasMutationIntent(intent) ||
        isCrossSiteFetch(secFetchSite) ||
        !isAllowedMutationOrigin(context.req.url, origin)
      ) {
        return context.json({ error: 'Cross-origin mutation rejected.' }, 403);
      }
    }

    await next();
  });

  app.get('/api/project', async (context) => {
    return context.json(await scanProject(options.projectRoot));
  });

  app.get('/api/health', async (context) => {
    return context.json(await runDoctor(options.projectRoot));
  });

  app.get('/api/processes', (context) => {
    return context.json(options.processManager.list());
  });

  app.get('/api/logs', (context) => {
    return context.json(options.processManager.listLogs());
  });

  app.post('/api/run/:script', async (context) => {
    const script = decodeURIComponent(context.req.param('script'));
    const scan = await scanProject(options.projectRoot);
    const packageScript = scan.scripts[script];

    if (packageScript === undefined) {
      return context.json({ error: `Script "${script}" was not found.` }, 404);
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

    return context.json({
      ...processInfo,
      packageScript
    });
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
    const configuredCommand = scan.config?.config.commands?.[name] ?? null;

    if (configuredCommand === null) {
      return context.json({ error: `Configured command "${name}" was not found.` }, 404);
    }

    const processInfo = options.processManager.start({
      cwd: options.projectRoot,
      script: name,
      command: configuredCommand,
      args: [],
      displayCommand: configuredCommand,
      shell: true
    });

    return context.json({
      ...processInfo,
      configuredCommand
    });
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

  app.delete('/api/run/:pid', (context) => {
    const pid = decodeURIComponent(context.req.param('pid'));
    const stopped = options.processManager.stop(pid);
    return context.json({ stopped });
  });
}
