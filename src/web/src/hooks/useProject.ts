import { useCallback, useEffect, useState } from 'react';
import type {
  DoctorWarning,
  ManagedProcessSnapshot,
  OnboardingPlan,
  ProcessLogEvent,
  RunHistoryEntry,
  ScanResult
} from '../types';
import { readWorkspaceCache, writeWorkspaceCache } from '../workspaceCache';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return (await response.json()) as T;
}

async function fetchOptional<T>(url: string): Promise<T | null> {
  try {
    return await fetchJson<T>(url);
  } catch {
    return null;
  }
}

export function useProject(workspaceId: string | null) {
  const cached = readWorkspaceCache(workspaceId);
  const [project, setProject] = useState<ScanResult | null>(cached.project);
  const [health, setHealth] = useState<DoctorWarning[]>(cached.health);
  const [processes, setProcesses] = useState<ManagedProcessSnapshot[]>(cached.processes);
  const [logs, setLogs] = useState<ProcessLogEvent[]>(cached.logs);
  const [onboarding, setOnboarding] = useState<OnboardingPlan | null>(null);
  const [history, setHistory] = useState<RunHistoryEntry[]>([]);
  const [loading, setLoading] = useState(() => !cached.project);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    try {
      const prefix = `/api/workspaces/${encodeURIComponent(workspaceId)}`;
      const [nextProject, nextHealth, nextProcesses, nextLogs, nextOnboarding, nextHistory] =
        await Promise.all([
          fetchJson<ScanResult>(`${prefix}/project`),
          fetchJson<DoctorWarning[]>(`${prefix}/health`),
          fetchJson<ManagedProcessSnapshot[]>(`${prefix}/processes`),
          fetchJson<ProcessLogEvent[]>(`${prefix}/logs`),
          fetchOptional<OnboardingPlan>(`${prefix}/onboarding`),
          fetchOptional<RunHistoryEntry[]>(`${prefix}/history`)
        ]);
      setProject(nextProject);
      setHealth(nextHealth);
      setOnboarding(nextOnboarding);
      setHistory(Array.isArray(nextHistory) ? nextHistory : []);
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

  /** Apply a server-pushed rescan (WebSocket) without an HTTP round-trip. */
  const applyServerPush = useCallback(
    (push: { project: ScanResult; health: DoctorWarning[]; onboarding: OnboardingPlan | null }) => {
      setProject(push.project);
      setHealth(push.health);
      if (push.onboarding !== null) {
        setOnboarding(push.onboarding);
      }
      setError(null);
      setLoading(false);
      if (workspaceId) {
        writeWorkspaceCache(workspaceId, { project: push.project, health: push.health });
      }
    },
    [workspaceId]
  );

  /** Prepend a run pushed live over the WebSocket to the history list. */
  const prependHistory = useCallback((entry: RunHistoryEntry) => {
    setHistory((current) => [entry, ...current].slice(0, 100));
  }, []);

  return {
    project,
    health,
    processes,
    logs,
    onboarding,
    history,
    loading,
    error,
    refresh,
    applyServerPush,
    prependHistory
  };
}
