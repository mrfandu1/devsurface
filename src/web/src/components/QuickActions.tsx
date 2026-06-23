import { isDangerousCommand } from '@core/security/dangerousCommand.js';
import type { ManagedProcessSnapshot, ScanResult } from '../types';
import { Panel } from './Panel';

function buildDisplayCommand(project: ScanResult, script: string): string {
  return `${project.packageManager ?? 'npm'} run ${script}`;
}

function createGroups(project: ScanResult): Array<{ name: string; scripts: string[] }> {
  const allScripts = Object.keys(project.scripts);
  const configGroups = project.config?.config.groups ?? {};
  const grouped = new Set<string>();
  const groups = Object.entries(configGroups)
    .map(([name, scripts]) => {
      const present = scripts.filter((script) => project.scripts[script] !== undefined);
      present.forEach((script) => grouped.add(script));
      return { name, scripts: present };
    })
    .filter((group) => group.scripts.length > 0);

  const ungrouped = allScripts.filter((script) => !grouped.has(script));
  if (ungrouped.length > 0) {
    groups.push({ name: 'Scripts', scripts: ungrouped });
  }

  return groups;
}

export function QuickActions({
  project,
  processes,
  onRun,
  onStop
}: {
  project: ScanResult;
  processes: ManagedProcessSnapshot[];
  onRun: (script: string) => Promise<void>;
  onStop: (pid: string) => Promise<void>;
}) {
  const groups = createGroups(project);
  const runningByScript = new Map(
    processes
      .filter((processInfo) => processInfo.status === 'running')
      .map((processInfo) => [processInfo.script, processInfo])
  );

  return (
    <Panel title="Quick Actions">
      <div className="action-groups">
        {groups.length === 0 ? <p className="empty">No package scripts detected.</p> : null}
        {groups.map((group) => (
          <div className="action-group" key={group.name}>
            <h3>{group.name}</h3>
            <div className="script-list">
              {group.scripts.map((script) => {
                const command = project.scripts[script];
                const running = runningByScript.get(script);
                const dangerous = isDangerousCommand(command);
                return (
                  <div className={`script-row ${dangerous ? 'danger-script' : ''}`} key={script}>
                    <div className="script-main">
                      <strong>{script}</strong>
                      <code>{command}</code>
                    </div>
                    {dangerous ? <span className="danger-label">Danger</span> : null}
                    {running ? (
                      <button
                        className="button button-ghost"
                        onClick={() => void onStop(running.pid)}
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        className="button"
                        onClick={() => {
                          const exactCommand = buildDisplayCommand(project, script);
                          const confirmed = window.confirm(
                            `Run this command?\n\n${exactCommand}\n\npackage.json script:\n${command}`
                          );
                          if (confirmed) {
                            void onRun(script);
                          }
                        }}
                      >
                        Run
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}
