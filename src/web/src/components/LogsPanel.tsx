import type { ManagedProcessSnapshot, ProcessLogEvent } from '../types';
import { Panel } from './Panel';

export function LogsPanel({
  connection,
  logs,
  processes
}: {
  connection: 'connecting' | 'open' | 'closed';
  logs: ProcessLogEvent[];
  processes: ManagedProcessSnapshot[];
}) {
  const running = processes.filter((processInfo) => processInfo.status === 'running');

  return (
    <Panel title="Logs" action={<span className={`socket-state ${connection}`}>{connection}</span>}>
      <div className="process-summary">
        {running.length > 0 ? (
          running.map((processInfo) => (
            <span key={processInfo.pid}>
              {processInfo.script} #{processInfo.pid}
            </span>
          ))
        ) : (
          <span>No running processes.</span>
        )}
      </div>
      <div className="log-box" aria-live="polite">
        {logs.length === 0 ? (
          <p className="empty">Run a script to stream logs here.</p>
        ) : (
          logs.map((log, index) => (
            <div className={`log-line log-${log.stream}`} key={`${log.timestamp}-${index}`}>
              <time>{new Date(log.timestamp).toLocaleTimeString()}</time>
              <span>{log.script}</span>
              <pre>{log.message}</pre>
            </div>
          ))
        )}
      </div>
    </Panel>
  );
}
