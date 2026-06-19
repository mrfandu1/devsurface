import { useEffect, useState } from 'react';
import type { ManagedProcessSnapshot, ProcessLogEvent } from '../types';

type SocketState = 'connecting' | 'open' | 'closed';

interface SocketPayload {
  type: 'hello' | 'log' | 'process';
  event?: ProcessLogEvent;
  process?: ManagedProcessSnapshot;
  processes?: ManagedProcessSnapshot[];
  logs?: ProcessLogEvent[];
}

export function useSocket() {
  const [connection, setConnection] = useState<SocketState>('connecting');
  const [logs, setLogs] = useState<ProcessLogEvent[]>([]);
  const [processes, setProcesses] = useState<ManagedProcessSnapshot[]>([]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}/ws`);

    socket.addEventListener('open', () => {
      setConnection('open');
    });

    socket.addEventListener('close', () => {
      setConnection('closed');
    });

    socket.addEventListener('message', (message) => {
      const payload = JSON.parse(String(message.data)) as SocketPayload;

      if (payload.type === 'hello' && payload.processes) {
        setProcesses(payload.processes);
        setLogs(payload.logs?.slice(-500) ?? []);
      }

      if (payload.type === 'log' && payload.event) {
        setLogs((current) => [...current, payload.event as ProcessLogEvent].slice(-500));
      }

      if (payload.type === 'process' && payload.process) {
        setProcesses((current) => {
          const map = new Map(current.map((processInfo) => [processInfo.pid, processInfo]));
          map.set(
            (payload.process as ManagedProcessSnapshot).pid,
            payload.process as ManagedProcessSnapshot
          );
          return Array.from(map.values());
        });
      }
    });

    return () => {
      socket.close();
    };
  }, []);

  return {
    connection,
    logs,
    processes
  };
}
