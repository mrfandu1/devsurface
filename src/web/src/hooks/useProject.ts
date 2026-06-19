import { useCallback, useEffect, useState } from 'react';
import type { DoctorWarning, ManagedProcessSnapshot, ScanResult } from '../types';

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} returned ${response.status}`);
  }

  return (await response.json()) as T;
}

export function useProject() {
  const [project, setProject] = useState<ScanResult | null>(null);
  const [health, setHealth] = useState<DoctorWarning[]>([]);
  const [processes, setProcesses] = useState<ManagedProcessSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextProject, nextHealth, nextProcesses] = await Promise.all([
        fetchJson<ScanResult>('/api/project'),
        fetchJson<DoctorWarning[]>('/api/health'),
        fetchJson<ManagedProcessSnapshot[]>('/api/processes')
      ]);
      setProject(nextProject);
      setHealth(nextHealth);
      setProcesses(nextProcesses);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 30_000);

    return () => {
      window.clearInterval(interval);
    };
  }, [refresh]);

  return {
    project,
    health,
    processes,
    loading,
    error,
    refresh
  };
}
