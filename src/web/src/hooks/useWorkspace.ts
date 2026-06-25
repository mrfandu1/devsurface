import { useCallback, useEffect, useState } from 'react';
import type { WorkspaceSummary } from '../types';

function workspaceIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('workspace');
}

export function useWorkspace() {
  const [workspaces, setWorkspaces] = useState<WorkspaceSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => workspaceIdFromUrl());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const response = await fetch('/api/workspaces');
      if (!response.ok) return;
      const list = (await response.json()) as WorkspaceSummary[];
      setWorkspaces(list);

      if (list.length > 0 && (!activeId || !list.find((w) => w.id === activeId))) {
        setActiveId(list[0].id);
      }
    } finally {
      setLoading(false);
    }
  }, [activeId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const switchWorkspace = useCallback((id: string) => {
    setActiveId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('workspace', id);
    window.history.replaceState(null, '', url.toString());
  }, []);

  const active = workspaces.find((w) => w.id === activeId) ?? null;

  return {
    workspaces,
    active,
    activeId,
    loading,
    switchWorkspace,
    refresh
  };
}
