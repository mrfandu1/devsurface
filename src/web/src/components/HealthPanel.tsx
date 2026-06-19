import type { DoctorWarning } from '../types';
import { Panel } from './Panel';

export function HealthPanel({ warnings }: { warnings: DoctorWarning[] }) {
  return (
    <Panel title="Repo Health">
      {warnings.length === 0 ? (
        <div className="alert alert-ok">No health warnings found.</div>
      ) : (
        <div className="health-list">
          {warnings.map((warning) => (
            <div
              className={`health-row health-${warning.severity}`}
              key={`${warning.id}-${warning.title}`}
            >
              <strong>{warning.title}</strong>
              <p>{warning.message}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}
