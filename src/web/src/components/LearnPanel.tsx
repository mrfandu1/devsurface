import { useEffect, useMemo, useState } from 'react';
import { GLOSSARY, GLOSSARY_CATEGORY_LABELS, searchGlossary } from '@core/glossary/index.js';
import { explainErrorOutput, type FriendlyError } from '@core/friendly/index.js';
import { safeDisplayText } from '@core/security/text.js';
import { apiPrefix } from '../mutation';

interface FactSheetEntry {
  label: string;
  value: string;
}

interface Tip {
  id: string;
  kind: 'do-this' | 'good-to-know' | 'shortcut';
  text: string;
  command?: string;
}

interface QuickstartStep {
  id: string;
  title: string;
  why: string;
  command?: string;
  done?: boolean;
}

interface SystemCheckItem {
  id: string;
  label: string;
  ok: boolean | null;
  detail: string;
  hint?: string;
}

interface Insights {
  summary: string;
  facts: FactSheetEntry[];
  tips: Tip[];
  quickstart: QuickstartStep[];
  system: {
    osName: string;
    arch: string;
    cpuCount: number;
    totalMemoryGb: number;
    freeMemoryGb: number;
    checks: SystemCheckItem[];
    verdict: string;
  };
}

const TIP_KIND_LABELS: Record<Tip['kind'], string> = {
  'do-this': 'Do this',
  shortcut: 'Shortcut',
  'good-to-know': 'Good to know'
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="minor-button copy-chip"
      type="button"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}

