import { promises as fs } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { RunHistoryStore, type RunHistoryEntry } from '../../core/history/index.js';
import { safeTerminalText } from '../terminal.js';

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  const seconds = durationMs / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds / 60)}m`;
}

function formatStatus(entry: RunHistoryEntry): string {
  if (entry.status === 'exited' && entry.exitCode === 0) {
    return pc.green('ok    ');
  }
  if (entry.status === 'stopped') {
    return pc.yellow('stop  ');
  }
  return pc.red(`fail${entry.exitCode === null ? '  ' : `:${entry.exitCode}`}`.padEnd(6));
}

/** Print the recent run history recorded for this project by the dashboard. */
export async function historyCommand(
  cwd = process.cwd(),
  limit = 20,
  options: { json?: boolean; clear?: boolean; script?: string } = {}
): Promise<void> {
  const root = await fs.realpath(path.resolve(cwd)).catch(() => path.resolve(cwd));
  const store = new RunHistoryStore();

  if (options.clear === true) {
    const cleared = await store.clear(root);
    console.log(
      cleared ? 'Run history for this project was cleared.' : 'No stored history to clear.'
    );
    return;
  }

  let entries = await store.list(root, options.script === undefined ? limit : 100);
  if (options.script !== undefined) {
    entries = entries.filter((entry) => entry.script === options.script).slice(0, limit);
  }

  if (options.json === true) {
    console.log(JSON.stringify(entries, null, 2));
    return;
  }

  if (entries.length === 0) {
    console.log(
      'No run history yet. Runs started from the DevSurface dashboard are recorded here.'
    );
    return;
  }

  for (const entry of entries) {
    const when = new Date(entry.endedAt).toLocaleString();
    console.log(
      `${formatStatus(entry)} ${pc.bold(safeTerminalText(entry.script).padEnd(18))} ${formatDuration(entry.durationMs).padStart(7)}  ${pc.dim(when)}`
    );
    console.log(`       ${pc.dim(safeTerminalText(entry.command))}`);
  }
}
