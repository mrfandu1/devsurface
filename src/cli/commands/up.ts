import pc from 'picocolors';
import { describeLaunchStep, resolveLaunchPlan } from '../../core/launch/index.js';
import {
  runConfiguredCommandToTerminal,
  runPackageScriptToTerminal
} from '../../core/process/runner.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalText } from '../terminal.js';

/**
 * Run the project's launch sequence: Compose services first, then scripts,
 * in order. From `launch` in devsurface.config.json when present, otherwise
 * derived from detection (docker + dev/start).
 */
export async function upCommand(
  cwd = process.cwd(),
  options: { dryRun?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  const plan = resolveLaunchPlan(scan);

  if (plan.steps.length === 0) {
    console.log(
      'Nothing to launch: no Compose services, no dev/start script, and no "launch" config.'
    );
    return;
  }

  console.log(
    pc.bold(
      `Launch sequence for ${safeTerminalText(scan.projectName)} (${plan.fromConfig ? 'from config' : 'detected'}):`
    )
  );
  plan.steps.forEach((step, index) => {
    console.log(`  ${index + 1}. ${safeTerminalText(describeLaunchStep(step))}`);
  });
  for (const entry of plan.unknown) {
    console.log(pc.yellow(`  skipped unknown launch entry "${safeTerminalText(entry)}"`));
  }

  if (options.dryRun === true) {
    console.log(pc.dim('\nDry run — nothing was started.'));
    return;
  }

  for (const step of plan.steps) {
    console.log(pc.bold(`\n> ${safeTerminalText(describeLaunchStep(step))}`));
    let exitCode: number | null;
    if (step.kind === 'docker') {
      exitCode = await runConfiguredCommandToTerminal({
        cwd: scan.root,
        command: 'docker compose up -d'
      });
    } else if (step.kind === 'script') {
      exitCode = await runPackageScriptToTerminal({
        cwd: scan.root,
        packageManager: scan.packageManager,
        script: step.name
      });
    } else {
      exitCode = await runConfiguredCommandToTerminal({ cwd: scan.root, command: step.command });
    }

    if (exitCode !== 0) {
      console.error(
        pc.red(
          `\nLaunch stopped: "${safeTerminalText(describeLaunchStep(step))}" exited with ${exitCode ?? 'an error'}.`
        )
      );
      process.exitCode = exitCode ?? 1;
      return;
    }
  }
}
