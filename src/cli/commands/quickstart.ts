import pc from 'picocolors';
import { buildQuickstart } from '../../core/quickstart/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalText } from '../terminal.js';

/** `devsurface quickstart` — a numbered first-run recipe with exact commands. */
export async function quickstartCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  const steps = await buildQuickstart(scan);

  if (options.json === true) {
    console.log(JSON.stringify(steps, null, 2));
    return;
  }

  console.log(pc.bold(`Getting ${safeTerminalText(scan.projectName)} running, step by step:\n`));
  steps.forEach((step, index) => {
    const marker = step.done === true ? pc.green('✔ done') : pc.cyan(`step ${index + 1}`);
    console.log(`${marker}  ${pc.bold(safeTerminalText(step.title))}`);
    console.log(`        ${pc.dim(safeTerminalText(step.why))}`);
    if (step.command !== undefined) {
      console.log(`        ${pc.yellow('$')} ${safeTerminalText(step.command)}`);
    }
    console.log('');
  });
  console.log(pc.dim('Stuck on an error? Paste it into: devsurface why "<the error text>"'));
}
