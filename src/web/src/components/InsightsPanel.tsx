import { useEffect, useMemo, useState } from 'react';
import { safeDisplayText } from '@core/security/text.js';
import { renderMarkdownSafe } from '@core/markdown/index.js';
import { formatBytes } from '@core/stats/index.js';
import { apiPrefix } from '../mutation';

type InsightsTab =
  | 'scorecard'
  | 'todos'
  | 'stats'
  | 'deps'
  | 'depsHealth'
  | 'secrets'
  | 'tests'
  | 'activity'
  | 'git'
  | 'docs';

interface Scorecard {
  score: number;
  grade: string;
  categories: Array<{ id: string; label: string; score: number; weight: number; verdict: string }>;
  topSuggestions: string[];
}

interface SecretReport {
  findings: Array<{
    kind: string;
    severity: string;
    file: string;
    line: number;
    preview: string;
    advice: string;
  }>;
  scannedFiles: number;
  clean: boolean;
  truncated: boolean;
}

interface TestInsights {
  files: Array<{ file: string; tests: number; skipped: number; focused: number; todo: number }>;
  totals: {
    files: number;
    tests: number;
    suites: number;
    skipped: number;
    focused: number;
    todo: number;
  };
  focusedFiles: string[];
  untestedSources: string[];
  truncated: boolean;
}

interface ActivityReport {
  available: boolean;
  recentCommits: number;
  windowDays: number;
  byWeekday: number[];
  byHour: number[];
  churn: Array<{ file: string; commits: number }>;
  repoAgeDays: number | null;
  longestStreak: number;
  currentStreak: number;
  busiestWeekday: string | null;
}

interface DepsHealthReport {
  heaviest: Array<{ name: string; bytes: number }>;
  duplicates: Array<{ name: string; versions: string[] }>;
  unused: string[];
  phantom: string[];
  nodeModulesBytes: number | null;
  installedPackageCount: number;
}

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
  scorecard: 'Scorecard',
  todos: 'To-dos in code',
  stats: 'Code size',
  deps: 'Dependencies',
  depsHealth: 'Dependency health',
  secrets: 'Secret scan',
  tests: 'Tests',
  activity: 'Activity',
  git: 'History',
  docs: 'Docs'
};

