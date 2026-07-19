import pc from 'picocolors';
import { checkLinks } from '../../core/links/index.js';
import { safeTerminalText } from '../terminal.js';

/** `devsurface links` — verify every relative link in the Markdown docs resolves. */
export async function linksCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const report = await checkLinks(cwd);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(
    pc.bold(
      `Checked ${report.relativeLinks} relative link(s) across ${report.docsScanned} docs ` +
        `(${report.externalLinks} external links skipped).\n`
    )
  );

  if (report.broken.length === 0) {
    console.log(pc.green('Every relative link points at a real file.'));
    return;
  }

  console.log(pc.bold(pc.red(`${report.broken.length} broken link(s):`)));
  let lastSource = '';
  for (const link of report.broken) {
    if (link.source !== lastSource) {
      console.log(pc.bold(safeTerminalText(link.source)));
      lastSource = link.source;
    }
    console.log(
      `  ${pc.dim(String(link.line).padStart(5))}  ${pc.red(safeTerminalText(link.target))} — ${link.reason}`
    );
  }
  if (report.truncated) {
    console.log(pc.dim('\n(The list was capped — there may be more.)'));
  }
  process.exitCode = 1;
}
