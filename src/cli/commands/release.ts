import pc from 'picocolors';
import { buildChangelogReport } from '../../core/changelog/index.js';

/** `devsurface release-notes` — draft notes from commits since the last tag. */
export async function releaseNotesCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const report = await buildChangelogReport(cwd);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  const { draft } = report;
  const since = draft.sinceTag !== null ? `since ${draft.sinceTag}` : 'across all history';
  console.log(pc.bold(`Draft release notes (${draft.totalCommits} commits ${since}):\n`));

  if (draft.groups.length === 0) {
    console.log(pc.dim('Nothing to release — no commits since the last tag.'));
  } else {
    console.log(draft.markdown);
  }

  if (report.hasChangelog) {
    console.log(pc.dim(`\nExisting CHANGELOG has ${report.versions.length} version section(s).`));
    if (report.versions.length > 0) {
      console.log(pc.dim(`Latest documented version: ${report.versions[0].version}`));
    }
  } else {
    console.log(pc.dim('\nNo CHANGELOG.md yet — paste the draft above into one to start.'));
  }
}
