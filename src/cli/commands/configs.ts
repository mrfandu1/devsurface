import pc from 'picocolors';
import { inspectConfigs } from '../../core/configs/index.js';
import { formatBytes } from '../../core/stats/index.js';

/** `devsurface configs` — list config files and validate the JSON ones. */
export async function configsCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const report = await inspectConfigs(cwd);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (report.files.length === 0) {
    console.log('No recognizable config files found at the repo root.');
    return;
  }

  console.log(pc.bold(`${report.files.length} config file(s):\n`));
  for (const file of report.files) {
    const status = file.valid ? pc.green('✓') : pc.red('✗');
    console.log(
      `  ${status} ${pc.cyan(file.file.padEnd(26))} ${pc.dim(file.label.padEnd(22))} ${pc.dim(formatBytes(file.bytes))}`
    );
    if (!file.valid && file.problem !== undefined) {
      console.log(pc.red(`      ${file.problem}`));
    }
  }

  if (report.invalid.length > 0) {
    console.log(pc.bold(pc.red(`\n${report.invalid.length} file(s) failed validation.`)));
    process.exitCode = 1;
  }
}
