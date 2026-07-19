import pc from 'picocolors';
import { buildStandup } from '../../core/standup/index.js';
import { safeTerminalText } from '../terminal.js';

function relativeDay(dayIso: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  if (dayIso === today) return 'Today';
  if (dayIso === yesterday) return 'Yesterday';
  return dayIso;
}

/** `devsurface standup` — your recent commits, grouped by day, plus work in progress. */
export async function standupCommand(
  cwd = process.cwd(),
  options: { json?: boolean; days?: number; mine?: boolean } = {}
): Promise<void> {
  const report = await buildStandup(cwd, {
    sinceDays: options.days ?? 1,
    mineOnly: options.mine
  });

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (!report.available) {
    console.log('No git history here, so there is nothing to report.');
    return;
  }

  const scope = report.author !== null ? `${report.author}, ` : '';
  console.log(
    pc.bold(`${scope}${report.totalCommits} commit(s) in the last ${report.sinceDays} day(s)\n`)
  );

  if (report.days.length === 0) {
    console.log(pc.dim('No commits in the window.'));
  }
  for (const day of report.days) {
    console.log(pc.bold(pc.cyan(relativeDay(day.date))));
    for (const commit of day.commits) {
      console.log(`  ${pc.dim(commit.hash)}  ${safeTerminalText(commit.subject)}`);
    }
  }

  if (report.inProgress.length > 0) {
    console.log(pc.bold('\nStill in progress (uncommitted):'));
    for (const file of report.inProgress.slice(0, 15)) {
      console.log(`  ${pc.yellow(safeTerminalText(file))}`);
    }
  }
}
