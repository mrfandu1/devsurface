import type { ScanResult } from '../types';
import { Panel } from './Panel';

export function EnvPanel({
  project,
  onCopyEnv
}: {
  project: ScanResult;
  onCopyEnv: () => Promise<void>;
}) {
  const env = project.env;

  return (
    <Panel
      title="Environment"
      action={
        env?.hasExample && !env.hasLocal ? (
          <button className="button button-small" onClick={() => void onCopyEnv()}>
            Copy .env
          </button>
        ) : null
      }
    >
      {env === null ? (
        <p className="empty">No .env or .env.example file detected.</p>
      ) : (
        <div className="env-content">
          <div className="status-strip">
            <span className={`status-dot ${env.hasExample ? 'ok' : 'neutral'}`} />
            <span>.env.example {env.hasExample ? 'found' : 'missing'}</span>
          </div>
          <div className="status-strip">
            <span className={`status-dot ${env.hasLocal ? 'ok' : 'bad'}`} />
            <span>.env {env.hasLocal ? 'found' : 'missing'}</span>
          </div>
          {!env.hasLocal && env.hasExample ? (
            <div className="alert alert-error">Missing .env - copy from .env.example</div>
          ) : null}
          {env.keys.length > 0 ? (
            <div className="env-key-list">
              {env.keys.map((item) => (
                <div className="env-key-row" key={item.key}>
                  <code>{item.key}</code>
                  <span className={`pill ${item.present ? 'pill-ok' : 'pill-bad'}`}>
                    {item.present ? (item.empty ? 'empty' : 'present') : 'missing'}
                  </span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Panel>
  );
}
