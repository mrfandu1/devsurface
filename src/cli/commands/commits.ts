import pc from 'picocolors';
import { gatherGitInsights } from '../../core/git/insights.js';
import { safeTerminalText } from '../terminal.js';

function relativeDay(isoDate: string): string {
  const then = new Date(isoDate).getTime();
  if (!Number.isFinite(then)) {
    return '';
  }
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) {
    return 'today';
  }
  if (days === 1) {
    return 'yesterday';
  }
  if (days < 30) {
    return `${days} days ago`;
  }
  return new Date(isoDate).toLocaleDateString();
}

/** `devsurface commits` — recent history and contributors, human-first. */
export async function commitsCommand(
  cwd = process.cwd(),
  options: { json?: boolean; limit?: number } = {}
): Promise<void> {
  const insights = await gatherGitInsights(cwd, options.limit ?? 15);

  if (options.json === true) {
    console.log(JSON.stringify(insights, null, 2));
    return;
  }
  if (!insights.available) {
    console.log('This folder is not a git repository (or git is not installed).');
    return;
  }

  console.log(pc.bold('Recent changes:\n'));
  for (const commit of insights.commits) {
    console.log(`  ${pc.yellow(commit.hash)} ${safeTerminalText(commit.subject)}`);
    console.log(
      `         ${pc.dim(`${safeTerminalText(commit.author)}, ${relativeDay(commit.date)}`)}`
    );
  }

  if (insights.contributors.length > 0) {
    console.log(pc.bold('\nWho works on this:'));
    for (const contributor of insights.contributors.slice(0, 8)) {
      console.log(
        `  ${safeTerminalText(contributor.name).padEnd(28)} ${contributor.commits} commit${contributor.commits === 1 ? '' : 's'}`
      );
    }
  }

  if (insights.changedFiles.length > 0) {
    console.log(pc.bold(`\nUncommitted changes (${insights.changedFiles.length} files):`));
    for (const changed of insights.changedFiles.slice(0, 15)) {
      console.log(`  ${pc.yellow(changed.meaning.padEnd(22))} ${safeTerminalText(changed.file)}`);
    }
  }
}
