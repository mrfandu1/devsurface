import pc from 'picocolors';
import { runDoctor } from '../../core/doctor/index.js';
import { buildOnboardingPlan } from '../../core/onboarding/index.js';
import { scanProject } from '../../core/scanner/index.js';
import type { OnboardingStep } from '../../core/types.js';
import { safeTerminalText } from '../terminal.js';

function statusGlyph(status: OnboardingStep['status']): string {
  if (status === 'done') {
    return pc.green('[x]');
  }

  if (status === 'todo') {
    return pc.yellow('[ ]');
  }

  return pc.cyan('[~]');
}

export async function onboardCommand(cwd = process.cwd()): Promise<void> {
  const scan = await scanProject(cwd);
  const warnings = await runDoctor(cwd, scan);
  const plan = buildOnboardingPlan(scan, warnings);

  console.log(pc.bold(`Onboarding ${safeTerminalText(scan.projectName)}`));
  console.log(`${plan.readiness}% ready — ${safeTerminalText(plan.summary)}`);
  console.log('');

  if (plan.steps.length === 0) {
    console.log(pc.green('No onboarding steps detected.'));
    return;
  }

  for (const step of plan.steps) {
    console.log(`${statusGlyph(step.status)} ${pc.bold(safeTerminalText(step.title))}`);
    console.log(`    ${safeTerminalText(step.description)}`);
    if (step.action && step.status !== 'done') {
      console.log(pc.dim(`    → ${safeTerminalText(step.action.label)}`));
    }
  }
}
