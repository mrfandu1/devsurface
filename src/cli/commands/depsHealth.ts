import pc from 'picocolors';
import { checkDepsHealth } from '../../core/deps/health.js';
import { formatBytes } from '../../core/stats/index.js';
import { scanProject } from '../../core/scanner/index.js';

/** `devsurface deps-health` — heaviest packages, duplicates, unused, and phantom deps. */
export async function depsHealthCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  const report = await checkDepsHealth(cwd, scan.packageJson);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const size =
    report.nodeModulesBytes === null ? 'not installed' : formatBytes(report.nodeModulesBytes);
  console.log(
    pc.bold(`${report.installedPackageCount} packages installed · node_modules ${size}\n`)
  );

  if (report.heaviest.length > 0) {
    console.log(pc.bold('Heaviest packages:'));
    for (const pkg of report.heaviest.slice(0, 10)) {
      console.log(`  ${formatBytes(pkg.bytes).padStart(9)}  ${pkg.name}`);
    }
  }

  if (report.duplicates.length > 0) {
    console.log(pc.bold(pc.yellow('\nInstalled at multiple versions:')));
    for (const dup of report.duplicates.slice(0, 10)) {
      console.log(`  ${pc.cyan(dup.name)} — ${dup.versions.join(', ')}`);
    }
  }

  if (report.unused.length > 0) {
    console.log(pc.bold('\nDeclared but never imported (possible to remove):'));
    console.log('  ' + report.unused.map((name) => pc.dim(name)).join(', '));
  }

  if (report.phantom.length > 0) {
    console.log(pc.bold(pc.red('\nImported but not declared (phantom dependencies):')));
    console.log('  ' + report.phantom.join(', '));
    console.log(pc.dim('  These only work by accident — add them to package.json.'));
  }
}
