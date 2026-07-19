import pc from 'picocolors';
import { exploreEnvUsage } from '../../core/env/usage.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalText } from '../terminal.js';

/** `devsurface env usage` — where each env variable is read, plus unused/undocumented keys. */
export async function envUsageCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  const report = await exploreEnvUsage(cwd, scan.env);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(
    pc.bold(
      `${report.used.length} env variable(s) read across ${report.scannedFiles} source files.\n`
    )
  );

  for (const entry of report.used.slice(0, 40)) {
    const flags: string[] = [];
    if (!entry.declaredInExample) flags.push(pc.yellow('undocumented'));
    if (!entry.declaredInLocal) flags.push(pc.dim('not in .env'));
    const site = entry.sites[0];
    const where = site !== undefined ? pc.dim(`${safeTerminalText(site.file)}:${site.line}`) : '';
    console.log(
      `  ${pc.cyan(entry.key.padEnd(28))} ${String(entry.count).padStart(3)}× ${where} ${flags.join(' ')}`
    );
  }

  if (report.unused.length > 0) {
    console.log(pc.bold('\nDeclared but never read (dead settings):'));
    console.log('  ' + report.unused.map((key) => pc.dim(key)).join(', '));
  }
  if (report.undocumented.length > 0) {
    console.log(pc.bold('\nRead in code but missing from .env.example:'));
    console.log('  ' + report.undocumented.map((key) => pc.yellow(key)).join(', '));
  }
}
