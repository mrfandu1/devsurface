import pc from 'picocolors';
import { NotesStore, type ProjectNote } from '../../core/notes/index.js';
import { safeTerminalText } from '../terminal.js';

function renderNote(note: ProjectNote, index: number): void {
  const box = note.checklist ? (note.done ? pc.green('[x]') : pc.yellow('[ ]')) : '  •';
  const pin = note.pinned ? pc.magenta(' ★') : '';
  console.log(
    `${pc.dim(String(index + 1).padStart(3))} ${box} ${safeTerminalText(note.text)}${pin}`
  );
}

/**
 * `devsurface notes` — personal per-project notes and checklists, stored
 * outside the repository so they never get committed.
 */
export async function notesCommand(
  action: string | undefined,
  rest: string[],
  options: { json?: boolean; check?: boolean } = {}
): Promise<void> {
  const store = new NotesStore();
  const root = process.cwd();

  if (action === 'add') {
    const text = rest.join(' ');
    const note = await store.add(root, text, { checklist: options.check });
    console.log(
      `Saved${note.checklist ? ' checklist item' : ' note'}: ${safeTerminalText(note.text)}`
    );
    return;
  }

  const notes = await store.list(root);

  if (action === 'done' || action === 'check') {
    const index = Number(rest[0]) - 1;
    const target = notes[index];
    if (target === undefined) {
      console.error(`No note #${rest[0]}. Run "devsurface notes" to see the numbers.`);
      process.exitCode = 1;
      return;
    }
    const updated = await store.toggleDone(root, target.id);
    console.log(
      updated?.done === true ? `Checked off: ${safeTerminalText(target.text)}` : 'Unchecked.'
    );
    return;
  }

  if (action === 'remove' || action === 'rm' || action === 'delete') {
    const index = Number(rest[0]) - 1;
    const target = notes[index];
    if (target === undefined) {
      console.error(`No note #${rest[0]}. Run "devsurface notes" to see the numbers.`);
      process.exitCode = 1;
      return;
    }
    await store.remove(root, target.id);
    console.log(`Removed: ${safeTerminalText(target.text)}`);
    return;
  }

  if (action === 'clear-done') {
    const removed = await store.clearDone(root);
    console.log(`Removed ${removed} completed checklist item${removed === 1 ? '' : 's'}.`);
    return;
  }

  if (action !== undefined && action !== 'list') {
    console.error(
      `Unknown action "${safeTerminalText(action)}". Try: add, done, remove, clear-done.`
    );
    process.exitCode = 1;
    return;
  }

  if (options.json === true) {
    console.log(JSON.stringify(notes, null, 2));
    return;
  }
  if (notes.length === 0) {
    console.log('No notes yet for this project.');
    console.log(pc.dim('  devsurface notes add "remember to ask about the API key"'));
    console.log(pc.dim('  devsurface notes add --check "set up the database"'));
    return;
  }
  console.log(pc.bold(`Notes for this project (${notes.length}):\n`));
  notes.forEach(renderNote);
  console.log(
    pc.dim('\nCheck off: devsurface notes done <number> · Remove: devsurface notes remove <number>')
  );
}
