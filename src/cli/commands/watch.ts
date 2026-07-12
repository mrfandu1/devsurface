import pc from 'picocolors';
import { portLabel } from '../../core/ports/knowledge.js';
import { scanProject } from '../../core/scanner/index.js';
import { runDoctor } from '../../core/doctor/index.js';
import { safeTerminalText } from '../terminal.js';

const REFRESH_SECONDS = 5;

async function renderOnce(cwd: string): Promise<string[]> {
  const scan = await scanProject(cwd);
  const warnings = await runDoctor(cwd, scan);
  const lines: string[] = [];
  lines.push(
    pc.bold(
      `${safeTerminalText(scan.projectName)} — live status (updates every ${REFRESH_SECONDS}s, Ctrl+C to stop)`
    )
  );
  lines.push(pc.dim(new Date().toLocaleTimeString()));
  lines.push('');

  lines.push(pc.bold('Ports:'));
  if (scan.ports.length === 0) {
    lines.push(pc.dim('  none detected'));
  }
  for (const probe of scan.ports) {
    const label = portLabel(probe.port);
    const name = label === null ? '' : pc.dim(` (${label})`);
    lines.push(
      probe.inUse
        ? `  ${pc.yellow('●')} ${probe.port}${name} ${pc.yellow('in use')}`
        : `  ${pc.green('○')} ${probe.port}${name} free`
    );
  }

  const services = scan.docker?.services ?? [];
  if (services.length > 0) {
    lines.push('');
    lines.push(pc.bold('Docker services:'));
    for (const service of services) {
      const glyph = service.status === 'running' ? pc.green('●') : pc.dim('○');
      lines.push(`  ${glyph} ${safeTerminalText(service.name)} ${pc.dim(service.status)}`);
    }
  }

  lines.push('');
  const errors = warnings.filter((warning) => warning.severity === 'error');
  const others = warnings.length - errors.length;
  lines.push(
    pc.bold('Health: ') +
      (warnings.length === 0
        ? pc.green('all clear')
        : `${errors.length > 0 ? pc.red(`${errors.length} error${errors.length === 1 ? '' : 's'}`) : ''}${errors.length > 0 && others > 0 ? ', ' : ''}${others > 0 ? pc.yellow(`${others} warning${others === 1 ? '' : 's'}`) : ''}`)
  );
  for (const warning of errors.slice(0, 3)) {
    lines.push(pc.red(`  ✖ ${safeTerminalText(warning.title)}`));
  }
  return lines;
}

/**
 * `devsurface watch` — a live, self-refreshing status view in the terminal:
 * ports, Docker services, and health, redrawn every few seconds.
 */
export async function watchCommand(cwd = process.cwd()): Promise<void> {
  if (!process.stdout.isTTY) {
    // Not a terminal: print one status frame and exit rather than looping.
    console.log((await renderOnce(cwd)).join('\n'));
    return;
  }

  let running = true;
  process.on('SIGINT', () => {
    running = false;
    process.stdout.write('\n');
    process.exit(0);
  });

  while (running) {
    const lines = await renderOnce(cwd);
    console.clear();
    console.log(lines.join('\n'));
    await new Promise((resolve) => setTimeout(resolve, REFRESH_SECONDS * 1000));
  }
}
