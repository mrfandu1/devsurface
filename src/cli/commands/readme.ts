import pc from 'picocolors';
import { scoreReadme } from '../../core/readme/index.js';

/** `devsurface readme` — grade the README and suggest what to add. */
export async function readmeCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const report = await scoreReadme(cwd);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const color = report.score >= 80 ? pc.green : report.score >= 55 ? pc.yellow : pc.red;
  console.log(pc.bold(color(`README grade: ${report.grade} (${report.score}/100)`)));
  if (report.exists) {
    console.log(pc.dim(`${report.wordCount} words · ${report.headingCount} headings\n`));
  } else {
    console.log(pc.dim('No README found.\n'));
  }

  console.log(pc.bold('Checks:'));
  for (const check of report.checks) {
    const mark = check.passed ? pc.green('✓') : pc.red('✗');
    console.log(`  ${mark} ${check.label} ${pc.dim(`(${check.weight} pts)`)}`);
  }

  if (report.suggestions.length > 0) {
    console.log(pc.bold('\nTo raise the grade:'));
    for (const suggestion of report.suggestions.slice(0, 5)) {
      console.log(`  • ${suggestion}`);
    }
  }
}
