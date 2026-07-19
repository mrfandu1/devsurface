import pc from 'picocolors';
import { analyzeCi } from '../../core/ci/index.js';
import { scanProject } from '../../core/scanner/index.js';

/** `devsurface ci` — explain the CI pipelines and check they match local scripts. */
export async function ciCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  const report = await analyzeCi(cwd, scan.scripts);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (!report.configured) {
    console.log('No CI configuration found (GitHub Actions, GitLab CI, CircleCI, …).');
    return;
  }

  console.log(pc.bold(`${report.workflows.length} CI workflow(s):\n`));
  for (const workflow of report.workflows) {
    console.log(`  ${pc.cyan(workflow.name ?? workflow.file)} ${pc.dim(`(${workflow.provider})`)}`);
    if (workflow.triggers.length > 0) {
      console.log(pc.dim(`    triggers: ${workflow.triggers.join(', ')}`));
    }
    if (workflow.jobs.length > 0) {
      console.log(pc.dim(`    jobs: ${workflow.jobs.join(', ')}`));
    }
    if (workflow.scriptsUsed.length > 0) {
      console.log(pc.dim(`    runs scripts: ${workflow.scriptsUsed.join(', ')}`));
    }
  }

  if (report.missingScripts.length > 0) {
    console.log(pc.bold(pc.red('\nCI runs scripts that package.json does not define:')));
    console.log('  ' + report.missingScripts.join(', '));
  }
  if (report.uncheckedScripts.length > 0) {
    console.log(pc.bold(pc.yellow('\nQuality scripts that no workflow runs:')));
    console.log('  ' + report.uncheckedScripts.join(', '));
    console.log(pc.dim('  Consider adding these to CI so they can’t regress.'));
  }
}
