import pc from 'picocolors';
import { explainScript } from '../../core/explain/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalText } from '../terminal.js';

/** Tiny edit-distance for "did you mean" hints (good enough for script names). */
export function closestName(input: string, candidates: string[]): string | null {
  function distance(left: string, right: string): number {
    const rows = Array.from({ length: left.length + 1 }, (_, i) => {
      const row = new Array<number>(right.length + 1);
      row[0] = i;
      return row;
    });
    for (let j = 0; j <= right.length; j += 1) {
      rows[0][j] = j;
    }
    for (let i = 1; i <= left.length; i += 1) {
      for (let j = 1; j <= right.length; j += 1) {
        rows[i][j] = Math.min(
          rows[i - 1][j] + 1,
          rows[i][j - 1] + 1,
          rows[i - 1][j - 1] + (left[i - 1] === right[j - 1] ? 0 : 1)
        );
      }
    }
    return rows[left.length][right.length];
  }

  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    const score = distance(input.toLowerCase(), candidate.toLowerCase());
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }
  // Only suggest when the typo is plausibly close.
  return bestScore <= Math.max(2, Math.floor(input.length / 3)) ? best : null;
}

function collectCommands(scan: Awaited<ReturnType<typeof scanProject>>): Record<string, string> {
  return {
    ...scan.presetCommands,
    ...scan.scripts,
    ...(scan.config?.config.commands ?? {})
  };
}

/**
 * Print plain-English explanations of the project's scripts. With a name,
 * explain just that script; without one, explain everything runnable.
 */
export async function explainCommand(
  cwd = process.cwd(),
  scriptName?: string,
  options: { json?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  const commands = collectCommands(scan);
  const names = Object.keys(commands);

  if (options.json === true) {
    const selected = scriptName === undefined ? names : names.filter((n) => n === scriptName);
    console.log(
      JSON.stringify(
        selected.map((name) => ({
          name,
          command: commands[name],
          explanation: explainScript(name, commands[name])
        })),
        null,
        2
      )
    );
    return;
  }

  if (names.length === 0) {
    console.log('No scripts or configured commands were detected in this project.');
    return;
  }

  if (scriptName !== undefined) {
    const command = commands[scriptName];
    if (command === undefined) {
      const suggestion = closestName(scriptName, names);
      throw new Error(
        `Unknown script "${safeTerminalText(scriptName)}".${
          suggestion !== null ? ` Did you mean "${safeTerminalText(suggestion)}"?` : ''
        } Available: ${names.map((name) => safeTerminalText(name)).join(', ')}`
      );
    }
    console.log(pc.bold(safeTerminalText(scriptName)));
    console.log(`  ${pc.dim(safeTerminalText(command))}`);
    console.log(`  ${safeTerminalText(explainScript(scriptName, command))}`);
    return;
  }

  const width = Math.min(
    24,
    names.reduce((longest, name) => Math.max(longest, name.length), 0)
  );
  for (const name of names) {
    console.log(
      `${pc.bold(safeTerminalText(name.padEnd(width)))}  ${safeTerminalText(explainScript(name, commands[name]))}`
    );
    console.log(`${' '.repeat(width)}  ${pc.dim(safeTerminalText(commands[name]))}`);
  }
}
