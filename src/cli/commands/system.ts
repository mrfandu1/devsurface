import pc from 'picocolors';
import { checkSystem } from '../../core/system/index.js';
import { scanProject } from '../../core/scanner/index.js';

/** `devsurface system` — "is my computer ready?" in plain English. */
export async function systemCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd).catch(() => undefined);
  const report = await checkSystem(scan);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(pc.bold('Your computer:'));
  console.log(
    `  ${report.osName} (${report.arch}) · ${report.cpuCount} CPU cores · ${report.totalMemoryGb} GB RAM (${report.freeMemoryGb} GB free)\n`
  );
  console.log(pc.bold('Developer tools:'));
  for (const check of report.checks) {
    const glyph =
      check.ok === true ? pc.green('✔') : check.ok === false ? pc.red('✖') : pc.dim('—');
    console.log(`  ${glyph} ${check.label.padEnd(14)} ${check.detail}`);
    if (check.hint !== undefined) {
      console.log(pc.dim(`      ${check.hint}`));
    }
  }
  console.log('');
  console.log(pc.bold(report.verdict));
}