const WEEKDAY_ABBR = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function gradeColor(score: number): string {
  return score >= 80
    ? 'var(--good, #16a34a)'
    : score >= 55
      ? 'var(--warn, #d97706)'
      : 'var(--bad, #dc2626)';
}

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
  const scorecard = useFetch<Scorecard>(`${prefix}/scorecard`, tab === 'scorecard');
  const secrets = useFetch<SecretReport>(`${prefix}/secrets`, tab === 'secrets');
  const tests = useFetch<TestInsights>(`${prefix}/tests`, tab === 'tests');
  const activity = useFetch<ActivityReport>(`${prefix}/activity`, tab === 'activity');
  const depsHealth = useFetch<DepsHealthReport>(`${prefix}/deps/health`, tab === 'depsHealth');

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

      {tab === 'scorecard' ? (
        <div className="learn-card">
          <h2>Project scorecard</h2>
          <p className="learn-muted">
            One overall health grade, built from documentation, tests, secret hygiene, dependencies,
            links, and version control.
          </p>
          {scorecard.error ? <p>Could not build the scorecard.</p> : null}
          {scorecard.data !== null ? (
            <>
              <p className="learn-summary" style={{ color: gradeColor(scorecard.data.score) }}>
                Grade {scorecard.data.grade} · {scorecard.data.score}/100
              </p>
              <div className="stats-bars">
                {scorecard.data.categories.map((category) => (
                  <div className="stats-bar-row" key={category.id} title={category.verdict}>
                    <span className="stats-language">{category.label}</span>
                    <span className="stats-bar">
                      <i
                        style={{
                          width: `${Math.max(2, category.score)}%`,
                          background: gradeColor(category.score)
                        }}
                      />
                    </span>
                    <span className="stats-lines">{category.score}/100</span>
                  </div>
                ))}
              </div>
              {scorecard.data.topSuggestions.length > 0 ? (
                <>
                  <h3>Biggest opportunities</h3>
                  <ul className="plain-list">
                    {scorecard.data.topSuggestions.map((suggestion, index) => (
                      <li key={index}>{safeDisplayText(suggestion)}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </>
          ) : !scorecard.error ? (
            <p className="learn-muted">Grading…</p>
          ) : null}
        </div>
      ) : null}

      {tab === 'secrets' ? (
        <div className="learn-card">
          <h2>Secret scan</h2>
          <p className="learn-muted">
            Looks for credentials accidentally written into source files. Values are always
            redacted, and <code>.env</code> files are never scanned.
          </p>
          {secrets.error ? <p>Could not scan for secrets.</p> : null}
          {secrets.data !== null ? (
            secrets.data.clean ? (
              <p>No hardcoded secrets found across {secrets.data.scannedFiles} files. ✨</p>
            ) : (
              <ul className="todo-list">
                {secrets.data.findings.map((finding, index) => (
                  <li key={index}>
                    <span
                      className="todo-marker"
                      style={{
                        background: finding.severity === 'critical' ? '#dc2626' : '#d97706'
                      }}
                    >
                      {finding.severity === 'critical' ? 'CRITICAL' : 'warning'}
                    </span>
                    <span className="todo-text">
                      <strong>{safeDisplayText(finding.kind)}</strong> —{' '}
                      {safeDisplayText(finding.advice)}
                    </span>
                    <code className="todo-file">
                      {safeDisplayText(finding.file)}:{finding.line}
                    </code>
                  </li>
                ))}
              </ul>
            )
          ) : !secrets.error ? (
            <p className="learn-muted">Scanning…</p>
          ) : null}
        </div>
      ) : null}

      {tab === 'tests' ? (
        <div className="learn-card">
          <h2>Test suite at a glance</h2>
          {tests.error ? <p>Could not read the tests.</p> : null}
          {tests.data !== null ? (
            tests.data.totals.files === 0 ? (
              <p>No test files found.</p>
            ) : (
              <>
                <p className="learn-summary">
                  {tests.data.totals.tests} tests across {tests.data.totals.files} files
                  {tests.data.totals.skipped > 0 ? ` · ${tests.data.totals.skipped} skipped` : ''}
                  {tests.data.totals.todo > 0 ? ` · ${tests.data.totals.todo} todo` : ''}
                </p>
                {tests.data.focusedFiles.length > 0 ? (
                  <p className="learn-error-text">
                    ⚠ {tests.data.totals.focused} focused test(s) with <code>.only</code> — CI may
                    be running only these: {tests.data.focusedFiles.map(safeDisplayText).join(', ')}
                  </p>
                ) : null}
                {tests.data.untestedSources.length > 0 ? (
                  <>
                    <h3>Source files with no matching test</h3>
                    <ul className="plain-list">
                      {tests.data.untestedSources.slice(0, 12).map((file) => (
                        <li key={file}>
                          <code>{safeDisplayText(file)}</code>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            )
          ) : !tests.error ? (
            <p className="learn-muted">Reading tests…</p>
          ) : null}
        </div>
      ) : null}

      {tab === 'activity' ? (
        <div className="learn-card">
          <h2>When this project gets worked on</h2>
          {activity.error ? <p>Could not read git activity.</p> : null}
          {activity.data !== null ? (
            !activity.data.available ? (
              <p>This folder is not a git repository (or git is not installed).</p>
            ) : (
              <>
                <p className="learn-summary">
                  {activity.data.recentCommits} commits in the last {activity.data.windowDays} days
                  {activity.data.busiestWeekday !== null
                    ? ` · busiest on ${activity.data.busiestWeekday}`
                    : ''}
                </p>
                <p className="learn-muted">
                  Current streak {activity.data.currentStreak} day(s) · longest{' '}
                  {activity.data.longestStreak} day(s)
                  {activity.data.repoAgeDays !== null
                    ? ` · repo is ${activity.data.repoAgeDays} days old`
                    : ''}
                </p>
                <div className="stats-bars">
                  {activity.data.byWeekday.map((count, index) => {
                    const top = Math.max(...(activity.data?.byWeekday ?? [1]), 1);
                    return (
                      <div className="stats-bar-row" key={index}>
                        <span className="stats-language">{WEEKDAY_ABBR[index]}</span>
                        <span className="stats-bar">
                          <i style={{ width: `${Math.max(2, (count / top) * 100)}%` }} />
                        </span>
                        <span className="stats-lines">{count}</span>
                      </div>
                    );
                  })}
                </div>
                {activity.data.churn.length > 0 ? (
                  <>
                    <h3>Most-changed files</h3>
                    <ul className="plain-list">
                      {activity.data.churn.slice(0, 8).map((entry) => (
                        <li key={entry.file}>
                          <code>{safeDisplayText(entry.file)}</code>{' '}
                          <span className="learn-muted">{entry.commits}×</span>
                        </li>
                      ))}
                    </ul>
                  </>
                ) : null}
              </>
            )
          ) : !activity.error ? (
            <p className="learn-muted">Reading history…</p>
          ) : null}
        </div>
      ) : null}

      {tab === 'depsHealth' ? (
        <div className="learn-card">
          <h2>Dependency health</h2>
          <p className="learn-muted">
            Computed straight from <code>node_modules</code> — no registry calls.
          </p>
          {depsHealth.error ? <p>Could not analyze dependencies.</p> : null}
          {depsHealth.data !== null ? (
            <>
              <p className="learn-summary">
                {depsHealth.data.installedPackageCount} packages installed
                {depsHealth.data.nodeModulesBytes !== null
                  ? ` · ${formatBytes(depsHealth.data.nodeModulesBytes)} on disk`
                  : ''}
              </p>
              <h3>Heaviest packages</h3>
              <ul className="plain-list">
                {depsHealth.data.heaviest.slice(0, 8).map((pkg) => (
                  <li key={pkg.name}>
                    <code>{safeDisplayText(pkg.name)}</code>{' '}
                    <span className="learn-muted">{formatBytes(pkg.bytes)}</span>
                  </li>
                ))}
              </ul>
              {depsHealth.data.duplicates.length > 0 ? (
                <>
                  <h3>Installed at multiple versions</h3>
                  <ul className="plain-list">
                    {depsHealth.data.duplicates.slice(0, 8).map((dup) => (
                      <li key={dup.name}>
                        <code>{safeDisplayText(dup.name)}</code>{' '}
                        <span className="learn-muted">{dup.versions.join(', ')}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
              {depsHealth.data.phantom.length > 0 ? (
                <p className="learn-error-text">
                  Imported but not declared: {depsHealth.data.phantom.join(', ')}
                </p>
              ) : null}
              {depsHealth.data.unused.length > 0 ? (
                <p className="learn-muted">
                  Declared but never imported: {depsHealth.data.unused.slice(0, 12).join(', ')}
                </p>
              ) : null}
            </>
          ) : !depsHealth.error ? (
            <p className="learn-muted">Reading node_modules…</p>
          ) : null}
        </div>
      ) : null}

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
