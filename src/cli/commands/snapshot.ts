import pc from 'picocolors';
import { runDoctor } from '../../core/doctor/index.js';
import { buildOnboardingPlan } from '../../core/onboarding/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { digestScan, diffSnapshots, SnapshotStore } from '../../core/snapshots/index.js';
import { safeTerminalText } from '../terminal.js';

async function takeDigest(cwd: string, label: string) {
  const scan = await scanProject(cwd);
  const warnings = await runDoctor(cwd, scan);
  const plan = buildOnboardingPlan(scan, warnings);
  return digestScan(scan, {
    warningIds: warnings.map((warning) => warning.id),
    readiness: plan.readiness,
    label
  });
}

/**
 * `devsurface snapshot` — freeze what the project looks like today, then
 * `devsurface snapshot diff` answers "what changed since?" in plain English.
 */
export async function snapshotCommand(
  action: string | undefined,
  rest: string[],
  options: { json?: boolean } = {}
): Promise<void> {
  const store = new SnapshotStore();
  const cwd = process.cwd();

  if (action === undefined || action === 'save' || action === 'take') {
    const digest = await takeDigest(cwd, rest.join(' '));
    await store.save(cwd, digest);
    console.log(
      `Snapshot saved (${Object.keys(digest.scripts).length} scripts, ${Object.keys(digest.dependencies).length} dependencies, readiness ${digest.readiness ?? '?'}%).`
    );
    console.log(pc.dim('Later: devsurface snapshot diff'));
    return;
  }

  if (action === 'list') {
    const snapshots = await store.list(cwd);
    if (options.json === true) {
      console.log(JSON.stringify(snapshots, null, 2));
      return;
    }
    if (snapshots.length === 0) {
      console.log('No snapshots yet. Take one with: devsurface snapshot save');
      return;
    }
    snapshots.forEach((snapshot, index) => {
      console.log(
        `${pc.dim(String(index + 1).padStart(3))} ${snapshot.takenAt}  ${safeTerminalText(snapshot.label)}`
      );
    });
    return;
  }

  if (action === 'diff') {
    const previous = await store.latest(cwd);
    if (previous === null) {
      console.log('No snapshot to compare against. Take one first: devsurface snapshot save');
      return;
    }
    const current = await takeDigest(cwd, 'now');
    const diff = diffSnapshots(previous, current);
    if (options.json === true) {
      console.log(JSON.stringify(diff, null, 2));
      return;
    }
    console.log(pc.bold(`Since the snapshot from ${previous.takenAt}:\n`));
    for (const change of diff.changes) {
      console.log(`  • ${safeTerminalText(change)}`);
    }
    return;
  }

  if (action === 'clear') {
    await store.clear(cwd);
    console.log('Snapshots cleared for this project.');
    return;
  }

  console.error(`Unknown action "${safeTerminalText(action)}". Try: save, diff, list, clear.`);
  process.exitCode = 1;
}
