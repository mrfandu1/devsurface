import pc from 'picocolors';
import { scanTodos, type TodoMarker } from '../../core/todos/index.js';
import { safeTerminalText } from '../terminal.js';

const MARKER_COLORS: Record<TodoMarker, (text: string) => string> = {
  FIXME: pc.red,
  BUG: pc.red,
  HACK: pc.yellow,
  TODO: pc.cyan,
  XXX: pc.yellow,
  NOTE: pc.dim
};

/** `devsurface todos` — every TODO/FIXME comment in the code, in one list. */
export async function todosCommand(
  cwd = process.cwd(),
  options: { json?: boolean } = {}
): Promise<void> {
  const report = await scanTodos(cwd);

  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (report.items.length === 0) {
    console.log(pc.green('No TODO, FIXME, or HACK comments found. Tidy code!'));
    return;
  }

  const summary = (Object.entries(report.counts) as Array<[TodoMarker, number]>)
    .filter(([, count]) => count > 0)
    .map(([marker, count]) => `${count} ${marker}`)
    .join(', ');
  console.log(pc.bold(`Found ${report.items.length} code comments to revisit (${summary}):\n`));

  let lastFile = '';
  for (const item of report.items) {
    if (item.file !== lastFile) {
      console.log(pc.bold(safeTerminalText(item.file)));
      lastFile = item.file;
    }
    const color = MARKER_COLORS[item.marker];
    console.log(
      `  ${pc.dim(String(item.line).padStart(5))}  ${color(item.marker.padEnd(5))} ${safeTerminalText(item.text)}`
    );
  }
  if (report.truncated) {
    console.log(pc.dim('\n(The list was capped — there are more.)'));
  }
}
