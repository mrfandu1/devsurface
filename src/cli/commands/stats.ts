import pc from 'picocolors';
import { computeCodeStats, formatBytes } from '../../core/stats/index.js';
import { safeTerminalText } from '../terminal.js';

/** `devsurface stats` — how big the project is, in human terms. */
export async function statsCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const stats = await computeCodeStats(cwd);

  if (options.json === true) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }

  console.log(
    pc.bold(
      `${stats.totalFiles.toLocaleString()} source files · ${stats.totalLines.toLocaleString()} lines · ${formatBytes(stats.totalBytes)}\n`
    )
  );
  if (stats.languages.length === 0) {
    console.log('No recognizable source files found.');
    return;
  }
  console.log(pc.bold('By language:'));
  const topLines = stats.languages[0].lines || 1;
  for (const language of stats.languages) {
    const bar = '█'.repeat(Math.max(1, Math.round((language.lines / topLines) * 24)));
    console.log(
      `  ${language.language.padEnd(20)} ${String(language.lines.toLocaleString()).padStart(9)} lines  ${pc.cyan(bar)}`
    );
  }
  console.log('');
  console.log(pc.bold('Largest files:'));
  for (const file of stats.largestFiles.slice(0, 5)) {
    console.log(
      `  ${safeTerminalText(file.file).padEnd(48)} ${String(file.lines.toLocaleString()).padStart(8)} lines`
    );
  }
  if (stats.truncated) {
    console.log(pc.dim('\n(Very large repository — numbers are a capped estimate.)'));
  }
}
