import { useEffect, useMemo, useState } from 'react';
import { safeDisplayText } from '@core/security/text.js';
import { renderMarkdownSafe } from '@core/markdown/index.js';
import { formatBytes } from '@core/stats/index.js';
import { apiPrefix } from '../mutation';

type InsightsTab = 'todos' | 'stats' | 'deps' | 'git' | 'docs';

interface TodoReport {
  items: Array<{ marker: string; text: string; file: string; line: number }>;
  counts: Record<string, number>;
  scannedFiles: number;
  truncated: boolean;
}

interface CodeStats {
  totalFiles: number;
  totalLines: number;
  totalBytes: number;
  languages: Array<{ language: string; files: number; lines: number; bytes: number }>;
  largestFiles: Array<{ file: string; lines: number; bytes: number }>;
  truncated: boolean;
}

interface DependencyReport {
  entries: Array<{
    name: string;
    declared: string;
    installed: string | null;
    dev: boolean;
    description: string | null;
    license: string | null;
    homepage: string | null;
  }>;
  missing: string[];
  licenses: Array<{ license: string; count: number; packages: string[] }>;
  runtimeCount: number;
  devCount: number;
}

interface GitInsights {
  available: boolean;
  commits: Array<{ hash: string; author: string; date: string; subject: string }>;
  contributors: Array<{ name: string; commits: number }>;
  branches: Array<{ name: string; current: boolean }>;
  changedFiles: Array<{ status: string; meaning: string; file: string }>;
}

interface DocEntry {
  path: string;
  title: string;
  size: number;
}

function useFetch<T>(url: string, active: boolean): { data: T | null; error: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!active || data !== null) {
      return;
    }
    let cancelled = false;
    fetch(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('request failed');
        }
        const body = (await response.json()) as T;
        if (!cancelled) {
          setData(body);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url, active]);
  return { data, error };
}

function relativeDay(isoDate: string): string {
  const then = new Date(isoDate).getTime();
  if (!Number.isFinite(then)) {
    return '';
  }
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 30) return `${days} days ago`;
  return new Date(isoDate).toLocaleDateString();
}

const TAB_LABELS: Record<InsightsTab, string> = {
  todos: 'To-dos in code',
  stats: 'Code size',
  deps: 'Dependencies',
  git: 'History',
  docs: 'Docs'
};