/** Paste-an-error box: translates scary output into plain English, locally. */
function ErrorTranslator() {
  const [input, setInput] = useState('');
  const [result, setResult] = useState<FriendlyError | null | 'unknown'>(null);

  function translate(): void {
    if (input.trim().length === 0) {
      setResult(null);
      return;
    }
    const friendly = explainErrorOutput(input);
    setResult(friendly ?? 'unknown');
  }

  return (
    <div className="learn-card">
      <h2>Paste an error, get plain English</h2>
      <p className="learn-muted">
        Copy the scary red text from any terminal or log and paste it here. Nothing you paste leaves
        your computer.
      </p>
      <textarea
        className="error-translator-input"
        placeholder={'For example: Error: listen EADDRINUSE: address already in use :::3000'}
        rows={4}
        value={input}
        onChange={(event) => setInput(event.target.value)}
      />
      <div className="learn-actions">
        <button className="utility-button" type="button" onClick={translate}>
          Explain this error
        </button>
        {input.length > 0 ? (
          <button
            className="minor-button"
            type="button"
            onClick={() => {
              setInput('');
              setResult(null);
            }}
          >
            Clear
          </button>
        ) : null}
      </div>
      {result === 'unknown' ? (
        <div className="learn-answer">
          <strong>Not one I recognize yet — two universal tricks:</strong>
          <p>
            The <em>first</em> error line in the output is usually the real cause, and searching the
            exact error text online almost always finds the answer.
          </p>
        </div>
      ) : result !== null ? (
        <div className="learn-answer">
          <strong>{safeDisplayText(result.title)}</strong>
          <p>{safeDisplayText(result.explanation)}</p>
          <p>
            <em>What to do:</em> {safeDisplayText(result.suggestion)}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function GlossarySection() {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchGlossary(query), [query]);
  const grouped = useMemo(() => {
    const byCategory = new Map<string, typeof matches>();
    for (const entry of matches) {
      const label = GLOSSARY_CATEGORY_LABELS[entry.category];
      byCategory.set(label, [...(byCategory.get(label) ?? []), entry]);
    }
    return [...byCategory.entries()];
  }, [matches]);

  return (
    <div className="learn-card">
      <h2>Jargon dictionary ({GLOSSARY.length} terms)</h2>
      <p className="learn-muted">
        Every developer word you will meet in this dashboard, explained without more jargon.
      </p>
      <input
        className="glossary-search"
        placeholder="Search a word, like “port”, “lockfile”, or “merge”…"
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {matches.length === 0 ? (
        <p className="learn-muted">Nothing mentions “{safeDisplayText(query)}” yet.</p>
      ) : (
        <div className="glossary-groups">
          {grouped.map(([category, entries]) => (
            <section key={category}>
              <h3>{category}</h3>
              <dl>
                {entries.map((entry) => (
                  <div className="glossary-entry" key={entry.term}>
                    <dt>{entry.term}</dt>
                    <dd>{entry.definition}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

export function LearnPanel({ workspaceId }: { workspaceId: string | null }) {
  const [insights, setInsights] = useState<Insights | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setInsights(null);
    setError(null);
    fetch(`${apiPrefix(workspaceId)}/insights`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('The insights request failed.');
        }
        const body = (await response.json()) as Insights;
        if (!cancelled) {
          setInsights(body);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Could not load project insights. Try Refresh Data.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  return (
    <div className="learn-panel">
      {error !== null ? <div className="learn-card learn-error">{error}</div> : null}

      {insights !== null ? (
        <>
          <div className="learn-card">
            <h2>This project, in plain English</h2>
            <p className="learn-summary">{safeDisplayText(insights.summary)}</p>
            <div className="fact-grid">
              {insights.facts.map((fact) => (
                <div className="fact-cell" key={fact.label}>
                  <span className="fact-label">{fact.label}</span>
                  <span className="fact-value">{safeDisplayText(fact.value)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="learn-card">
            <h2>First run, step by step</h2>
            <p className="learn-muted">
              The exact commands to get this project running, in order. Steps already done are
              checked off.
            </p>
            <ol className="quickstart-list">
              {insights.quickstart.map((step) => (
                <li className={step.done === true ? 'done' : ''} key={step.id}>
                  <div className="quickstart-head">
                    <strong>
                      {step.done === true ? '✓ ' : ''}
                      {safeDisplayText(step.title)}
                    </strong>
                    {step.command !== undefined ? <CopyButton text={step.command} /> : null}
                  </div>
                  <p>{safeDisplayText(step.why)}</p>
                  {step.command !== undefined ? (
                    <code className="quickstart-command">{safeDisplayText(step.command)}</code>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>

          <div className="learn-card">
            <h2>Tips for this project</h2>
            <ul className="tips-list">
              {insights.tips.map((tip) => (
                <li key={tip.id}>
                  <span className={`tip-kind tip-${tip.kind}`}>{TIP_KIND_LABELS[tip.kind]}</span>
                  <div>
                    <p>{safeDisplayText(tip.text)}</p>
                    {tip.command !== undefined ? (
                      <code className="quickstart-command">
                        {safeDisplayText(tip.command)} <CopyButton text={tip.command} />
                      </code>
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="learn-card">
            <h2>Is this computer ready?</h2>
            <p className="learn-muted">
              {insights.system.osName} ({insights.system.arch}) · {insights.system.cpuCount} CPU
              cores · {insights.system.totalMemoryGb} GB RAM ({insights.system.freeMemoryGb} GB
              free)
            </p>
            <ul className="system-checks">
              {insights.system.checks.map((check) => (
                <li key={check.id}>
                  <span
                    className={
                      check.ok === true
                        ? 'check-ok'
                        : check.ok === false
                          ? 'check-bad'
                          : 'check-skip'
                    }
                  >
                    {check.ok === true ? '✔' : check.ok === false ? '✖' : '—'}
                  </span>
                  <strong>{check.label}</strong>
                  <span className="learn-muted">{safeDisplayText(check.detail)}</span>
                  {check.hint !== undefined ? (
                    <em className="check-hint">{safeDisplayText(check.hint)}</em>
                  ) : null}
                </li>
              ))}
            </ul>
            <p className="system-verdict">{safeDisplayText(insights.system.verdict)}</p>
          </div>
        </>
      ) : error === null ? (
        <div className="learn-card learn-muted">Reading the project…</div>
      ) : null}

      <ErrorTranslator />
      <GlossarySection />
    </div>
  );
}
