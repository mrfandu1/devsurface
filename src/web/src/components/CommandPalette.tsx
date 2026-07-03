import { useEffect, useMemo, useRef, useState } from 'react';
import { filterPaletteEntries, type PaletteEntry } from '../palette';

export interface PaletteItem extends PaletteEntry {
  action: () => void;
}

/**
 * Ctrl+K overlay: type to filter views, scripts, workspaces, and quick
 * actions; Enter runs the selected entry.
 */
export function CommandPalette({ items, onClose }: { items: PaletteItem[]; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const matches = useMemo(() => filterPaletteEntries(items, query).slice(0, 12), [items, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  function run(item: PaletteItem | undefined): void {
    if (item === undefined) {
      return;
    }
    onClose();
    item.action();
  }

  function handleKeyDown(event: React.KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((current) => Math.min(current + 1, matches.length - 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      run(matches[selected]);
    }
  }

  let lastGroup: string | null = null;

  return (
    <div className="palette-overlay" onMouseDown={onClose} role="presentation">
      <div
        className="palette"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Command palette"
      >
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search views, scripts, workspaces…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          spellCheck={false}
        />
        <div className="palette-list" role="listbox">
          {matches.length === 0 ? <p className="palette-empty">No matches.</p> : null}
          {matches.map((item, index) => {
            const heading = item.group !== lastGroup ? item.group : null;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {heading !== null ? <div className="palette-group">{heading}</div> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === selected}
                  className={`palette-item ${index === selected ? 'selected' : ''}`}
                  onMouseEnter={() => setSelected(index)}
                  onClick={() => run(item)}
                >
                  <span className="palette-label">{item.label}</span>
                  {item.hint !== undefined ? (
                    <span className="palette-hint">{item.hint}</span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </div>
        <div className="palette-footer">
          <span>↑↓ navigate</span>
          <span>Enter run</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}
