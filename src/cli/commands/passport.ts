import { promises as fs } from 'node:fs';
import path from 'node:path';
import open from 'open';
import pc from 'picocolors';
import { runDoctor } from '../../core/doctor/index.js';
import { buildOnboardingPlan } from '../../core/onboarding/index.js';
import { renderPassportHtml } from '../../core/passport/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { DEV_SURFACE_VERSION } from '../../version.js';
import { safeTerminalText } from '../terminal.js';

export async function passportCommand(
  cwd = process.cwd(),
  outFile?: string,
  options: { open?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  const warnings = await runDoctor(cwd, scan);
  const plan = buildOnboardingPlan(scan, warnings);
  const html = renderPassportHtml({ scan, warnings, plan, version: DEV_SURFACE_VERSION });

  // "-o -" streams the document to stdout for piping.
  if (outFile === '-') {
    console.log(html);
    return;
  }

  const target = path.resolve(cwd, outFile ?? 'devsurface-passport.html');
  await fs.writeFile(target, html, 'utf8');

  console.log(pc.bold(`Passport created for ${safeTerminalText(scan.projectName)}`));
  console.log(`Saved to ${safeTerminalText(target)}`);
  console.log(
    pc.dim('Open it in any browser or share it — it works offline and contains no secrets.')
  );

  if (options.open === true) {
    await open(target).catch(() => {
      console.log(pc.dim('Could not open a browser automatically — open the file manually.'));
    });
  }
}
