import { useCallback, useEffect, useState } from 'react';
import type { DoctorWarning, ManagedProcessSnapshot, ProcessLogEvent, ScanResult } from '../types';
import { readWorkspaceCache, writeWorkspaceCache } from '../workspaceCache';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return (await response.json()) as T;
}

export function useProject(workspaceId: string | null) {
  const cached = readWorkspaceCache(workspaceId);
  const [project, setProject] = useState<ScanResult | null>(cached.project);
  const [health, setHealth] = useState<DoctorWarning[]>(cached.health);
  const [processes, setProcesses] = useState<ManagedProcessSnapshot[]>(cached.processes);
  const [logs, setLogs] = useState<ProcessLogEvent[]>(cached.logs);
  const [loading, setLoading] = useState(() => !cached.project);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    try {
      const prefix = `/api/workspaces/${encodeURIComponent(workspaceId)}`;
      const [nextProject, nextHealth, nextProcesses, nextLogs] = await Promise.all([
        fetchJson<ScanResult>(`${prefix}/project`),
        fetchJson<DoctorWarning[]>(`${prefix}/health`),
        fetchJson<ManagedProcessSnapshot[]>(`${prefix}/processes`),
        fetchJson<ProcessLogEvent[]>(`${prefix}/logs`)
      ]);
      setProject(nextProject);
      setHealth(nextHealth);
      setProcesses(nextProcesses);
      setLogs(nextLogs.slice(-500));
      if (workspaceId) {
        writeWorkspaceCache(workspaceId, {
          project: nextProject,
          health: nextHealth,
          processes: nextProcesses,
          logs: nextLogs.slice(-500)
        });
      }
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    const nextCached = readWorkspaceCache(workspaceId);
    setProject(nextCached.project);
    setHealth(nextCached.health);
    setProcesses(nextCached.processes);
    setLogs(nextCached.logs);
    setLoading(!nextCached.project);
    setError(null);
    void refresh();
  }, [workspaceId, refresh]);

  return {
    project,
    health,
    processes,
    logs,
    loading,
    error,
    refresh
  };
}
