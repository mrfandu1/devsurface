import type { ScanResult } from '../types';
import { Panel } from './Panel';

export function PortsPanel({ project }: { project: ScanResult }) {
  return (
    <Panel title="Ports">
      {project.ports.length === 0 ? (
        <p className="empty">No configured or inferred ports.</p>
      ) : (
        <div className="port-grid">
          {project.ports.map((port) => (
            <div className={`port-row ${port.inUse ? 'port-conflict' : ''}`} key={port.port}>
              <strong>{port.port}</strong>
              <span>{port.inUse ? 'in use' : 'available'}</span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
