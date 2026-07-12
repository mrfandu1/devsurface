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
import { learnCommand } from './commands/learn.js';
import { tipsCommand } from './commands/tips.js';
import { summaryCommand } from './commands/summary.js';
import { systemCommand } from './commands/system.js';
import { quickstartCommand } from './commands/quickstart.js';
import { whyCommand } from './commands/why.js';
import { searchCommand } from './commands/search.js';
import { notesCommand } from './commands/notes.js';
import { todosCommand } from './commands/todos.js';
import { statsCommand } from './commands/stats.js';
import { depsCommand } from './commands/deps.js';
import { commitsCommand } from './commands/commits.js';
import { cleanCommand } from './commands/clean.js';
import { snapshotCommand } from './commands/snapshot.js';
import { bundleCommand } from './commands/bundle.js';
import { watchCommand } from './commands/watch.js';
import { completionsCommand } from './commands/completions.js';
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
  .alias('checkup')
  .description('Check the project for setup problems and explain each one.')
  .option('--json', 'print warnings as JSON')
  .option('--fix', 'apply every safe automatic fix, then re-check')
  .option(
    '--fail-on <severity>',
    'exit nonzero when warnings at or above this severity exist (error|warning|info|never)',
    'never'
  )
  .action((options: { json?: boolean; failOn: string; fix?: boolean }) => {
    const failOn = ['error', 'warning', 'info', 'never'].includes(options.failOn)
      ? (options.failOn as 'error' | 'warning' | 'info' | 'never')
      : 'never';
    handle(doctorCommand(process.cwd(), { json: options.json, failOn, fix: options.fix }), {
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
  .alias('guide')
  .description('Print a guided setup checklist with readiness score.')
  .action(() => {
    handle(onboardCommand(process.cwd()));
  });

program
  .command('quickstart')
  .alias('firstrun')
  .description('Print a numbered first-run recipe: exact commands, in order, with reasons.')
  .option('--json', 'print the steps as JSON')
  .action((options: { json?: boolean }) => {
    handle(quickstartCommand(process.cwd(), { json: options.json }), {
      updateNotice: options.json !== true
    });
  });

program
  .command('summary')
  .alias('about')
  .description('Explain this project in one plain-English paragraph plus a fact sheet.')
  .option('--json', 'print the summary as JSON')
  .action((options: { json?: boolean }) => {
    handle(summaryCommand(process.cwd(), { json: options.json }), {
      updateNotice: options.json !== true
    });
  });

program
  .command('tips')
  .description('Show friendly, project-aware tips for newcomers.')
  .option('--json', 'print tips as JSON')
  .action((options: { json?: boolean }) => {
    handle(tipsCommand(process.cwd(), { json: options.json }), {
      updateNotice: options.json !== true
    });
  });

program
  .command('learn')
  .alias('glossary')
  .argument('[term]', 'jargon to look up (omit for the full glossary)')
  .description('Look up developer jargon in a plain-English glossary.')
  .option('--json', 'print entries as JSON')
  .action((term: string | undefined, options: { json?: boolean }) => {
    handle(learnCommand(term, { json: options.json }), { updateNotice: options.json !== true });
  });

program
  .command('why')
  .alias('explain-error')
  .argument('[error...]', 'the error text to translate (or pipe output into this command)')
  .description('Translate a scary error message into plain English with a next step.')
  .action((parts: string[]) => {
    handle(whyCommand(parts), { updateNotice: false });
  });

program
  .command('system')
  .alias('check-computer')
  .description('Check whether this computer has the tools the project needs.')
  .option('--json', 'print the report as JSON')
  .action((options: { json?: boolean }) => {
    handle(systemCommand(process.cwd(), { json: options.json }), {
      updateNotice: options.json !== true
    });
  });

program
  .command('search')
  .alias('find')
  .argument('<query>', 'text to look for')
  .description(
    'Search everything DevSurface knows here: scripts, env keys, ports, services, glossary.'
  )
  .action((query: string) => {
    handle(searchCommand(query, process.cwd()));
  });

program
  .command('notes')
  .argument('[action]', 'add | done | remove | clear-done (omit to list)')
  .argument('[args...]', 'note text, or the note number')
  .description('Keep personal notes and checklists for this project (stored outside the repo).')
  .option('--check', 'with "add": save the note as a checklist item')
  .option('--json', 'print notes as JSON')
  .action(
    (action: string | undefined, args: string[], options: { check?: boolean; json?: boolean }) => {
      handle(notesCommand(action, args, options), { updateNotice: options.json !== true });
    }
  );

program
  .command('todos')
  .alias('todo')
  .description('List every TODO, FIXME, and HACK comment left in the code.')
  .option('--json', 'print the report as JSON')
  .action((options: { json?: boolean }) => {
    handle(todosCommand(process.cwd(), { json: options.json }), {
      updateNotice: options.json !== true
    });
  });

program
  .command('stats')
  .description('Show code statistics: lines by language, file counts, largest files.')
  .option('--json', 'print statistics as JSON')
  .action((options: { json?: boolean }) => {
    handle(statsCommand(process.cwd(), { json: options.json }), {
      updateNotice: options.json !== true
    });
  });

program
  .command('deps')
  .alias('dependencies')
  .description('Explain every installed dependency in one line, with a license rollup.')
  .option('--licenses', 'show the license report instead of the package list')
  .option('--json', 'print the report as JSON')
  .action((options: { json?: boolean; licenses?: boolean }) => {
    handle(depsCommand(process.cwd(), options), { updateNotice: options.json !== true });
  });

program
  .command('commits')
  .alias('log')
  .description('Show recent commits, contributors, and uncommitted changes, human-first.')
  .option('-n, --limit <count>', 'number of commits to show', (value) => Number(value), 15)
  .option('--json', 'print insights as JSON')
  .action((options: { json?: boolean; limit: number }) => {
    handle(commitsCommand(process.cwd(), options), { updateNotice: options.json !== true });
  });

program
  .command('clean')
  .description('Show how much space regenerable folders take; delete only on request.')
  .option('--delete <name>', 'delete one folder from the safe-to-delete list')
  .option('--yes', 'skip the confirmation prompt')
  .option('--json', 'print the report as JSON')
  .action((options: { json?: boolean; delete?: string; yes?: boolean }) => {
    handle(cleanCommand(process.cwd(), options), { updateNotice: options.json !== true });
  });

program
  .command('snapshot')
  .argument('[action]', 'save | diff | list | clear (default: save)')
  .argument('[label...]', 'optional label for a saved snapshot')
  .description('Freeze what the project looks like now; "diff" tells you what changed since.')
  .option('--json', 'print snapshots or the diff as JSON')
  .action((action: string | undefined, label: string[], options: { json?: boolean }) => {
    handle(snapshotCommand(action, label, options), { updateNotice: options.json !== true });
  });

program
  .command('bundle')
  .alias('help-bundle')
  .description(
    'Write a shareable Markdown help bundle: summary, health, machine info, recent runs.'
  )
  .option('-o, --out <file>', 'output file path ("-" for stdout)', 'devsurface-help.md')
  .action((options: { out: string }) => {
    handle(bundleCommand(process.cwd(), options), { updateNotice: options.out !== '-' });
  });

program
  .command('watch')
  .description('Live terminal status view: ports, services, and health, refreshed every 5s.')
  .action(() => {
    handle(watchCommand(process.cwd()), { updateNotice: false });
  });

program
  .command('completions')
  .argument('<shell>', 'bash | zsh | powershell')
  .description('Print a tab-completion script for your shell.')
  .action((shell: string) => {
    handle(completionsCommand(shell), { updateNotice: false });
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
