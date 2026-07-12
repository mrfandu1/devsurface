import { useEffect, useState, type FormEvent } from 'react';
import { safeDisplayText } from '@core/security/text.js';
import { apiPrefix, mutationHeaders } from '../mutation';

interface ProjectNote {
  id: string;
  text: string;
  checklist: boolean;
  done: boolean;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Personal notes and checklists for the active project. Stored on this
 * machine outside the repository — they never end up in git.
 */
export function NotesPanel({ workspaceId }: { workspaceId: string | null }) {
  const [notes, setNotes] = useState<ProjectNote[] | null>(null);
  const [text, setText] = useState('');
  const [asChecklist, setAsChecklist] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prefix = apiPrefix(workspaceId);

  async function refresh(): Promise<void> {
    try {
      const response = await fetch(`${prefix}/notes`);
      if (!response.ok) {
        throw new Error('notes request failed');
      }
      setNotes((await response.json()) as ProjectNote[]);
      setError(null);
    } catch {
      setError('Could not load notes.');
    }
  }

  useEffect(() => {
    setNotes(null);
    void refresh();
  }, [workspaceId]);

  async function mutate(path: string, init: RequestInit): Promise<void> {
    try {
      const headers = { ...(await mutationHeaders()), 'Content-Type': 'application/json' };
      const response = await fetch(`${prefix}${path}`, { ...init, headers });
      if (!response.ok) {
        throw new Error('mutation failed');
      }
      await refresh();
    } catch {
      setError('That change did not save — try again.');
    }
  }

  async function addNote(event: FormEvent): Promise<void> {
    event.preventDefault();
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    setText('');
    await mutate('/notes', {
      method: 'POST',
      body: JSON.stringify({ text: trimmed, checklist: asChecklist })
    });
  }

  const doneCount = (notes ?? []).filter((note) => note.checklist && note.done).length;
  const checklistCount = (notes ?? []).filter((note) => note.checklist).length;

  return (
    <div className="learn-panel">
      <div className="learn-card">
        <h2>My notes for this project</h2>
        <p className="learn-muted">
          Private to this computer and never committed to git. Perfect for “ask Sam about the API
          key” or your personal setup checklist.
        </p>
        <form className="note-form" onSubmit={(event) => void addNote(event)}>
          <input
            className="glossary-search"
            placeholder="Write a note… (Enter to save)"
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <label className="note-checklist-toggle">
            <input
              checked={asChecklist}
              onChange={(event) => setAsChecklist(event.target.checked)}
              type="checkbox"
            />
            Checklist item
          </label>
          <button className="utility-button" type="submit">
            Add
          </button>
        </form>
        {error !== null ? <p className="learn-error-text">{error}</p> : null}
        {checklistCount > 0 ? (
          <p className="learn-muted">
            Checklist: {doneCount} of {checklistCount} done
          </p>
        ) : null}

        {notes === null ? (
          <p className="learn-muted">Loading…</p>
        ) : notes.length === 0 ? (
          <p className="learn-muted">No notes yet. The box above is all yours.</p>
        ) : (
          <ul className="notes-list">
            {notes.map((note) => (
              <li className={note.done ? 'done' : ''} key={note.id}>
                {note.checklist ? (
                  <input
                    checked={note.done}
                    onChange={() => void mutate(`/notes/${note.id}/toggle`, { method: 'POST' })}
                    type="checkbox"
                    aria-label={note.done ? 'Mark as not done' : 'Mark as done'}
                  />
                ) : (
                  <span className="note-dot">•</span>
                )}
                <span className="note-text">{safeDisplayText(note.text)}</span>
                <span className="note-actions">
                  <button
                    className="minor-button"
                    onClick={() => void mutate(`/notes/${note.id}/pin`, { method: 'POST' })}
                    title={note.pinned ? 'Unpin' : 'Pin to top'}
                    type="button"
                  >
                    {note.pinned ? '★' : '☆'}
                  </button>
                  <button
                    className="minor-button"
                    onClick={() => void mutate(`/notes/${note.id}`, { method: 'DELETE' })}
                    title="Delete this note"
                    type="button"
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
