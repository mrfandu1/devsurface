import readline from 'node:readline';
import pc from 'picocolors';
import { buildCleanupReport, deleteCleanupTarget } from '../../core/cleanup/index.js';
import { formatBytes } from '../../core/stats/index.js';

function promptLine(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * `devsurface clean` — shows how much space regenerable folders take.
 * Nothing is deleted without `--delete <name>` (plus a confirmation when
 * running interactively). Only allowlisted, regenerable folders qualify.
 */
export async function cleanCommand(
  cwd = process.cwd(),
  options: { json?: boolean; delete?: string; yes?: boolean } = {}
): Promise<void> {
  if (options.delete !== undefined) {
    const name = options.delete;
    if (options.yes !== true && process.stdin.isTTY) {
      const answer = await promptLine(
        `Delete "${name}"? It is machine-generated and comes back after a build/install. (y/N) `
      );
      if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
        console.log('Nothing was deleted.');
        return;
      }
    }
    const result = await deleteCleanupTarget(cwd, name);
    if (result.deleted) {
      console.log(pc.green(`Deleted ${name} and reclaimed about ${formatBytes(result.bytes)}.`));
    } else {
      console.error(pc.yellow(`Did not delete ${name}: ${result.reason}`));
      process.exitCode = 1;
    }
    return;
  }

  const report = await buildCleanupReport(cwd);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  if (report.targets.length === 0) {
    console.log(pc.green('Nothing to clean — no regenerable folders were found.'));
    return;
  }

  console.log(
    pc.bold(
      `Reclaimable space: about ${formatBytes(report.totalBytes)} in ${report.targets.length} folder${report.targets.length === 1 ? '' : 's'}:\n`
    )
  );
  for (const target of report.targets) {
    console.log(`  ${target.name.padEnd(18)} ${formatBytes(target.bytes).padStart(10)}`);
    console.log(pc.dim(`    comes back via ${target.regeneratedBy}`));
  }
  console.log(
    pc.dim('\nDelete one with: devsurface clean --delete <name>   (asks before deleting)')
  );
}
