#!/usr/bin/env node
import { Command } from 'commander';
import { badgeCommand } from './commands/badge.js';
import { doctorCommand } from './commands/doctor.js';
import { envCheckCommand, envSyncCommand } from './commands/env.js';
import { explainCommand } from './commands/explain.js';
import { historyCommand } from './commands/history.js';
import { infoCommand } from './commands/info.js';
import { initCommand } from './commands/init.js';
import { verifyCommand } from './commands/verify.js';
import { onboardCommand } from './commands/onboard.js';
import { passportCommand } from './commands/passport.js';
import { portsCommand } from './commands/ports.js';
import { pickScriptInteractively, runCommand } from './commands/run.js';
import { statusCommand } from './commands/status.js';
import { upCommand } from './commands/up.js';
import { upgradeCommand } from './commands/upgrade.js';
import { scanCommand } from './commands/scan.js';
import { startCommand } from './commands/start.js';
import { serveCommand } from './commands/serve.js';
import {
  workspaceAddCommand,
  workspaceListCommand,
  workspacePruneCommand,
  workspaceRemoveCommand
} from './commands/workspace.js';
import { freePortCommand } from './commands/ports.js';
import { printUpdateNotice } from './updateCheck.js';
import { DEV_SURFACE_VERSION } from '../version.js';

const program = new Command();

function toPort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('Port must be an integer between 1 and 65535.');
  }

  return port;
}

function handle(command: Promise<void>, options: { updateNotice?: boolean } = {}): void {
  command
    .then(async () => {
      if (options.updateNotice !== false) {
        await printUpdateNotice(DEV_SURFACE_VERSION);
      }
    })
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.error(message);
      process.exitCode = 1;
    });
}

program
  .name('devsurface')
  .description('Turn any Node.js repository into a local developer control panel.')
  .version(DEV_SURFACE_VERSION)
  // Without this, the root -p/--port option swallows "-p" typed after a
  // subcommand, so "devsurface serve -p 4599" silently bound the default port.
  .enablePositionalOptions()
  .option('-p, --port <port>', 'dashboard port', toPort, 4567)
  .option('--no-open', 'do not open the browser automatically')
  .action((options: { port: number; open: boolean }) => {
    handle(
      startCommand({
        cwd: process.cwd(),
        port: options.port,
        openBrowser: options.open
      })
    );
  });

program
  .command('serve')
  .description('Start the DevSurface hub server (multi-workspace mode).')
  .option('-p, --port <port>', 'hub port', toPort, 4567)
  .option('--no-open', 'do not open the browser automatically')
  .action((options: { port: number; open: boolean }) => {
    handle(
      serveCommand({
        port: options.port,
        openBrowser: options.open
      })
    );
  });

const workspace = program.command('workspace').description('Manage registered workspaces.');

workspace
  .command('add [path]')
  .description('Register a project directory with the hub.')
  .action((dirPath?: string) => {
    handle(workspaceAddCommand(dirPath));
  });

workspace
  .command('list')
  .description('List all registered workspaces.')
  .option('--json', 'print workspaces as JSON')
  .action((options: { json?: boolean }) => {
    handle(workspaceListCommand({ json: options.json }), { updateNotice: options.json !== true });
  });

workspace
  .command('remove <id>')
  .description('Remove a workspace from the hub registry.')
  .action((id: string) => {
    handle(workspaceRemoveCommand(id));
  });

workspace
  .command('prune')
  .description('Remove registered workspaces whose directories no longer exist.')
  .action(() => {
    handle(workspacePruneCommand());
  });

program
  .command('scan')
  .description('Print detected project info.')
  .option('--json', 'print the full scan result as JSON')
  .option('--markdown', 'print a Markdown report for docs and pull requests')
  .option('--summary', 'print a one-line project summary')
  .action((options: { json?: boolean; markdown?: boolean; summary?: boolean }) => {
    // Machine-readable output must stay parseable, so skip the update notice.
    handle(
      scanCommand(process.cwd(), {
        json: options.json,
        markdown: options.markdown,
        summary: options.summary
      }),
      {
        updateNotice: options.json !== true && options.markdown !== true && options.summary !== true
      }
    );
  });

program
  .command('ports')
  .description('Show project ports, what is using them, and free alternatives.')
  .option('--free <port>', 'stop the process listening on a port', toPort)
  .option('--json', 'print port probes as JSON')
  .action((options: { free?: number; json?: boolean }) => {
    if (options.free !== undefined) {
      handle(freePortCommand(options.free));
      return;
    }
    handle(portsCommand(process.cwd(), { json: options.json }), {
      updateNotice: options.json !== true
    });
  });

program
  .command('status')
  .description('Check whether a local DevSurface hub is running.')
  .option('-p, --port <port>', 'hub port to check', toPort, 4567)
  .action((options: { port: number }) => {
    handle(statusCommand(options.port), { updateNotice: false });
  });

