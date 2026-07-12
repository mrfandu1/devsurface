import { useEffect, useState } from 'react';
import { apiPrefix, mutationHeaders } from '../mutation';

export interface FixDescriptor {
  warningId: string;
  label: string;
  description: string;
}

/** Available one-click fixes for the current project, keyed by warning id. */
export function useAvailableFixes(
  workspaceId: string | null,
  active: boolean,
  refreshKey: unknown
): Record<string, FixDescriptor> {
  const [fixes, setFixes] = useState<Record<string, FixDescriptor>>({});
  useEffect(() => {
    if (!active) {
      return;
    }
    let cancelled = false;
    fetch(`${apiPrefix(workspaceId)}/fixes`)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('fixes request failed');
        }
        const list = (await response.json()) as FixDescriptor[];
        if (!cancelled) {
          setFixes(Object.fromEntries(list.map((fix) => [fix.warningId, fix])));
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFixes({});
        }
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, active, refreshKey]);
  return fixes;
}

/** "Fix it for me" button shown next to doctor warnings with a safe remedy. */
export function FixItButton({
  workspaceId,
  fix,
  onApplied
}: {
  workspaceId: string | null;
  fix: FixDescriptor;
  onApplied: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function apply(): Promise<void> {
    setBusy(true);
    try {
      const headers = { ...(await mutationHeaders()), 'Content-Type': 'application/json' };
      const response = await fetch(`${apiPrefix(workspaceId)}/fixes/apply`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ warningId: fix.warningId })
      });
      const result = (await response.json()) as { message?: string };
      onApplied(result.message ?? (response.ok ? 'Fixed.' : 'That fix did not apply.'));
    } catch {
      onApplied('The fix could not be applied — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className="minor-button fix-it-button"
      disabled={busy}
      onClick={() => void apply()}
      title={fix.description}
      type="button"
    >
      {busy ? 'Fixing…' : `🔧 ${fix.label}`}
    </button>
  );
}
