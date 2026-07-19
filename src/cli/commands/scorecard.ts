import pc from 'picocolors';
import { buildScorecard } from '../../core/scorecard/index.js';
import { scanProject } from '../../core/scanner/index.js';

/** `devsurface scorecard` — one A–F health grade for the whole project. */
export async function scorecardCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  const card = await buildScorecard(cwd, scan);

  if (options.json === true) {
    console.log(JSON.stringify(card, null, 2));
    return;
  }

  const color = card.score >= 80 ? pc.green : card.score >= 55 ? pc.yellow : pc.red;
  console.log(pc.bold(color(`Project scorecard: ${card.grade} (${card.score}/100)\n`)));

  for (const category of card.categories) {
    const bar = '█'.repeat(Math.round((category.score / 100) * 20));
    const barColor = category.score >= 80 ? pc.green : category.score >= 55 ? pc.yellow : pc.red;
    console.log(
      `  ${category.label.padEnd(16)} ${String(category.score).padStart(3)}  ${barColor(bar)}`
    );
    console.log(pc.dim(`      ${category.verdict}`));
  }

  if (card.topSuggestions.length > 0) {
    console.log(pc.bold('\nBiggest opportunities:'));
    for (const suggestion of card.topSuggestions) {
      console.log(`  • ${suggestion}`);
    }
  }
}
