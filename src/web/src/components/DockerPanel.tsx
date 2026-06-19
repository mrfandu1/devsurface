import type { ScanResult } from '../types';
import { Panel } from './Panel';

function basename(filePath: string): string {
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

export function DockerPanel({ project }: { project: ScanResult }) {
  const docker = project.docker;

  return (
    <Panel title="Services">
      {docker === null ? (
        <p className="empty">No Docker Compose file detected.</p>
      ) : (
        <div className="docker-content">
          <div className="status-strip">
            <span className={`status-dot ${docker.dockerRunning ? 'ok' : 'warn'}`} />
            <span>
              {docker.dockerRunning ? 'Docker daemon running' : 'Docker daemon not running'}
            </span>
          </div>
          <div className="compose-files">
            {docker.composeFiles.map((composeFile) => (
              <code key={composeFile}>{basename(composeFile)}</code>
            ))}
          </div>
          <div className="service-list">
            {docker.services.length > 0 ? (
              docker.services.map((service) => (
                <span className={`service-chip service-${service.status}`} key={service.name}>
                  <strong>{service.name}</strong>
                  <em>{service.status}</em>
                </span>
              ))
            ) : (
              <span>No services parsed.</span>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}
