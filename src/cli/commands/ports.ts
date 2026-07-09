import pc from 'picocolors';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalText } from '../terminal.js';

export async function portsCommand(cwd = process.cwd()): Promise<void> {
  const scan = await scanProject(cwd);

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
