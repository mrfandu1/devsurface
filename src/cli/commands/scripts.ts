import pc from 'picocolors';
import { analyzeScripts } from '../../core/scripts/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalText } from '../terminal.js';

/** `devsurface scripts` — explain package scripts: chains, hooks, and portability issues. */
export async function scriptsCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  const report = await analyzeScripts(cwd, scan.scripts);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (report.insights.length === 0) {
    console.log('No package scripts found.');
    return;
  }

  console.log(pc.bold(`${report.insights.length} script(s):\n`));
  for (const insight of report.insights) {
    console.log(`  ${pc.cyan(insight.name.padEnd(18))} ${pc.dim(`[${insight.category}]`)}`);
    console.log(`    ${safeTerminalText(insight.command).slice(0, 100)}`);
    if (insight.calls.length > 0) {
      console.log(pc.dim(`    → runs: ${insight.calls.join(', ')}`));
    }
    if (insight.hooks.length > 0) {
      console.log(pc.dim(`    ↻ auto-runs: ${insight.hooks.join(', ')}`));
    }
    for (const issue of insight.issues) {
      console.log(pc.yellow(`    ⚠ ${issue}`));
    }
  }

  if (report.missingReferences.length > 0) {
    console.log(pc.bold(pc.red('\nBroken references:')));
    for (const ref of report.missingReferences) {
      console.log(`  "${ref.script}" calls "${ref.missing}", which does not exist.`);
    }
  }
  if (report.orphans.length > 0) {
    console.log(pc.bold('\nNothing references these (prune candidates):'));
    console.log('  ' + report.orphans.map((name) => pc.dim(name)).join(', '));
  }
}