program
  .command('doctor')
  .description('Print setup health warnings.')
  .option('--json', 'print warnings as JSON')
  .option(
    '--fail-on <severity>',
    'exit nonzero when warnings at or above this severity exist (error|warning|info|never)',
    'never'
  )
  .action((options: { json?: boolean; failOn: string }) => {
    const failOn = ['error', 'warning', 'info', 'never'].includes(options.failOn)
      ? (options.failOn as 'error' | 'warning' | 'info' | 'never')
      : 'never';
    handle(doctorCommand(process.cwd(), { json: options.json, failOn }), {
      updateNotice: options.json !== true
    });
  });

const env = program.command('env').description('Work with .env files (values never displayed).');

env
  .command('check')
  .description('Report missing/empty env keys; exits nonzero when required keys are unset.')
  .option('--json', 'print the result as JSON')
  .action((options: { json?: boolean }) => {
    handle(envCheckCommand(process.cwd(), { json: options.json }), {
      updateNotice: options.json !== true
    });
  });

env
  .command('sync')
  .description('Append keys that exist in .env.example but not in .env (never overwrites).')
  .action(() => {
    handle(envSyncCommand(process.cwd()));
  });

program
  .command('info')
  .description('Show DevSurface version, data locations, and workspace count.')
  .option('--json', 'print info as JSON')
  .action((options: { json?: boolean }) => {
    handle(infoCommand({ json: options.json }), { updateNotice: options.json !== true });
  });

program
  .command('up')
  .description('Run the launch sequence: Docker services, then the dev script.')
  .option('--dry-run', 'print the launch sequence without running anything')
  .action((options: { dryRun?: boolean }) => {
    handle(upCommand(process.cwd(), { dryRun: options.dryRun }));
  });

program
  .command('upgrade')
  .description('Check the npm registry for a newer DevSurface release.')
  .action(() => {
    handle(upgradeCommand(), { updateNotice: false });
  });

program
  .command('onboard')
  .description('Print a guided setup checklist with readiness score.')
  .action(() => {
    handle(onboardCommand(process.cwd()));
  });

program
  .command('explain')
  .argument('[script]', 'script or configured command to explain')
  .description('Explain package scripts in plain English.')
  .option('--json', 'print explanations as JSON')
  .action((script: string | undefined, options: { json?: boolean }) => {
    handle(explainCommand(process.cwd(), script, { json: options.json }), {
      updateNotice: options.json !== true
    });
  });

const toList = (value: string): string[] =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

program
  .command('verify')
  .description('Run the project quality scripts (lint, typecheck, test, build) in sequence.')
  .option('--only <scripts>', 'comma-separated scripts to run (from the verify set)', toList)
  .option('--skip <scripts>', 'comma-separated scripts to leave out', toList)
  .option('--bail', 'stop at the first failing script')
  .option('--json', 'print results as JSON')
  .action((options: { only?: string[]; skip?: string[]; bail?: boolean; json?: boolean }) => {
    handle(
      verifyCommand(process.cwd(), {
        only: options.only,
        skip: options.skip,
        bail: options.bail,
        json: options.json
      }),
      { updateNotice: options.json !== true }
    );
  });

program
  .command('history')
  .description('Show recent script runs recorded by the dashboard.')
  .option('-n, --limit <count>', 'number of entries to show', (value) => Number(value), 20)
  .option('--json', 'print history as JSON')
  .option('--clear', 'delete the stored history for this project')
  .option('-s, --script <name>', 'only show runs of one script')
  .action((options: { limit: number; json?: boolean; clear?: boolean; script?: string }) => {
    handle(
      historyCommand(process.cwd(), options.limit, {
        json: options.json,
        clear: options.clear,
        script: options.script
      }),
      {
        updateNotice: options.json !== true
      }
    );
  });

program
  .command('badge')
  .description('Generate a setup-readiness SVG badge for the README.')
  .option('-o, --out <file>', 'output file path', 'devsurface-readiness.svg')
  .option('--score', 'print the readiness score (0-100) instead of writing a badge')
  .option('--label <text>', 'custom badge label', 'devsurface')
  .action((options: { out: string; score?: boolean; label: string }) => {
    handle(
      badgeCommand(process.cwd(), options.out, { score: options.score, label: options.label }),
      {
        updateNotice: options.score !== true
      }
    );
  });

program
  .command('passport')
  .description('Generate a shareable HTML onboarding report (Project Passport).')
  .option('-o, --out <file>', 'output file path', 'devsurface-passport.html')
  .option('--open', 'open the passport in the browser after writing it')
  .action((options: { out: string; open?: boolean }) => {
    handle(passportCommand(process.cwd(), options.out, { open: options.open }));
  });

program
  .command('init')
  .description('Create a devsurface.config.json prefilled from detection.')
  .option('--force', 'overwrite an existing config')
  .action((options: { force?: boolean }) => {
    handle(initCommand(process.cwd(), { force: options.force }));
  });

program
  .command('run')
  .argument('[script]', 'package.json script to run (omit for an interactive picker)')
  .description('Run a package script and stream logs.')
  .action((script?: string) => {
    handle(
      script === undefined
        ? pickScriptInteractively(process.cwd())
        : runCommand(script, process.cwd())
    );
  });

await program.parseAsync(process.argv);
