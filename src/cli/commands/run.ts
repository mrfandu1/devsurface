import pc from 'picocolors';
import { runPackageScriptToTerminal } from '../../core/process/runner.js';
import { scanProject } from '../../core/scanner/index.js';

export async function runCommand(script: string, cwd = process.cwd()): Promise<void> {
  const scan = await scanProject(cwd);

  if (scan.packageJson === null) {
    console.error(pc.red('No package.json was found in this directory.'));
    process.exitCode = 1;
    return;
  }

  if (scan.scripts[script] === undefined) {
    console.error(pc.red(`Script "${script}" was not found in package.json.`));
    process.exitCode = 1;
    return;
  }

  const exitCode = await runPackageScriptToTerminal({
    cwd,
    packageManager: scan.packageManager,
    script
  });
  process.exitCode = exitCode;
}
