import type { ScanResult } from '../types';
import { Panel } from './Panel';

function StatusPill({
  tone,
  children
}: {
  tone: 'ok' | 'warn' | 'bad' | 'neutral';
  children: string;
}) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

export function Overview({ project }: { project: ScanResult }) {
  const readmeTone = project.readme.exists ? 'ok' : 'warn';
  const licenseTone = project.license.exists ? 'ok' : 'neutral';

  return (
    <Panel title="Project Overview" className="overview-panel">
      <div className="project-title-block">
        <div>
          <h1>{project.projectName}</h1>
          <p>{project.config?.config.description || project.root}</p>
        </div>
        <StatusPill tone={project.framework ? 'ok' : 'neutral'}>
          {project.framework?.type ?? 'Unknown project'}
        </StatusPill>
      </div>
      <dl className="stat-grid">
        <div>
          <dt>Manager</dt>
          <dd>{project.packageManager ?? 'unknown'}</dd>
        </div>
        <div>
          <dt>Git branch</dt>
          <dd>{project.git?.branch ?? 'not detected'}</dd>
        </div>
        <div>
          <dt>Scripts</dt>
          <dd>{Object.keys(project.scripts).length}</dd>
        </div>
        <div>
          <dt>Docs</dt>
          <dd className="pill-row">
            <StatusPill tone={readmeTone}>
              {project.readme.exists ? 'README' : 'No README'}
            </StatusPill>
            <StatusPill tone={licenseTone}>
              {project.license.exists ? 'LICENSE' : 'No LICENSE'}
            </StatusPill>
          </dd>
        </div>
      </dl>
    </Panel>
  );
}
