import { useEffect, useState } from 'react';
import type {
  DoctorWarning,
  ManagedProcessSnapshot,
  OnboardingPlan,
  ProcessLogEvent,
  RunHistoryEntry,
  ScanResult
} from '../types';
import { readWorkspaceCache, writeWorkspaceCache } from '../workspaceCache';

type SocketState = 'connecting' | 'open' | 'closed' | 'reconnecting';

export interface ProjectChange {
  file: string;
  at: number;
}

export interface ProjectPush {
  project: ScanResult;
  health: DoctorWarning[];
  onboarding: OnboardingPlan | null;
  at: number;
}

export interface RunRecorded {
  entry: RunHistoryEntry;
  at: number;
}

interface SocketPayload {
  type:
    | 'hello'
    | 'log'
    | 'process'
    | 'project-changed'
    | 'project-updated'
    | 'run-recorded'
    | 'workspaces-changed';
  event?: ProcessLogEvent;
  process?: ManagedProcessSnapshot;
  processes?: ManagedProcessSnapshot[];
  logs?: ProcessLogEvent[];
  workspace?: string;
  file?: string;
  project?: ScanResult;
  health?: DoctorWarning[];
  onboarding?: OnboardingPlan | null;
  entry?: RunHistoryEntry;
}

const MAX_RECONNECT_DELAY_MS = 15_000;

export function useSocket(workspaceId: string | null) {
  const cached = readWorkspaceCache(workspaceId);
  const [connection, setConnection] = useState<SocketState>('connecting');
  const [logs, setLogs] = useState<ProcessLogEvent[]>(cached.logs);
  const [processes, setProcesses] = useState<ManagedProcessSnapshot[]>(cached.processes);
  const [projectChange, setProjectChange] = useState<ProjectChange | null>(null);
  const [projectPush, setProjectPush] = useState<ProjectPush | null>(null);
  const [runRecorded, setRunRecorded] = useState<RunRecorded | null>(null);
  const [workspacesChangedAt, setWorkspacesChangedAt] = useState(0);

  useEffect(() => {
    if (!workspaceId) {
      setConnection('closed');
      return;
    }
    const id = workspaceId;

    const nextCached = readWorkspaceCache(workspaceId);
    setConnection('connecting');
    setLogs(nextCached.logs);
    setProcesses(nextCached.processes);

    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempts = 0;

    function scheduleReconnect(): void {
      if (disposed || reconnectTimer !== null) {
        return;
      }
      setConnection(attempts === 0 ? 'closed' : 'reconnecting');
      const delay = Math.min(MAX_RECONNECT_DELAY_MS, 1000 * 2 ** Math.min(attempts, 4));
      attempts += 1;
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        setConnection('reconnecting');
        connect();
      }, delay);
    }

    function connect(): void {
      if (disposed) {
        return;
      }
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      socket = new WebSocket(
        `${protocol}//${window.location.host}/ws?workspace=${encodeURIComponent(workspaceId ?? '')}`
      );

      socket.addEventListener('open', () => {
        attempts = 0;
        setConnection('open');
      });

      socket.addEventListener('close', () => {
        scheduleReconnect();
      });

      socket.addEventListener('message', (message) => {
        const payload = JSON.parse(String(message.data)) as SocketPayload;

        if (payload.type === 'hello' && payload.processes) {
          const helloLogs = payload.logs?.slice(-500) ?? [];
          setProcesses(payload.processes);
          setLogs(helloLogs);
          writeWorkspaceCache(id, {
            processes: payload.processes,
            logs: helloLogs
          });
        }

        if (payload.type === 'log' && payload.event) {
          setLogs((current) => {
            const next = [...current, payload.event as ProcessLogEvent].slice(-500);
            writeWorkspaceCache(id, { logs: next });
            return next;
          });
        }

        if (payload.type === 'project-changed' && typeof payload.file === 'string') {
          setProjectChange({ file: payload.file, at: Date.now() });
        }

        if (payload.type === 'project-updated' && payload.project && payload.health) {
          setProjectPush({
            project: payload.project,
            health: payload.health,
            onboarding: payload.onboarding ?? null,
            at: Date.now()
          });
        }

        if (payload.type === 'run-recorded' && payload.entry) {
          setRunRecorded({ entry: payload.entry, at: Date.now() });
        }

        if (payload.type === 'workspaces-changed') {
          setWorkspacesChangedAt(Date.now());
        }

        if (payload.type === 'process' && payload.process) {
          setProcesses((current) => {
            const map = new Map(current.map((processInfo) => [processInfo.pid, processInfo]));
            map.set(
              (payload.process as ManagedProcessSnapshot).pid,
              payload.process as ManagedProcessSnapshot
            );
            const next = Array.from(map.values());
            writeWorkspaceCache(id, { processes: next });
            return next;
          });
        }
      });
    }

    // Returning to the tab retries immediately instead of waiting out backoff.
    function handleVisibility(): void {
      if (
        document.visibilityState === 'visible' &&
        socket !== null &&
        socket.readyState !== WebSocket.OPEN &&
        socket.readyState !== WebSocket.CONNECTING
      ) {
        if (reconnectTimer !== null) {
          window.clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        setConnection('reconnecting');
        connect();
      }
    }
    document.addEventListener('visibilitychange', handleVisibility);

    connect();

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', handleVisibility);
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
      socket?.close();
    };
  }, [workspaceId]);

  return {
    connection,
    logs,
    processes,
    projectChange,
    projectPush,
    runRecorded,
    workspacesChangedAt
  };
}
