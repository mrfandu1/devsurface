import type { DoctorWarning, ManagedProcessSnapshot, ProcessLogEvent, ScanResult } from './types';

export interface WorkspaceClientState {
  project: ScanResult | null;
  health: DoctorWarning[];
  processes: ManagedProcessSnapshot[];
  logs: ProcessLogEvent[];
}

const emptyState = (): WorkspaceClientState => ({
  project: null,
  health: [],
  processes: [],
  logs: []
});

const cache = new Map<string, WorkspaceClientState>();

export function readWorkspaceCache(workspaceId: string | null): WorkspaceClientState {
  if (!workspaceId) {
    return emptyState();
  }

  return cache.get(workspaceId) ?? emptyState();
}

export function writeWorkspaceCache(
  workspaceId: string,
  partial: Partial<WorkspaceClientState>
): WorkspaceClientState {
  const next = { ...readWorkspaceCache(workspaceId), ...partial };
  cache.set(workspaceId, next);
  return next;
}

export function clearWorkspaceCache(): void {
  cache.clear();
}
