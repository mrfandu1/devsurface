/**
 * Per-project notes and personal checklists.
 *
 * Stored outside the repository (`~/.devsurface/notes/<hash>.json`, same
 * pattern as run history) so notes never dirty the working tree and never
 * get committed by accident. Notes are personal, local, and plain text.
 */

import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface ProjectNote {
  id: string;
  /** The note text (plain text; the dashboard renders it escaped). */
  text: string;
  /** Checklist notes render with a checkbox and can be toggled done. */
  checklist: boolean;
  done: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export const NOTE_TEXT_LIMIT = 2_000;
export const NOTES_LIMIT = 200;

function defaultDataDir(): string {
  return process.env.DEVSURFACE_DATA_DIR ?? path.join(os.homedir(), '.devsurface');
}

/** Pinned first, then newest first — the order every surface displays. */
export function sortNotes(notes: ProjectNote[]): ProjectNote[] {
  return [...notes].sort((left, right) => {
    if (left.pinned !== right.pinned) {
      return left.pinned ? -1 : 1;
    }
    return right.createdAt.localeCompare(left.createdAt);
  });
}

export class NotesStore {
  private readonly dir: string;

  constructor(dataDir?: string) {
    this.dir = path.join(dataDir ?? defaultDataDir(), 'notes');
  }

  private fileFor(root: string): string {
    const hash = createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 16);
    return path.join(this.dir, `${hash}.json`);
  }

  async list(root: string): Promise<ProjectNote[]> {
    try {
      const parsed = JSON.parse(await fs.readFile(this.fileFor(root), 'utf8'));
      return Array.isArray(parsed) ? sortNotes(parsed as ProjectNote[]) : [];
    } catch {
      return [];
    }
  }

  private async write(root: string, notes: ProjectNote[]): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(
      this.fileFor(root),
      JSON.stringify(notes.slice(0, NOTES_LIMIT), null, 2) + '\n',
      { encoding: 'utf8', mode: 0o600 }
    );
  }

  async add(
    root: string,
    text: string,
    options: { checklist?: boolean } = {}
  ): Promise<ProjectNote> {
    const trimmed = text.trim().slice(0, NOTE_TEXT_LIMIT);
    if (trimmed.length === 0) {
      throw new Error('A note needs some text.');
    }
    const now = new Date().toISOString();
    const note: ProjectNote = {
      id: randomUUID(),
      text: trimmed,
      checklist: options.checklist === true,
      done: false,
      pinned: false,
      createdAt: now,
      updatedAt: now
    };
    const notes = await this.list(root);
    notes.unshift(note);
    await this.write(root, notes);
    return note;
  }

  /** Toggle done (checklist notes) — returns the updated note or null. */
  async toggleDone(root: string, id: string): Promise<ProjectNote | null> {
    return this.update(root, id, (note) => ({ ...note, done: !note.done }));
  }

  async togglePinned(root: string, id: string): Promise<ProjectNote | null> {
    return this.update(root, id, (note) => ({ ...note, pinned: !note.pinned }));
  }

  async edit(root: string, id: string, text: string): Promise<ProjectNote | null> {
    const trimmed = text.trim().slice(0, NOTE_TEXT_LIMIT);
    if (trimmed.length === 0) {
      return null;
    }
    return this.update(root, id, (note) => ({ ...note, text: trimmed }));
  }

  private async update(
    root: string,
    id: string,
    change: (note: ProjectNote) => ProjectNote
  ): Promise<ProjectNote | null> {
    const notes = await this.list(root);
    const index = notes.findIndex((note) => note.id === id);
    if (index === -1) {
      return null;
    }
    notes[index] = { ...change(notes[index]), updatedAt: new Date().toISOString() };
    await this.write(root, notes);
    return notes[index];
  }

  async remove(root: string, id: string): Promise<boolean> {
    const notes = await this.list(root);
    const remaining = notes.filter((note) => note.id !== id);
    if (remaining.length === notes.length) {
      return false;
    }
    await this.write(root, remaining);
    return true;
  }

  /** Remove every completed checklist note in one sweep. */
  async clearDone(root: string): Promise<number> {
    const notes = await this.list(root);
    const remaining = notes.filter((note) => !(note.checklist && note.done));
    if (remaining.length !== notes.length) {
      await this.write(root, remaining);
    }
    return notes.length - remaining.length;
  }
}
