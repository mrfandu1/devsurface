import pc from 'picocolors';
import { scanSecrets } from '../../core/secrets/index.js';
import { safeTerminalText } from '../terminal.js';

/** `devsurface secrets` — scan source files for accidentally committed credentials. */
export async function secretsCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const report = await scanSecrets(cwd);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (report.clean) {
    console.log(
      pc.green(`No hardcoded secrets found across ${report.scannedFiles} scanned files.`)
    );
    return;
  }

  const critical = report.findings.filter((finding) => finding.severity === 'critical').length;
  console.log(
    pc.bold(
      pc.red(
        `Found ${report.findings.length} possible secret(s) — ${critical} critical. Values are redacted below.\n`
      )
    )
  );

  let lastFile = '';
  for (const finding of report.findings) {
    if (finding.file !== lastFile) {
      console.log(pc.bold(safeTerminalText(finding.file)));
      lastFile = finding.file;
    }
    const tag = finding.severity === 'critical' ? pc.red('CRITICAL') : pc.yellow('warning ');
    console.log(
      `  ${pc.dim(String(finding.line).padStart(5))}  ${tag}  ${pc.bold(finding.kind)}  ${pc.dim(finding.preview)}`
    );
    console.log(`         ${pc.dim(finding.advice)}`);
  }
  if (report.truncated) {
    console.log(pc.dim('\n(The list was capped — there may be more.)'));
  }
  process.exitCode = critical > 0 ? 1 : 0;
}
