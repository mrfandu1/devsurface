import pc from 'picocolors';
import { explainScript } from '../../core/explain/index.js';
import { searchGlossary } from '../../core/glossary/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalText } from '../terminal.js';

/**
 * `devsurface search <query>` — one search box over everything DevSurface
 * knows about the project: scripts, configured commands, env keys, ports,
 * Docker services, and the glossary.
 */
export async function searchCommand(query: string, cwd = process.cwd()): Promise<void> {
  const wanted = query.trim().toLowerCase();
  if (wanted.length === 0) {
    console.error('Give me something to search for: devsurface search <query>');
    process.exitCode = 1;
    return;
  }

  const scan = await scanProject(cwd);
  let total = 0;

  const scripts = Object.entries(scan.scripts).filter(
    ([name, command]) =>
      name.toLowerCase().includes(wanted) || command.toLowerCase().includes(wanted)
  );
  if (scripts.length > 0) {
    console.log(pc.bold('Scripts'));
    for (const [name, command] of scripts) {
      console.log(
        `  ${pc.cyan(safeTerminalText(name).padEnd(20))} ${pc.dim(explainScript(name, command))}`
      );
    }
    total += scripts.length;
  }

  const commands = Object.entries({
    ...scan.presetCommands,
    ...(scan.config?.config.commands ?? {})
  }).filter(
    ([name, command]) =>
      name.toLowerCase().includes(wanted) || command.toLowerCase().includes(wanted)
  );
  if (commands.length > 0) {
    console.log(pc.bold('\nConfigured commands'));
    for (const [name, command] of commands) {
      console.log(
        `  ${pc.cyan(safeTerminalText(name).padEnd(20))} ${pc.dim(safeTerminalText(command))}`
      );
    }
    total += commands.length;
  }

  const envKeys = (scan.env?.keys ?? []).filter((key) => key.key.toLowerCase().includes(wanted));
  if (envKeys.length > 0) {
    console.log(pc.bold('\nEnvironment keys (values never shown)'));
    for (const key of envKeys) {
      const state = key.present
        ? key.empty
          ? pc.yellow('empty')
          : pc.green('set')
        : pc.red('missing');
      console.log(`  ${pc.cyan(safeTerminalText(key.key).padEnd(28))} ${state}`);
    }
    total += envKeys.length;
  }

  const ports = scan.ports.filter((probe) => String(probe.port).includes(wanted));
  if (ports.length > 0) {
    console.log(pc.bold('\nPorts'));
    for (const probe of ports) {
      console.log(
        `  ${pc.cyan(String(probe.port))} ${probe.inUse ? pc.yellow('in use') : pc.green('free')}`
      );
    }
    total += ports.length;
  }

  const services = (scan.docker?.services ?? []).filter((service) =>
    service.name.toLowerCase().includes(wanted)
  );
  if (services.length > 0) {
    console.log(pc.bold('\nDocker services'));
    for (const service of services) {
      console.log(`  ${pc.cyan(safeTerminalText(service.name))} ${pc.dim(service.status)}`);
    }
    total += services.length;
  }

  const glossary = searchGlossary(wanted).slice(0, 5);
  if (glossary.length > 0) {
    console.log(pc.bold('\nFrom the glossary'));
    for (const entry of glossary) {
      console.log(`  ${pc.cyan(entry.term.padEnd(20))} ${pc.dim(entry.definition)}`);
    }
    total += glossary.length;
  }

  if (total === 0) {
    console.log(`Nothing in this project mentions "${safeTerminalText(query)}".`);
  }
}