/** Deep project insights: TODO comments, code stats, dependencies, git history, and docs. */
export function InsightsPanel({ workspaceId }: { workspaceId: string | null }) {
  const prefix = apiPrefix(workspaceId);
  const [tab, setTab] = useState<InsightsTab>('todos');
  const [depFilter, setDepFilter] = useState('');
  const [openDoc, setOpenDoc] = useState<string | null>(null);
  const [docHtml, setDocHtml] = useState<string | null>(null);

  const todos = useFetch<TodoReport>(`${prefix}/todos`, tab === 'todos');
  const stats = useFetch<CodeStats>(`${prefix}/stats`, tab === 'stats');
  const deps = useFetch<DependencyReport>(`${prefix}/deps`, tab === 'deps');
  const git = useFetch<GitInsights>(`${prefix}/git/insights`, tab === 'git');
  const docs = useFetch<DocEntry[]>(`${prefix}/docs`, tab === 'docs');

  useEffect(() => {
    if (openDoc === null) {
      setDocHtml(null);
      return;
    }
    let cancelled = false;
    fetch(`${prefix}/docs/read?path=${encodeURIComponent(openDoc)}`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('doc read failed');
        }
        const body = (await response.json()) as { markdown: string };
        if (!cancelled) {
          setDocHtml(renderMarkdownSafe(body.markdown));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setDocHtml('<p>This document could not be read.</p>');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [openDoc, prefix]);

  const filteredDeps = useMemo(() => {
    const wanted = depFilter.trim().toLowerCase();
    const entries = deps.data?.entries ?? [];
    return wanted.length === 0
      ? entries
      : entries.filter(
          (entry) =>
            entry.name.toLowerCase().includes(wanted) ||
            (entry.description ?? '').toLowerCase().includes(wanted)
        );
  }, [deps.data, depFilter]);

  return (
    <div className="learn-panel">
      <div className="insights-tabs" role="tablist">
        {(Object.keys(TAB_LABELS) as InsightsTab[]).map((key) => (
          <button
            className={tab === key ? 'active' : ''}
            key={key}
            onClick={() => setTab(key)}
            role="tab"
            aria-selected={tab === key}
            type="button"
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      {tab === 'todos' ? (
        <div className="learn-card">
          <h2>Little promises left in the code</h2>
          <p className="learn-muted">
            Developers leave TODO and FIXME comments as reminders. This is every one of them.
          </p>
          {todos.error ? <p>Could not scan the code.</p> : null}
          {todos.data !== null ? (
            todos.data.items.length === 0 ? (
              <p>None found — tidy code! ✨</p>
            ) : (
              <ul className="todo-list">
                {todos.data.items.map((item, index) => (
                  <li key={index}>
                    <span className={`todo-marker todo-${item.marker.toLowerCase()}`}>
                      {item.marker}
                    </span>
                    <span className="todo-text">{safeDisplayText(item.text) || '(no text)'}</span>
                    <code className="todo-file">
                      {safeDisplayText(item.file)}:{item.line}
                    </code>
                  </li>
                ))}
              </ul>
            )
          ) : !todos.error ? (
            <p className="learn-muted">Scanning…</p>
          ) : null}
        </div>
      ) : null}

      {tab === 'stats' ? (
        <div className="learn-card">
          <h2>How big is this project?</h2>
          {stats.error ? <p>Could not compute statistics.</p> : null}
          {stats.data !== null ? (
            <>
              <p className="learn-summary">
                {stats.data.totalFiles.toLocaleString()} source files,{' '}
                {stats.data.totalLines.toLocaleString()} lines of code,{' '}
                {formatBytes(stats.data.totalBytes)} in total.
              </p>
              <div className="stats-bars">
                {stats.data.languages.map((language) => {
                  const top = stats.data?.languages[0]?.lines ?? 1;
                  return (
                    <div className="stats-bar-row" key={language.language}>
                      <span className="stats-language">{language.language}</span>
                      <span className="stats-bar">
                        <i style={{ width: `${Math.max(2, (language.lines / top) * 100)}%` }} />
                      </span>
                      <span className="stats-lines">{language.lines.toLocaleString()} lines</span>
                    </div>
                  );
                })}
              </div>
              <h3>Largest files</h3>
              <ul className="plain-list">
                {stats.data.largestFiles.slice(0, 5).map((file) => (
                  <li key={file.file}>
                    <code>{safeDisplayText(file.file)}</code>{' '}
                    <span className="learn-muted">{file.lines.toLocaleString()} lines</span>
                  </li>
                ))}
              </ul>
            </>
          ) : !stats.error ? (
            <p className="learn-muted">Counting…</p>
          ) : null}
        </div>
      ) : null}

      {tab === 'deps' ? (
        <div className="learn-card">
          <h2>What this project is built on</h2>
          {deps.data !== null ? (
            <>
              <p className="learn-muted">
                {deps.data.runtimeCount} runtime + {deps.data.devCount} development packages.
                Licenses:{' '}
                {deps.data.licenses
                  .slice(0, 4)
                  .map((license) => `${license.license} ×${license.count}`)
                  .join(' · ')}
              </p>
              {deps.data.missing.length > 0 ? (
                <p className="learn-error-text">
                  {deps.data.missing.length} declared package
                  {deps.data.missing.length === 1 ? ' is' : 's are'} not installed — run the install
                  command.
                </p>
              ) : null}
              <input
                className="glossary-search"
                placeholder="Filter packages…"
                type="search"
                value={depFilter}
                onChange={(event) => setDepFilter(event.target.value)}
              />
              <ul className="deps-list">
                {filteredDeps.map((entry) => (
                  <li key={entry.name}>
                    <div className="deps-head">
                      {entry.homepage !== null ? (
                        <a href={entry.homepage} rel="noopener noreferrer" target="_blank">
                          {safeDisplayText(entry.name)}
                        </a>
                      ) : (
                        <strong>{safeDisplayText(entry.name)}</strong>
                      )}
                      <span className="learn-muted">
                        {entry.installed === null ? 'not installed' : `v${entry.installed}`}
                        {entry.dev ? ' · dev' : ''}
                        {entry.license !== null ? ` · ${safeDisplayText(entry.license)}` : ''}
                      </span>
                    </div>
                    {entry.description !== null ? (
                      <p>{safeDisplayText(entry.description)}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </>
          ) : deps.error ? (
            <p>Could not read the dependencies.</p>
          ) : (
            <p className="learn-muted">Reading node_modules…</p>
          )}
        </div>
      ) : null}

      {tab === 'git' ? (
        <div className="learn-card">
          <h2>Recent history</h2>
          {git.data !== null ? (
            !git.data.available ? (
              <p>This folder is not a git repository (or git is not installed).</p>
            ) : (
              <>
                <ul className="commit-list">
                  {git.data.commits.map((commit) => (
                    <li key={commit.hash}>
                      <code>{commit.hash}</code>
                      <span className="commit-subject">{safeDisplayText(commit.subject)}</span>
                      <span className="learn-muted">
                        {safeDisplayText(commit.author)} · {relativeDay(commit.date)}
                      </span>
                    </li>
                  ))}
                </ul>
                {git.data.contributors.length > 0 ? (
                  <>
                    <h3>Who works on this</h3>
                    <p className="learn-muted">
                      {git.data.contributors
                        .slice(0, 6)
                        .map(
                          (contributor) =>
                            `${safeDisplayText(contributor.name)} (${contributor.commits})`
                        )
                        .join(' · ')}
                    </p>
                  </>
                ) : null}
                {git.data.changedFiles.length > 0 ? (
                  <>
                    <h3>Uncommitted changes ({git.data.changedFiles.length})</h3>
                    <ul className="plain-list">
                      {git.data.changedFiles.slice(0, 12).map((changed) => (
                        <li key={changed.file}>
                          <span className="learn-muted">{changed.meaning}</span>{' '}
                          <code>{safeDisplayText(changed.file)}</code>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            )
          ) : git.error ? (
            <p>Could not read git history.</p>
          ) : (
            <p className="learn-muted">Reading history…</p>
          )}
        </div>
      ) : null}

      {tab === 'docs' ? (
        <div className="learn-card">
          <h2>Project documentation</h2>
          {openDoc !== null ? (
            <>
              <button className="minor-button" onClick={() => setOpenDoc(null)} type="button">
                ← All documents
              </button>
              <h3>{safeDisplayText(openDoc)}</h3>
              {docHtml === null ? (
                <p className="learn-muted">Opening…</p>
              ) : (
                <div
                  className="doc-viewer"
                  // renderMarkdownSafe escapes everything before adding markup.
                  dangerouslySetInnerHTML={{ __html: docHtml }}
                />
              )}
            </>
          ) : docs.data !== null ? (
            docs.data.length === 0 ? (
              <p>No Markdown documents were found in this project.</p>
            ) : (
              <ul className="plain-list docs-list">
                {docs.data.map((doc) => (
                  <li key={doc.path}>
                    <button className="doc-link" onClick={() => setOpenDoc(doc.path)} type="button">
                      {safeDisplayText(doc.title)}
                    </button>
                  </li>
                ))}
              </ul>
            )
          ) : docs.error ? (
            <p>Could not list the documents.</p>
          ) : (
            <p className="learn-muted">Looking for docs…</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
