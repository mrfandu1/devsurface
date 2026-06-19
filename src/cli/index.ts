#!/usr/bin/env node
import { Command } from 'commander';
import { doctorCommand } from './commands/doctor.js';
import { initCommand } from './commands/init.js';
import { runCommand } from './commands/run.js';
import { scanCommand } from './commands/scan.js';
import { startCommand } from './commands/start.js';

const program = new Command();

function toPort(value: string): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error('Port must be an integer between 1 and 65535.');
  }

  return port;
}

function handle(command: Promise<void>): void {
  command.catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}

program
  .name('devsurface')
  .description('Turn any Node.js repository into a local developer control panel.')
  .version('0.1.0')
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
  .command('scan')
  .description('Print detected project info.')
  .action(() => {
    handle(scanCommand(process.cwd()));
  });

program
  .command('doctor')
  .description('Print setup health warnings.')
  .action(() => {
    handle(doctorCommand(process.cwd()));
  });

program
  .command('init')
  .description('Create a starter devsurface.config.json.')
  .action(() => {
    handle(initCommand(process.cwd()));
  });

program
  .command('run')
  .argument('<script>', 'package.json script to run')
  .description('Run a package script and stream logs.')
  .action((script: string) => {
    handle(runCommand(script, process.cwd()));
  });

await program.parseAsync(process.argv);
