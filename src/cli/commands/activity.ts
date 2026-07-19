import pc from 'picocolors';
import { gatherActivity } from '../../core/git/activity.js';
import { safeTerminalText } from '../terminal.js';

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function sparkbar(value: number, max: number): string {
  if (max === 0) return '';
  const blocks = ' ▁▂▃▄▅▆▇█';
  const level = Math.round((value / max) * (blocks.length - 1));
  return blocks[level] ?? ' ';
}

/** `devsurface activity` — when this project gets worked on, and what changes most. */
export async function activityCommand(
  cwd = process.cwd(),
  options: { json?: boolean; days?: number } = {}
): Promise<void> {
  const report = await gatherActivity(cwd, options.days ?? 90);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (!report.available) {
    console.log('No git history here, so there is no activity to show.');
    return;
  }

  console.log(
    pc.bold(
      `${report.recentCommits} commits in the last ${report.windowDays} days` +
        (report.busiestWeekday !== null ? ` · busiest on ${report.busiestWeekday}` : '')
    )
  );
  if (report.repoAgeDays !== null) {
    console.log(pc.dim(`Repository is ${report.repoAgeDays} days old.`));
  }
  console.log(
    pc.dim(
      `Current streak: ${report.currentStreak} day(s) · longest: ${report.longestStreak} day(s)\n`
    )
  );

  const maxDay = Math.max(...report.byWeekday, 1);
  console.log(pc.bold('By weekday:'));
  for (let index = 0; index < 7; index += 1) {
    const count = report.byWeekday[index];
    const bar = '█'.repeat(Math.round((count / maxDay) * 20));
    console.log(`  ${WEEKDAY_ABBR[index]}  ${pc.cyan(bar)} ${pc.dim(String(count))}`);
  }

  const maxHour = Math.max(...report.byHour, 1);
  console.log(pc.bold('\nBy hour (0–23):'));
  console.log('  ' + report.byHour.map((count) => sparkbar(count, maxHour)).join(''));

  if (report.churn.length > 0) {
    console.log(pc.bold('\nMost-changed files:'));
    for (const entry of report.churn.slice(0, 8)) {
      console.log(`  ${String(entry.commits).padStart(4)}×  ${safeTerminalText(entry.file)}`);
    }
  }
}
