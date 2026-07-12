import { useEffect, useState } from 'react';
import { safeDisplayText } from '@core/security/text.js';
import { formatBytes } from '@core/stats/index.js';
import { apiPrefix, mutationHeaders } from '../mutation';

interface CleanupReport {
  targets: Array<{ name: string; bytes: number; regeneratedBy: string }>;
  totalBytes: number;
}

interface ProjectSnapshot {
  takenAt: string;
  label: string;
  readiness: number | null;
}

interface SnapshotDiff {
  from: string;
  to: string;
  changes: string[];
}

/** Housekeeping tools: disk cleanup, snapshots & diff, and the help bundle. */
export function ToolboxPanel({ workspaceId }: { workspaceId: string | null }) {
  const prefix = apiPrefix(workspaceId);
  const [cleanup, setCleanup] = useState<CleanupReport | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [snapshots, setSnapshots] = useState<ProjectSnapshot[] | null>(null);
  const [diff, setDiff] = useState<SnapshotDiff | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    const [cleanupResponse, snapshotsResponse] = await Promise.all([
      fetch(`${prefix}/cleanup`).catch(() => null),
      fetch(`${prefix}/snapshots`).catch(() => null)
    ]);
    if (cleanupResponse?.ok === true) {
      setCleanup((await cleanupResponse.json()) as CleanupReport);
    }
    if (snapshotsResponse?.ok === true) {
      setSnapshots((await snapshotsResponse.json()) as ProjectSnapshot[]);
    }
  }

  useEffect(() => {
    setCleanup(null);
    setSnapshots(null);
    setDiff(null);
    setStatus(null);
    void refresh();
  }, [workspaceId]);

  async function post(path: string, body?: unknown): Promise<Response | null> {
    try {
      const headers = { ...(await mutationHeaders()), 'Content-Type': 'application/json' };
      return await fetch(`${prefix}${path}`, {
        method: 'POST',
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      return null;
    }
  }

  async function deleteTarget(name: string): Promise<void> {
    setConfirming(null);
    setStatus(`Deleting ${name}…`);
    const response = await post('/cleanup/delete', { name });
    if (response?.ok === true) {
      const result = (await response.json()) as { bytes: number };
      setStatus(`Deleted ${name} — reclaimed about ${formatBytes(result.bytes)}.`);
    } else {
      const body = response === null ? null : ((await response.json()) as { reason?: string });
      setStatus(`Could not delete ${name}: ${body?.reason ?? 'something went wrong.'}`);
    }
    await refresh();
  }

  async function takeSnapshot(): Promise<void> {
    setStatus('Taking snapshot…');
    const response = await post('/snapshots', { label: '' });
    setStatus(response?.ok === true ? 'Snapshot saved.' : 'Snapshot failed.');
    setDiff(null);
    await refresh();
  }

  async function loadDiff(): Promise<void> {
    setStatus(null);
    try {
      const response = await fetch(`${prefix}/snapshots/diff`);
      if (!response.ok) {
        setStatus('No snapshot to compare against yet — take one first.');
        return;
      }
      setDiff((await response.json()) as SnapshotDiff);
    } catch {
      setStatus('Could not compute the comparison.');
    }
  }

  return (
    <div className="learn-panel">
      {status !== null ? <div className="learn-card toolbox-status">{status}</div> : null}

      <div className="learn-card">
        <h2>Free up disk space</h2>
        <p className="learn-muted">
          These folders are machine-generated: deleting them is safe, and the next install or build
          recreates them. Your code and settings are never touched.
        </p>
        {cleanup === null ? (
          <p className="learn-muted">Measuring…</p>
        ) : cleanup.targets.length === 0 ? (
          <p>Nothing to clean — no regenerable folders found. ✨</p>
        ) : (
          <>
            <p className="learn-summary">
              About <strong>{formatBytes(cleanup.totalBytes)}</strong> can be reclaimed.
            </p>
            <ul className="cleanup-list">
              {cleanup.targets.map((target) => (
                <li key={target.name}>
                  <code>{target.name}</code>
                  <span className="learn-muted">{formatBytes(target.bytes)}</span>
                  <span className="learn-muted cleanup-note">
                    comes back via {safeDisplayText(target.regeneratedBy)}
                  </span>
                  {confirming === target.name ? (
                    <span className="note-actions">
                      <button
                        className="minor-button danger"
                        onClick={() => void deleteTarget(target.name)}
                        type="button"
                      >
                        Yes, delete
                      </button>
                      <button
                        className="minor-button"
                        onClick={() => setConfirming(null)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      className="minor-button"
                      onClick={() => setConfirming(target.name)}
                      type="button"
                    >
                      Delete…
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="learn-card">
        <h2>Snapshots: “what changed since?”</h2>
        <p className="learn-muted">
          A snapshot freezes what the project looks like right now (scripts, settings keys, package
          versions, health — never secret values). Compare later to see exactly what changed.
        </p>
        <div className="learn-actions">
          <button className="utility-button" onClick={() => void takeSnapshot()} type="button">
            Take a snapshot now
          </button>
          <button className="minor-button" onClick={() => void loadDiff()} type="button">
            What changed since the last one?
          </button>
        </div>
        {snapshots !== null && snapshots.length > 0 ? (
          <p className="learn-muted">
            {snapshots.length} snapshot{snapshots.length === 1 ? '' : 's'} saved — newest from{' '}
            {new Date(snapshots[0].takenAt).toLocaleString()}.
          </p>
        ) : null}
        {diff !== null ? (
          <ul className="plain-list diff-list">
            {diff.changes.map((change, index) => (
              <li key={index}>{safeDisplayText(change)}</li>
            ))}
          </ul>
        ) : null}
      </div>

      <div className="learn-card">
        <h2>Stuck? Ask for help the easy way</h2>
        <p className="learn-muted">
          The help bundle is one file with everything a helper needs: what the project is, your
          computer’s setup, health warnings, and the last error lines. No secret values are ever
          included. Download it and send it to whoever is helping you.
        </p>
        <a className="utility-button bundle-download" href={`${prefix}/bundle.md?download=1`}>
          Download the help bundle
        </a>
      </div>
    </div>
  );
}
