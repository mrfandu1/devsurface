import pc from 'picocolors';
import { analyzeTests } from '../../core/testinsights/index.js';
import { safeTerminalText } from '../terminal.js';

/** `devsurface tests` — a static read of the test suite: counts, skips, .only, gaps. */
export async function testInfoCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const report = await analyzeTests(cwd);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (report.totals.files === 0) {
    console.log('No test files found.');
    return;
  }

  const { totals } = report;
  console.log(
    pc.bold(
      `${totals.tests} tests in ${totals.files} files` +
        (totals.skipped > 0 ? ` · ${totals.skipped} skipped` : '') +
        (totals.todo > 0 ? ` · ${totals.todo} todo` : '')
    )
  );

  if (report.focusedFiles.length > 0) {
    console.log(
      pc.bold(
        pc.red(`\n⚠ ${totals.focused} focused test(s) (.only) — CI may be running only these:`)
      )
    );
    for (const file of report.focusedFiles) {
      console.log(`  ${safeTerminalText(file)}`);
    }
  }

  console.log(pc.bold('\nLargest test files:'));
  for (const file of report.files.slice(0, 8)) {
    console.log(`  ${String(file.tests).padStart(4)} tests  ${safeTerminalText(file.file)}`);
  }

  if (report.untestedSources.length > 0) {
    console.log(pc.bold('\nSource files with no matching test file:'));
    for (const file of report.untestedSources.slice(0, 12)) {
      console.log(`  ${pc.dim(safeTerminalText(file))}`);
    }
    if (report.truncated) {
      console.log(pc.dim('  (…and more)'));
    }
  }
}
