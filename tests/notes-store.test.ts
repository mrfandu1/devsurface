import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NotesStore, sortNotes } from '../src/core/notes/index.js';
import { makeTempProject, removeTempProject } from './testUtils.js';

describe('NotesStore', () => {
  let dataDir: string;
  let root: string;
  let store: NotesStore;

  beforeEach(async () => {
    dataDir = await makeTempProject();
    root = await makeTempProject();
    store = new NotesStore(dataDir);
  });

  afterEach(async () => {
    await removeTempProject(dataDir);
    await removeTempProject(root);
  });

  it('adds, lists, and removes notes', async () => {
    const note = await store.add(root, 'ask Sam about the API key');
    expect((await store.list(root))[0].text).toBe('ask Sam about the API key');
    expect(await store.remove(root, note.id)).toBe(true);
    expect(await store.list(root)).toHaveLength(0);
  });

  it('rejects empty notes and trims text', async () => {
    await expect(store.add(root, '   ')).rejects.toThrow();
    const note = await store.add(root, '  padded  ');
    expect(note.text).toBe('padded');
  });

  it('toggles checklist items done and clears completed ones', async () => {
    const item = await store.add(root, 'set up the database', { checklist: true });
    expect(item.checklist).toBe(true);
    expect((await store.toggleDone(root, item.id))?.done).toBe(true);
    await store.add(root, 'keep me', { checklist: true });
    expect(await store.clearDone(root)).toBe(1);
    expect((await store.list(root)).map((note) => note.text)).toEqual(['keep me']);
  });

  it('pins notes to the top regardless of age', async () => {
    const older = await store.add(root, 'older');
    await store.add(root, 'newer');
    await store.togglePinned(root, older.id);
    const listed = await store.list(root);
    expect(listed[0].text).toBe('older');
    expect(listed[0].pinned).toBe(true);
  });

  it('keeps projects separate', async () => {
    const otherRoot = await makeTempProject();
    await store.add(root, 'only here');
    expect(await store.list(otherRoot)).toHaveLength(0);
    await removeTempProject(otherRoot);
  });

  it('sortNotes orders pinned first, then newest', () => {
    const base = {
      id: '',
      text: '',
      checklist: false,
      done: false,
      updatedAt: ''
    };
    const sorted = sortNotes([
      { ...base, id: 'a', pinned: false, createdAt: '2026-01-02' },
      { ...base, id: 'b', pinned: true, createdAt: '2026-01-01' },
      { ...base, id: 'c', pinned: false, createdAt: '2026-01-03' }
    ]);
    expect(sorted.map((note) => note.id)).toEqual(['b', 'c', 'a']);
  });
});
