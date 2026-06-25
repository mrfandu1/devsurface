import { useEffect, useState } from 'react';
import type { ManagedProcessSnapshot, ProcessLogEvent } from '../types';
import { readWorkspaceCache, writeWorkspaceCache } from '../workspaceCache';

type SocketState = 'connecting' | 'open' | 'closed';

interface SocketPayload {
  type: 'hello' | 'log' | 'process';
  event?: ProcessLogEvent;
  process?: ManagedProcessSnapshot;
  processes?: ManagedProcessSnapshot[];
  logs?: ProcessLogEvent[];
  workspace?: string;
}

export function useSocket(workspaceId: string | null) {
  const cached = readWorkspaceCache(workspaceId);
  const [connection, setConnection] = useState<SocketState>('connecting');
  const [logs, setLogs] = useState<ProcessLogEvent[]>(cached.logs);
  const [processes, setProcesses] = useState<ManagedProcessSnapshot[]>(cached.processes);

  useEffect(() => {
    if (!workspaceId) {
      setConnection('closed');
      return;
    }

    const nextCached = readWorkspaceCache(workspaceId);
    setConnection('connecting');
    setLogs(nextCached.logs);
    setProcesses(nextCached.processes);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(
      `${protocol}//${window.location.host}/ws?workspace=${encodeURIComponent(workspaceId)}`
    );

    socket.addEventListener('open', () => {
      setConnection('open');
    });

    socket.addEventListener('close', () => {
      setConnection('closed');
    });

    socket.addEventListener('message', (message) => {
      const payload = JSON.parse(String(message.data)) as SocketPayload;

      if (payload.type === 'hello' && payload.processes) {
        const helloLogs = payload.logs?.slice(-500) ?? [];
        setProcesses(payload.processes);
        setLogs(helloLogs);
        writeWorkspaceCache(workspaceId, {
          processes: payload.processes,
          logs: helloLogs
        });
      }

      if (payload.type === 'log' && payload.event) {
        setLogs((current) => {
          const next = [...current, payload.event as ProcessLogEvent].slice(-500);
          writeWorkspaceCache(workspaceId, { logs: next });
          return next;
        });
      }

      if (payload.type === 'process' && payload.process) {
        setProcesses((current) => {
          const map = new Map(current.map((processInfo) => [processInfo.pid, processInfo]));
          map.set(
            (payload.process as ManagedProcessSnapshot).pid,
            payload.process as ManagedProcessSnapshot
          );
          const next = Array.from(map.values());
          writeWorkspaceCache(workspaceId, { processes: next });
          return next;
        });
      }
    });

    return () => {
      socket.close();
    };
  }, [workspaceId]);

  return {
    connection,
    logs,
    processes
  };
}
