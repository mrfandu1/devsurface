import { promises as fs } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { renderReadinessBadge } from '../../core/badge/index.js';
import { runDoctor } from '../../core/doctor/index.js';
import { buildOnboardingPlan } from '../../core/onboarding/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalText } from '../terminal.js';

/** Generate a shields-style SVG badge with the project's readiness score. */
export async function badgeCommand(
  cwd = process.cwd(),
  outFile?: string,
  options: { score?: boolean; label?: string } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  const warnings = await runDoctor(cwd, scan);
  const plan = buildOnboardingPlan(scan, warnings);

  if (options.score === true) {
    console.log(String(plan.readiness));
    return;
  }

  const svg = renderReadinessBadge(plan.readiness, options.label ?? 'devsurface');

  const target = path.resolve(cwd, outFile ?? 'devsurface-readiness.svg');
  await fs.writeFile(target, svg, 'utf8');

  console.log(pc.bold(`Setup readiness: ${plan.readiness}%`));
  console.log(`Badge saved to ${safeTerminalText(target)}`);
  console.log(pc.dim('Embed it in your README to show contributors the project is runnable.'));
}
