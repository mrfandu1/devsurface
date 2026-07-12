import pc from 'picocolors';
import { exploreDependencies } from '../../core/deps/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalText } from '../terminal.js';

/** `devsurface deps` — what is installed, described in one line each. */
export async function depsCommand(
  cwd = process.cwd(),
  options: { json?: boolean; licenses?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  const report = await exploreDependencies(cwd, scan.packageJson);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (options.licenses === true) {
    console.log(pc.bold('License report (installed packages):\n'));
    for (const license of report.licenses) {
      console.log(
        `  ${pc.cyan(license.license.padEnd(24))} ${license.count} package${license.count === 1 ? '' : 's'}`
      );
    }
    return;
  }

  if (report.entries.length === 0) {
    console.log('This project declares no dependencies.');
    return;
  }

  console.log(
    pc.bold(`${report.runtimeCount} runtime + ${report.devCount} development dependencies:\n`)
  );
  for (const entry of report.entries) {
    const version =
      entry.installed === null ? pc.red('not installed') : pc.dim(`v${entry.installed}`);
    const kind = entry.dev ? pc.dim(' (dev)') : '';
    console.log(`${pc.cyan(safeTerminalText(entry.name))} ${version}${kind}`);
    if (entry.description !== null) {
      console.log(`  ${pc.dim(safeTerminalText(entry.description))}`);
    }
  }
  if (report.missing.length > 0) {
    console.log(
      pc.yellow(
        `\n${report.missing.length} package${report.missing.length === 1 ? ' is' : 's are'} declared but not installed — run the install command.`
      )
    );
  }
  console.log(pc.dim('\nLicense rollup: devsurface deps --licenses'));
}
