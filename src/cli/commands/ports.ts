import pc from 'picocolors';
import { freePort } from '../../core/ports/free.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalText } from '../terminal.js';

/** Terminate whatever is listening on `port` (explicit user request). */
export async function freePortCommand(port: number): Promise<void> {
  const result = await freePort(port);
  if (result.freed) {
    const owner =
      result.name === null
        ? `PID ${result.pid}`
        : `${safeTerminalText(result.name)} (PID ${result.pid})`;
    console.log(pc.green(`Freed port ${port} — stopped ${owner}.`));
    return;
  }
  throw new Error(result.error ?? `Unable to free port ${port}.`);
}

export async function portsCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);

  if (options.json === true) {
    console.log(JSON.stringify(scan.ports, null, 2));
    return;
  }

  if (scan.ports.length === 0) {
    console.log('No configured or inferred ports for this project.');
    return;
  }

  for (const port of scan.ports) {
    if (!port.inUse) {
      console.log(`${pc.green('free')}    ${port.port}  http://localhost:${port.port}`);
      continue;
    }

    const owner =
      port.owner == null
        ? 'unknown process'
        : port.owner.name === null
          ? `PID ${port.owner.pid}`
          : `${safeTerminalText(port.owner.name)} (PID ${port.owner.pid})`;
    const suggestion =
      typeof port.suggestedFreePort === 'number' ? ` — try ${port.suggestedFreePort}` : '';
    console.log(`${pc.red('in use')}  ${port.port}  by ${owner}${suggestion}`);
  }
}
