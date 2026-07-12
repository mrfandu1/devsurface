import pc from 'picocolors';
import { buildFactSheet, buildPlainSummary } from '../../core/summary/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalText } from '../terminal.js';

/** `devsurface summary` — the project explained in one friendly paragraph. */
export async function summaryCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  const summary = buildPlainSummary(scan);
  const facts = buildFactSheet(scan);

  if (options.json === true) {
    console.log(JSON.stringify({ summary, facts }, null, 2));
    return;
  }

  console.log(pc.bold('In plain English:\n'));
  console.log(safeTerminalText(summary));
  console.log('');
  console.log(pc.bold('Fact sheet:'));
  const widest = Math.max(...facts.map((fact) => fact.label.length));
  for (const fact of facts) {
    console.log(`  ${pc.dim(fact.label.padEnd(widest))}  ${safeTerminalText(fact.value)}`);
  }
}
