import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  appUrlForPort,
  candidatePortsForScript,
  chooseAutoOpenPort,
  scriptLooksLikeServer
} from './autoOpen';
import { useProject } from './hooks/useProject';
import { useSocket } from './hooks/useSocket';
import { getDashboardShortcut, type DashboardShortcutView } from './keyboardShortcuts';
import type { DoctorWarning, ManagedProcessSnapshot, ProcessLogEvent, ScanResult } from './types';

const DEV_SURFACE_VERSION = '0.2.0';

function mergeProcesses(
  polledProcesses: ManagedProcessSnapshot[],
  socketProcesses: ManagedProcessSnapshot[]
): ManagedProcessSnapshot[] {
  const processMap = new Map<string, ManagedProcessSnapshot>();
  for (const processInfo of polledProcesses) {
    processMap.set(processInfo.pid, processInfo);
  }
  for (const processInfo of socketProcesses) {
    processMap.set(processInfo.pid, processInfo);
  }

  return Array.from(processMap.values()).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

function logEventKey(log: ProcessLogEvent): string {
  return `${log.timestamp}\n${log.pid}\n${log.stream}\n${log.message}`;
}

function mergeLogs(
  polledLogs: ProcessLogEvent[],
  socketLogs: ProcessLogEvent[]
): ProcessLogEvent[] {
  const logMap = new Map<string, ProcessLogEvent>();
  for (const log of polledLogs) {
    logMap.set(logEventKey(log), log);
  }
  for (const log of socketLogs) {
    logMap.set(logEventKey(log), log);
  }

  return Array.from(logMap.values())
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .slice(-500);
}

function formatPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function formatTime(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  }).format(date);
}

function compactCommand(command: string): string {
  return command
    .replace(/^npm run /, '')
    .replace(/^tsx /, '')
    .replace(/\s+--/g, ' --')
    .trim();
}

function statusForScript(
  script: string,
  processes: ManagedProcessSnapshot[]
): ManagedProcessSnapshot | null {
  return processes.find((processInfo) => processInfo.script === script) ?? null;
}

function displayProcessStatus(processInfo: ManagedProcessSnapshot | null): string {
  if (processInfo === null) {
    return 'idle';
  }

  if (processInfo.status === 'exited') {
    return processInfo.exitCode === 0 ? 'completed (0)' : `failed (${processInfo.exitCode ?? '?'})`;
  }

  if (processInfo.status === 'failed') {
    return `failed (${processInfo.exitCode ?? '?'})`;
  }

  return processInfo.status;
}

function scriptOrder(project: ScanResult): string[] {
  const preferred = ['build', 'build:web', 'build:cli', 'dev', 'lint', 'test', 'typecheck'];
  const ordered = preferred.filter((script) => project.scripts[script] !== undefined);
  const remaining = Object.keys(project.scripts).filter((script) => !ordered.includes(script));
  return [...ordered, ...remaining];
}

function isDangerousCommand(command: string): boolean {
  return /\b(rm\s+-rf|docker\s+volume\s+rm|drop\s+database|prisma\s+migrate\s+reset|git\s+clean\s+-fd)\b/i.test(
    command
  );
}

function configuredCommandGroups(
  project: ScanResult
): Array<{ name: string; commands: Array<{ name: string; command: string }> }> {
  const commands = project.config?.config.commands ?? {};
  const commandNames = Object.keys(commands);
  if (commandNames.length === 0) {
    return [];
  }

  const grouped = new Set<string>();
  const groups = Object.entries(project.config?.config.groups ?? {})
    .map(([name, entries]) => {
      const present = entries
        .filter((entry) => commands[entry] !== undefined)
        .map((entry) => {
          grouped.add(entry);
          return { name: entry, command: commands[entry] };
        });
      return { name, commands: present };
    })
    .filter((group) => group.commands.length > 0);

  const ungrouped = commandNames
    .filter((name) => !grouped.has(name))
    .map((name) => ({ name, command: commands[name] }));
  if (ungrouped.length > 0) {
    groups.push({ name: 'Configured Commands', commands: ungrouped });
  }

  return groups;
}

type DrawerKind =
  | 'settings'
  | 'scripts'
  | 'environment'
  | 'ports'
  | 'services'
  | 'health'
  | 'logs'
  | 'package'
  | 'terminal'
  | 'folder'
  | 'install'
  | null;

interface DashboardSettings {
  autoRefreshEnabled: boolean;
  autoRefreshSeconds: number;
  autoOpenAppUrl: boolean;
  confirmBeforeRun: boolean;
}

const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  autoRefreshEnabled: true,
  autoRefreshSeconds: 30,
  autoOpenAppUrl: true,
  confirmBeforeRun: true
};

type ActiveView = DashboardShortcutView;

const AUTO_OPEN_ATTEMPTS = 40;
const AUTO_OPEN_INTERVAL_MS = 500;
const APP_URL_PROBE_TIMEOUT_MS = 1_500;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function closePendingAppWindow(appWindow: Window | null): void {
  if (appWindow !== null && !appWindow.closed) {
    appWindow.close();
  }
}

function createPendingAppWindow(): Window | null {
  try {
    const appWindow = window.open('', '_blank');
    if (appWindow !== null) {
      appWindow.document.title = 'Starting local app';
      appWindow.document.body.innerHTML =
        '<main style="font: 14px system-ui; padding: 24px;">Starting local app...</main>';
    }
    return appWindow;
  } catch {
    return null;
  }
}

function openDetectedAppUrl(url: string, appWindow: Window | null): void {
  if (appWindow !== null && !appWindow.closed) {
    appWindow.location.href = url;
    appWindow.focus();
    return;
  }

  window.open(url, '_blank', 'noopener,noreferrer');
}

async function fetchProjectSnapshot(): Promise<ScanResult | null> {
  try {
    const response = await fetch('/api/project');
    return response.ok ? ((await response.json()) as ScanResult) : null;
  } catch {
    return null;
  }
}

async function localAppResponds(url: string): Promise<boolean> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), APP_URL_PROBE_TIMEOUT_MS);
  try {
    await fetch(url, {
      cache: 'no-store',
      mode: 'no-cors',
      signal: controller.signal
    });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function waitForAutoOpenUrl({
  previousPorts,
  candidatePorts,
  appWindow,
  onRefresh
}: {
  previousPorts: ScanResult['ports'];
  candidatePorts: number[];
  appWindow: Window | null;
  onRefresh: () => Promise<void>;
}): Promise<void> {
  for (let attempt = 0; attempt < AUTO_OPEN_ATTEMPTS; attempt += 1) {
    await delay(AUTO_OPEN_INTERVAL_MS);

    const nextProject = await fetchProjectSnapshot();
    if (nextProject === null) {
      continue;
    }

    const port = chooseAutoOpenPort(previousPorts, nextProject.ports, candidatePorts);
    if (port === null) {
      continue;
    }

    const url = appUrlForPort(port);
    if (await localAppResponds(url)) {
      openDetectedAppUrl(url, appWindow);
      await onRefresh();
      return;
    }
  }

  closePendingAppWindow(appWindow);
}

function Icon({ name }: { name: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">
      {name === 'terminal' ? (
        <>
          <path d="M4 5h16v14H4z" />
          <path d="m8 9 3 3-3 3" />
          <path d="M13 15h4" />
        </>
      ) : null}
      {name === 'home' ? (
        <>
          <path d="m3 11 9-7 9 7" />
          <path d="M6 10v10h12V10" />
          <path d="M10 20v-6h4v6" />
        </>
      ) : null}
      {name === 'script' ? (
        <>
          <path d="M4 5h16v14H4z" />
          <path d="m8 9 3 3-3 3" />
          <path d="M13 15h3" />
        </>
      ) : null}
      {name === 'env' ? (
        <>
          <path d="M6 19c3-1 5-4 5-8" />
          <path d="M11 11c2 0 5-2 6-6 2 4 1 8-2 10-2 2-5 2-7 1" />
          <path d="M4 14c2-1 4-1 6 1" />
        </>
      ) : null}
      {name === 'ports' ? (
        <>
          <path d="M12 4v5" />
          <path d="M6 15v5h12v-5" />
          <path d="M6 15h12" />
          <path d="M12 9H7v4" />
          <path d="M12 9h5v4" />
        </>
      ) : null}
      {name === 'box' ? (
        <>
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z" />
          <path d="M4 7.5 12 12l8-4.5" />
          <path d="M12 12v9" />
        </>
      ) : null}
      {name === 'heart' ? (
        <path d="M20 8.5c0 5-8 10.5-8 10.5S4 13.5 4 8.5A4.2 4.2 0 0 1 12 6a4.2 4.2 0 0 1 8 2.5Z" />
      ) : null}
      {name === 'doc' ? (
        <>
          <path d="M7 3h7l4 4v14H7z" />
          <path d="M14 3v5h4" />
          <path d="M10 13h5" />
          <path d="M10 17h4" />
        </>
      ) : null}
      {name === 'gear' ? (
        <>
          <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
          <path d="m19 13.5 1.5 1-2 3.5-1.7-.8a7 7 0 0 1-1.5.9L15 20h-6l-.3-1.9a7 7 0 0 1-1.5-.9l-1.7.8-2-3.5 1.5-1a7.7 7.7 0 0 1 0-1.8l-1.5-1 2-3.5 1.7.8a7 7 0 0 1 1.5-.9L9 5h6l.3 1.9a7 7 0 0 1 1.5.9l1.7-.8 2 3.5-1.5 1a7.7 7.7 0 0 1 0 2Z" />
        </>
      ) : null}
      {name === 'folder' ? (
        <>
          <path d="M3 7h7l2 2h9v10H3z" />
          <path d="M3 7v12" />
        </>
      ) : null}
      {name === 'download' ? (
        <>
          <path d="M12 4v10" />
          <path d="m8 10 4 4 4-4" />
          <path d="M5 20h14" />
        </>
      ) : null}
      {name === 'play' ? <path d="m8 5 10 7-10 7z" /> : null}
      {name === 'stop' ? <path d="M8 8h8v8H8z" /> : null}
      {name === 'refresh' ? (
        <>
          <path d="M20 6v5h-5" />
          <path d="M4 18v-5h5" />
          <path d="M18 9a6.5 6.5 0 0 0-10.8-2.4L4 11" />
          <path d="M6 15a6.5 6.5 0 0 0 10.8 2.4L20 13" />
        </>
      ) : null}
      {name === 'check' ? <path d="m5 12 4 4 10-10" /> : null}
      {name === 'alert' ? (
        <>
          <path d="M12 8v5" />
          <path d="M12 17h.01" />
          <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />
        </>
      ) : null}
      {name === 'chevron' ? <path d="m8 14 4-4 4 4" /> : null}
      {name === 'external' ? (
        <>
          <path d="M14 5h5v5" />
          <path d="m19 5-9 9" />
          <path d="M19 14v5H5V5h5" />
        </>
      ) : null}
    </svg>
  );
}

function Sidebar({
  version,
  activeView,
  collapsed,
  onSelectView,
  onToggleCollapsed
}: {
  version: string;
  activeView: ActiveView;
  collapsed: boolean;
  onSelectView: (view: ActiveView) => void;
  onToggleCollapsed: () => void;
}) {
  const items = [
    { icon: 'home', label: 'Overview', view: 'overview' },
    { icon: 'script', label: 'Scripts', view: 'scripts' },
    { icon: 'env', label: 'Environment', view: 'environment' },
    { icon: 'ports', label: 'Ports', view: 'ports' },
    { icon: 'box', label: 'Services', view: 'services' },
    { icon: 'heart', label: 'Repo Health', view: 'health' },
    { icon: 'doc', label: 'Logs', view: 'logs' }
  ] satisfies Array<{ icon: string; label: string; view: ActiveView }>;

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="brand-lockup">
        <span className="brand-mark">
          <Icon name="terminal" />
        </span>
        <strong>DevSurface</strong>
      </div>
      <nav className="side-nav" aria-label="Dashboard sections">
        {items.map((item) => (
          <button
            className={activeView === item.view ? 'active' : ''}
            key={item.label}
            onClick={() => onSelectView(item.view)}
            type="button"
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>
      <div className="sidebar-bottom">
        <button
          className={`sidebar-action ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => onSelectView('settings')}
          type="button"
        >
          <Icon name="gear" />
          <span>Settings</span>
        </button>
        <div className="runtime-note">
          <span>DevSurface v{version}</span>
          <span className="ready-line">
            <i />
            Ready
          </span>
        </div>
        <button
          className="collapse-button"
          onClick={onToggleCollapsed}
          type="button"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? '>>' : '<<'}
        </button>
      </div>
    </aside>
  );
}

function Topbar({ project, onRefresh }: { project: ScanResult; onRefresh: () => Promise<void> }) {
  return (
    <header className="topbar">
      <div className="workspace-crumb">
        <Icon name="folder" />
        <strong>{project.projectName}</strong>
        <span>&middot;</span>
        <code>{formatPath(project.root)}</code>
      </div>
      <button className="refresh-button" onClick={() => void onRefresh()} type="button">
        <Icon name="refresh" />
        Refresh
        <kbd>F5</kbd>
      </button>
    </header>
  );
}

function OverviewMatrix({ project, lastRefreshed }: { project: ScanResult; lastRefreshed: Date }) {
  const packageData = project.packageJson?.data;
  const viteVersion =
    packageData?.devDependencies?.vite?.replace(/^[^\d]*/, 'v') ??
    (project.framework?.detected.includes('Vite') ? 'detected' : 'unknown');
  const nodeVersion = packageData?.engines?.node ?? 'local';
  const env = project.env;

  const items = [
    {
      icon: 'folder',
      label: 'Project',
      value: project.projectName
    },
    {
      icon: 'download',
      label: 'Root Path',
      value: formatPath(project.root)
    },
    {
      icon: 'check',
      label: 'Package Manager',
      value: project.packageManager ?? 'unknown',
      tone: project.packageManager ? 'ok' : 'muted'
    },
    {
      icon: 'check',
      label: 'Node.js',
      value: nodeVersion,
      tone: 'ok'
    },
    {
      icon: 'ports',
      label: 'Branch',
      value: project.git?.branch ?? 'not detected'
    },
    {
      icon: 'box',
      label: 'Framework',
      value: project.framework?.type ?? viteVersion,
      tone: project.framework ? 'ok' : 'muted'
    },
    {
      icon: 'doc',
      label: 'README',
      value: project.readme.exists ? 'found' : 'missing',
      tone: project.readme.exists ? 'ok' : 'bad'
    },
    {
      icon: 'doc',
      label: 'LICENSE',
      value: project.license.exists ? 'found' : 'missing',
      tone: project.license.exists ? 'ok' : 'bad'
    },
    {
      icon: 'doc',
      label: '.env.example',
      value: env?.hasExample ? 'found' : 'missing',
      tone: env?.hasExample ? 'ok' : 'muted'
    },
    {
      icon: 'alert',
      label: '.env',
      value: env?.hasLocal ? 'found' : 'missing',
      tone: env?.hasLocal ? 'ok' : 'bad'
    },
    {
      icon: 'refresh',
      label: 'Last Refreshed',
      value: formatTime(lastRefreshed)
    }
  ];

  return (
    <section className="overview-section" id="overview">
      <h1>Project Overview</h1>
      <div className="overview-matrix">
        {items.map((item) => (
          <div className="overview-cell" key={`${item.label}-${item.value}`}>
            <span className={`metric-icon ${item.tone ?? ''}`}>
              <Icon name={item.icon} />
            </span>
            <div>
              <span className="cell-label">{item.label}</span>
              <strong
                className={item.tone === 'bad' ? 'text-bad' : item.tone === 'ok' ? 'text-ok' : ''}
              >
                {item.value}
              </strong>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function QuickActionStrip({
  packageManager,
  onRunScript,
  onOpenTerminal,
  onOpenFolder,
  onViewPackage,
  onInstall
}: {
  packageManager: ScanResult['packageManager'];
  onRunScript: () => void;
  onOpenTerminal: () => void;
  onOpenFolder: () => void;
  onViewPackage: () => void;
  onInstall: () => void;
}) {
  const manager = packageManager ?? 'npm';
  const installCommand = manager === 'npm' ? 'npm ci' : `${manager} install`;
  const actions = [
    { icon: 'play', label: 'Scripts', title: 'Open scripts', onClick: onRunScript },
    { icon: 'terminal', label: 'Terminal', title: 'Open in terminal', onClick: onOpenTerminal },
    { icon: 'folder', label: 'Folder', title: 'Open project folder', onClick: onOpenFolder },
    { icon: 'script', label: 'package.json', title: 'Open package.json', onClick: onViewPackage },
    { icon: 'download', label: 'Install', title: `Run ${installCommand}`, onClick: onInstall }
  ];

  return (
    <section className="quick-section">
      <h2>Quick Actions</h2>
      <div className="quick-actions">
        {actions.map((action) => (
          <button
            className="utility-button"
            key={action.label}
            onClick={action.onClick}
            title={action.title}
            type="button"
          >
            <Icon name={action.icon} />
            <span className="button-label">{action.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ScriptsTable({
  project,
  processes,
  selectedScript,
  onRun,
  onStop,
  onSelect
}: {
  project: ScanResult;
  processes: ManagedProcessSnapshot[];
  selectedScript: string | null;
  onRun: (script: string) => Promise<void>;
  onStop: (pid: string) => Promise<void>;
  onSelect: (script: string) => void;
}) {
  const scripts = scriptOrder(project);

  return (
    <section className="scripts-section" id="scripts">
      <h2>Scripts</h2>
      <div className="scripts-table" role="table" aria-label="Package scripts">
        <div className="script-head" role="row">
          <span>Script</span>
          <span>Command</span>
          <span>Status</span>
          <span>Controls</span>
        </div>
        {scripts.map((script) => {
          const processInfo = statusForScript(script, processes);
          const status = processInfo?.status ?? 'idle';
          const statusLabel = displayProcessStatus(processInfo);
          const running = processInfo?.status === 'running';
          return (
            <div
              className={`script-item ${selectedScript === script ? 'selected' : ''}`}
              key={script}
              role="row"
              onClick={() => onSelect(script)}
            >
              <strong>{script}</strong>
              <code>{compactCommand(project.scripts[script])}</code>
              <span className={`script-status status-${status}`}>
                <i />
                {statusLabel}
              </span>
              <div className="script-controls">
                {running ? (
                  <button
                    className="run-button stop-button"
                    onClick={() => void onStop(processInfo.pid)}
                    type="button"
                  >
                    <Icon name="stop" />
                    Stop
                  </button>
                ) : (
                  <>
                    <button className="run-button" onClick={() => void onRun(script)} type="button">
                      <Icon name="play" />
                      Run
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="script-tip">
        <Icon name="alert" />
        Tip: Click Run to execute a script. Long-running scripts will show Stop.
      </p>
    </section>
  );
}

function ConfiguredCommandsSection({
  project,
  processes,
  onRun,
  onStop
}: {
  project: ScanResult;
  processes: ManagedProcessSnapshot[];
  onRun: (name: string, command: string) => Promise<void>;
  onStop: (pid: string) => Promise<void>;
}) {
  const groups = configuredCommandGroups(project);

  if (groups.length === 0) {
    return null;
  }

  return (
    <DrawerSection title="Configured Commands">
      <div className="configured-command-groups">
        {project.config?.config.docs ? (
          <a
            className="docs-link"
            href={project.config.config.docs}
            rel="noreferrer"
            target="_blank"
          >
            Project docs
          </a>
        ) : null}
        {groups.map((group) => (
          <section className="configured-command-group" key={group.name}>
            <h4>{group.name}</h4>
            <div className="configured-command-table">
              {group.commands.map(({ name, command }) => {
                const processInfo = statusForScript(name, processes);
                const running = processInfo?.status === 'running';
                const dangerous = isDangerousCommand(command);
                return (
                  <div
                    className={`configured-command-row ${dangerous ? 'dangerous' : ''}`}
                    key={`${group.name}-${name}`}
                  >
                    <strong>{name}</strong>
                    <code>{command}</code>
                    <span className={`script-status status-${processInfo?.status ?? 'idle'}`}>
                      <i />
                      {displayProcessStatus(processInfo ?? null)}
                    </span>
                    {dangerous ? <span className="danger-label">Dangerous</span> : <span />}
                    {running ? (
                      <button
                        className="minor-button"
                        onClick={() => void onStop(processInfo.pid)}
                        type="button"
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        className="minor-button"
                        onClick={() => void onRun(name, command)}
                        type="button"
                      >
                        <Icon name="play" />
                        Run
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </DrawerSection>
  );
}

function InspectorPanel({
  title,
  icon,
  children,
  footer
}: {
  title: string;
  icon: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="inspector-card">
      <header>
        <div>
          <Icon name={icon} />
          <h2>{title}</h2>
        </div>
        <Icon name="chevron" />
      </header>
      <div className="inspector-body">{children}</div>
      {footer ? <footer>{footer}</footer> : null}
    </section>
  );
}

function EnvironmentInspector({
  project,
  onCopyEnv,
  onViewAll
}: {
  project: ScanResult;
  onCopyEnv: () => Promise<void>;
  onViewAll: () => void;
}) {
  const env = project.env;
  const rows =
    env?.keys.slice(0, 4).map((item) => ({
      name: item.key,
      value: item.present ? (item.empty ? 'empty' : 'present') : 'missing',
      tone: item.present && !item.empty ? 'ok' : 'bad'
    })) ?? [];

  const fixedRows = [
    ...rows,
    {
      name: '.env',
      value: env?.hasLocal ? 'found' : 'missing',
      tone: env?.hasLocal ? 'ok' : 'bad'
    },
    {
      name: '.env.example',
      value: env?.hasExample ? 'found' : 'missing',
      tone: env?.hasExample ? 'ok' : 'ok-muted'
    }
  ];

  return (
    <InspectorPanel
      title="Environment"
      icon="script"
      footer={
        <>
          <span>{env?.keys.length ?? 0} variables</span>
          {env?.hasExample && !env.hasLocal ? (
            <button className="minor-button" onClick={() => void onCopyEnv()} type="button">
              Copy .env
            </button>
          ) : (
            <button className="minor-button" onClick={onViewAll} type="button">
              View All
              <span>&rsaquo;</span>
            </button>
          )}
        </>
      }
    >
      <div className="key-value-list">
        {fixedRows.map((row) => (
          <div className="key-value-row" key={row.name}>
            <code>{row.name}</code>
            <strong className={row.tone === 'bad' ? 'text-bad' : 'text-ok'}>{row.value}</strong>
          </div>
        ))}
      </div>
    </InspectorPanel>
  );
}

function PortsInspector({
  project,
  onCheckPorts
}: {
  project: ScanResult;
  onCheckPorts: () => void;
}) {
  return (
    <InspectorPanel
      title="Ports"
      icon="ports"
      footer={
        <>
          <span>
            {project.ports.length} port{project.ports.length === 1 ? '' : 's'}
          </span>
          <button className="minor-button" onClick={onCheckPorts} type="button">
            <Icon name="refresh" />
            Check Ports
          </button>
        </>
      }
    >
      <div className="port-list">
        {project.ports.length === 0 ? (
          <span className="muted-copy">No configured ports</span>
        ) : (
          project.ports.map((port) => (
            <div className="port-entry" key={port.port}>
              <strong>{port.port}</strong>
              <code>http://localhost:{port.port}</code>
              <span className={port.inUse ? 'badge bad' : 'badge ok'}>
                <i />
                {port.inUse ? 'in use' : 'available'}
              </span>
            </div>
          ))
        )}
      </div>
    </InspectorPanel>
  );
}

function ServicesInspector({ project, onDetect }: { project: ScanResult; onDetect: () => void }) {
  const docker = project.docker;
  return (
    <InspectorPanel
      title="Services"
      icon="box"
      footer={
        <>
          <span>
            {docker?.services.filter((service) => service.status === 'running').length ?? 0}{' '}
            services running
          </span>
          <button className="minor-button" onClick={onDetect} type="button">
            <Icon name="refresh" />
            Detect
          </button>
        </>
      }
    >
      <div className="service-state">
        <span>Docker Compose</span>
        <strong className={docker === null ? 'text-bad' : 'text-ok'}>
          {docker === null ? 'not detected' : docker.dockerRunning ? 'running' : 'detected'}
          {docker === null ? <Icon name="alert" /> : null}
        </strong>
      </div>
    </InspectorPanel>
  );
}

function RepoHealthInspector({
  warnings,
  lastRefreshed,
  onRunCheck
}: {
  warnings: DoctorWarning[];
  lastRefreshed: Date;
  onRunCheck: () => void;
}) {
  const healthy = warnings.length === 0;
  return (
    <InspectorPanel
      title="Repo Health"
      icon="heart"
      footer={
        <>
          <span>
            Last checked:{' '}
            {lastRefreshed.toLocaleTimeString([], {
              hour: 'numeric',
              minute: '2-digit',
              second: '2-digit'
            })}
          </span>
          <button className="minor-button" onClick={onRunCheck} type="button">
            <Icon name="refresh" />
            Run Check
          </button>
        </>
      }
    >
      <div className="health-state">
        <span className={healthy ? 'round-status ok' : 'round-status bad'}>
          <Icon name={healthy ? 'check' : 'alert'} />
        </span>
        <div>
          <strong>
            {healthy
              ? 'No health warnings'
              : `${warnings.length} warning${warnings.length === 1 ? '' : 's'}`}
          </strong>
          <p>{healthy ? 'All good.' : warnings[0]?.message}</p>
        </div>
      </div>
    </InspectorPanel>
  );
}

function LogsInspector({
  connection,
  logs,
  onOpenLogs
}: {
  connection: 'connecting' | 'open' | 'closed';
  logs: ProcessLogEvent[];
  onOpenLogs: () => void;
}) {
  return (
    <InspectorPanel
      title="Logs"
      icon="doc"
      footer={
        <button className="minor-button log-open" onClick={onOpenLogs} type="button">
          Open Logs
          <Icon name="external" />
        </button>
      }
    >
      <div className="log-meta">
        <span>Log Connection</span>
        <strong
          className={connection === 'open' ? 'text-ok' : connection === 'closed' ? 'text-bad' : ''}
        >
          {connection}
          <i className={`connection-dot ${connection}`} />
        </strong>
      </div>
      <div className="log-meta">
        <span>Entries</span>
        <strong>{logs.length}</strong>
      </div>
    </InspectorPanel>
  );
}

function copyText(text: string): void {
  void navigator.clipboard?.writeText(text).catch(() => undefined);
}

function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="drawer-section">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function CommandBlock({ command }: { command: string }) {
  return (
    <div className="command-block">
      <code>{command}</code>
      <button className="minor-button" onClick={() => copyText(command)} type="button">
        Copy
      </button>
    </div>
  );
}

function AutoOpenUrlToggle({
  settings,
  onSettingsChange,
  compact = false
}: {
  settings: DashboardSettings;
  onSettingsChange: (settings: DashboardSettings) => void;
  compact?: boolean;
}) {
  return (
    <label className={`checkbox-control ${compact ? 'compact' : ''}`}>
      <input
        checked={settings.autoOpenAppUrl}
        onChange={(event) =>
          onSettingsChange({ ...settings, autoOpenAppUrl: event.target.checked })
        }
        type="checkbox"
      />
      <span>Auto-open URL</span>
    </label>
  );
}

function DashboardSettingsFields({
  settings,
  onSettingsChange
}: {
  settings: DashboardSettings;
  onSettingsChange: (settings: DashboardSettings) => void;
}) {
  return (
    <>
      <label className="setting-row">
        <span>
          <strong>Auto refresh</strong>
          <em>Refresh scan data on a timer.</em>
        </span>
        <span className="setting-control-group">
          <input
            checked={settings.autoRefreshEnabled}
            onChange={(event) =>
              onSettingsChange({ ...settings, autoRefreshEnabled: event.target.checked })
            }
            type="checkbox"
          />
          <select
            disabled={!settings.autoRefreshEnabled}
            value={settings.autoRefreshSeconds}
            onChange={(event) =>
              onSettingsChange({
                ...settings,
                autoRefreshSeconds: Number(event.target.value)
              })
            }
          >
            <option value={10}>10 sec</option>
            <option value={30}>30 sec</option>
            <option value={60}>60 sec</option>
          </select>
        </span>
      </label>
      <label className="setting-row">
        <span>
          <strong>Auto-open app URL</strong>
          <em>Open a local app tab after server-like scripts start.</em>
        </span>
        <input
          checked={settings.autoOpenAppUrl}
          onChange={(event) =>
            onSettingsChange({ ...settings, autoOpenAppUrl: event.target.checked })
          }
          type="checkbox"
        />
      </label>
      <label className="setting-row">
        <span>
          <strong>Confirm script runs</strong>
          <em>Ask before executing package scripts.</em>
        </span>
        <input
          checked={settings.confirmBeforeRun}
          onChange={(event) =>
            onSettingsChange({ ...settings, confirmBeforeRun: event.target.checked })
          }
          type="checkbox"
        />
      </label>
    </>
  );
}

function LogConsole({ logs, limit = 220 }: { logs: ProcessLogEvent[]; limit?: number }) {
  const visibleLogs = logs.slice(-limit);

  return (
    <div className="log-console" role="log" aria-label="Process output">
      {visibleLogs.length === 0 ? (
        <div className="log-empty">No log entries yet.</div>
      ) : (
        visibleLogs.map((log, index) => (
          <div className={`log-console-line ${log.stream}`} key={`${log.timestamp}-${index}`}>
            <time>{new Date(log.timestamp).toLocaleTimeString()}</time>
            <strong>{log.script}</strong>
            <span>{log.stream}</span>
            <pre>{log.message}</pre>
          </div>
        ))
      )}
    </div>
  );
}

function LogsWorkspace({
  processes,
  logs,
  compact = false
}: {
  processes: ManagedProcessSnapshot[];
  logs: ProcessLogEvent[];
  compact?: boolean;
}) {
  const logsByPid = useMemo(() => {
    const grouped = new Map<string, ProcessLogEvent[]>();
    for (const log of logs) {
      const processLogs = grouped.get(log.pid) ?? [];
      processLogs.push(log);
      grouped.set(log.pid, processLogs);
    }
    return grouped;
  }, [logs]);

  return (
    <div className={`logs-workspace ${compact ? 'compact' : ''}`}>
      <section className="log-process-panel">
        <header>
          <div>
            <span>Processes</span>
            <strong>
              {processes.length} command{processes.length === 1 ? '' : 's'}
            </strong>
          </div>
          <em>
            {logs.length} captured log line{logs.length === 1 ? '' : 's'}
          </em>
        </header>
        {processes.length === 0 ? (
          <p className="log-process-empty">
            Run a script or install dependencies to create a log stream.
          </p>
        ) : (
          <div className="log-process-table" aria-label="Managed processes">
            {processes.map((processInfo) => {
              const processLogs = logsByPid.get(processInfo.pid) ?? [];
              const stderrCount = processLogs.filter((log) => log.stream === 'stderr').length;
              return (
                <details
                  className={`log-process-row status-${processInfo.status}`}
                  key={processInfo.pid}
                >
                  <summary>
                    <strong>{processInfo.script}</strong>
                    <code>{processInfo.command}</code>
                    <span className={`script-status status-${processInfo.status}`}>
                      <i />
                      {displayProcessStatus(processInfo)}
                    </span>
                    <span>
                      {processLogs.length} line{processLogs.length === 1 ? '' : 's'}
                      {stderrCount > 0 ? `, ${stderrCount} stderr` : ''}
                    </span>
                    <code>#{processInfo.pid}</code>
                    <span className="process-logs-trigger">
                      Logs
                      <Icon name="chevron" />
                    </span>
                  </summary>
                  <LogConsole logs={processLogs} limit={compact ? 90 : 260} />
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function DetailDrawer({
  drawer,
  project,
  warnings,
  logs,
  processes,
  settings,
  lastRefreshed,
  onRunScript,
  onStopProcess,
  onClose,
  onSettingsChange
}: {
  drawer: DrawerKind;
  project: ScanResult;
  warnings: DoctorWarning[];
  logs: ProcessLogEvent[];
  processes: ManagedProcessSnapshot[];
  settings: DashboardSettings;
  lastRefreshed: Date;
  onRunScript: (script: string) => Promise<void>;
  onStopProcess: (pid: string) => Promise<void>;
  onClose: () => void;
  onSettingsChange: (settings: DashboardSettings) => void;
}) {
  if (drawer === null) {
    return null;
  }

  const packageData = project.packageJson?.data;
  const manager = project.packageManager ?? 'npm';
  const installCommand = manager === 'npm' ? 'npm ci' : `${manager} install`;
  const terminalCommand = `Set-Location '${project.root}'`;
  const drawerTitle =
    drawer === 'settings'
      ? 'Settings'
      : drawer === 'scripts'
        ? 'Scripts'
        : drawer === 'environment'
          ? 'Environment'
          : drawer === 'ports'
            ? 'Ports'
            : drawer === 'services'
              ? 'Services'
              : drawer === 'health'
                ? 'Repo Health'
                : drawer === 'logs'
                  ? 'Logs'
                  : drawer === 'package'
                    ? 'package.json'
                    : drawer === 'terminal'
                      ? 'Terminal'
                      : drawer === 'folder'
                        ? 'Project Folder'
                        : 'Install';

  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <aside
        className="detail-drawer"
        aria-label={drawerTitle}
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <span className="drawer-kicker">DevSurface</span>
            <h2>{drawerTitle}</h2>
          </div>
          <button className="drawer-close" onClick={onClose} type="button" aria-label="Close panel">
            Close
          </button>
        </header>

        {drawer === 'settings' ? (
          <div className="drawer-content">
            <DrawerSection title="Dashboard">
              <DashboardSettingsFields settings={settings} onSettingsChange={onSettingsChange} />
            </DrawerSection>
            <DrawerSection title="Workspace">
              <CommandBlock command={terminalCommand} />
              <p className="drawer-note">Project root: {formatPath(project.root)}</p>
            </DrawerSection>
          </div>
        ) : null}

        {drawer === 'scripts' ? (
          <div className="drawer-content">
            <div className="drawer-toolbar">
              <AutoOpenUrlToggle compact settings={settings} onSettingsChange={onSettingsChange} />
            </div>
            <DrawerSection title="All Package Scripts">
              <div className="drawer-table script-drawer-table">
                {Object.entries(project.scripts).map(([script, command]) => {
                  const processInfo = statusForScript(script, processes);
                  const running = processInfo?.status === 'running';
                  return (
                    <div className="drawer-row" key={script}>
                      <strong>{script}</strong>
                      <code>{command}</code>
                      <span className={`script-status status-${processInfo?.status ?? 'idle'}`}>
                        <i />
                        {displayProcessStatus(processInfo ?? null)}
                      </span>
                      {running ? (
                        <button
                          className="minor-button"
                          onClick={() => void onStopProcess(processInfo.pid)}
                          type="button"
                        >
                          Stop
                        </button>
                      ) : (
                        <button
                          className="minor-button"
                          onClick={() => void onRunScript(script)}
                          type="button"
                        >
                          <Icon name="play" />
                          Run
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </DrawerSection>
            <p className="drawer-note">
              Scripts run through the dashboard stream output into Logs.
            </p>
          </div>
        ) : null}

        {drawer === 'environment' ? (
          <div className="drawer-content">
            <DrawerSection title="Env Files">
              <div className="drawer-table two-col">
                <span>.env</span>
                <strong className={project.env?.hasLocal ? 'text-ok' : 'text-bad'}>
                  {project.env?.hasLocal ? 'found' : 'missing'}
                </strong>
                <span>.env.example</span>
                <strong className={project.env?.hasExample ? 'text-ok' : 'text-bad'}>
                  {project.env?.hasExample ? 'found' : 'missing'}
                </strong>
              </div>
            </DrawerSection>
            <DrawerSection title="Variables">
              {project.env === null || project.env.keys.length === 0 ? (
                <p className="drawer-note">No env variables were detected.</p>
              ) : (
                <div className="drawer-table two-col">
                  {project.env.keys.map((item) => (
                    <div className="drawer-row" key={item.key}>
                      <code>{item.key}</code>
                      <strong className={item.present && !item.empty ? 'text-ok' : 'text-bad'}>
                        {item.present ? (item.empty ? 'empty' : 'present') : 'missing'}
                      </strong>
                    </div>
                  ))}
                </div>
              )}
            </DrawerSection>
          </div>
        ) : null}

        {drawer === 'ports' ? (
          <div className="drawer-content">
            <DrawerSection title="Detected Ports">
              {project.ports.length === 0 ? (
                <p className="drawer-note">No configured or inferred ports.</p>
              ) : (
                <div className="drawer-table three-col">
                  {project.ports.map((port) => (
                    <div className="drawer-row" key={port.port}>
                      <strong>{port.port}</strong>
                      <code>http://localhost:{port.port}</code>
                      <span className={port.inUse ? 'text-bad' : 'text-ok'}>
                        {port.inUse ? 'in use' : 'available'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </DrawerSection>
            <p className="drawer-note">Last checked: {formatTime(lastRefreshed)}</p>
          </div>
        ) : null}

        {drawer === 'services' ? (
          <div className="drawer-content">
            <DrawerSection title="Docker Compose">
              {project.docker === null ? (
                <p className="drawer-note">No Docker Compose file was detected in this project.</p>
              ) : (
                <div className="drawer-table two-col">
                  {project.docker.services.map((service) => (
                    <div className="drawer-row" key={service.name}>
                      <strong>{service.name}</strong>
                      <span>{service.status}</span>
                    </div>
                  ))}
                </div>
              )}
            </DrawerSection>
          </div>
        ) : null}

        {drawer === 'health' ? (
          <div className="drawer-content">
            <DrawerSection title="Doctor Check">
              {warnings.length === 0 ? (
                <p className="drawer-note">No health warnings. All good.</p>
              ) : (
                <div className="drawer-list">
                  {warnings.map((warning) => (
                    <article className={`drawer-warning ${warning.severity}`} key={warning.id}>
                      <strong>{warning.title}</strong>
                      <p>{warning.message}</p>
                    </article>
                  ))}
                </div>
              )}
            </DrawerSection>
            <p className="drawer-note">Last checked: {formatTime(lastRefreshed)}</p>
          </div>
        ) : null}

        {drawer === 'logs' ? (
          <div className="drawer-content">
            <LogsWorkspace processes={processes} logs={logs} compact />
          </div>
        ) : null}

        {drawer === 'package' ? (
          <div className="drawer-content">
            <DrawerSection title="Package">
              <div className="drawer-table two-col">
                <span>Name</span>
                <strong>{packageData?.name ?? project.projectName}</strong>
                <span>Version</span>
                <strong>{packageData?.version ?? 'unknown'}</strong>
                <span>Package manager</span>
                <strong>{manager}</strong>
              </div>
            </DrawerSection>
            <DrawerSection title="Scripts">
              <div className="drawer-table two-col">
                {Object.entries(project.scripts).map(([script, command]) => (
                  <div className="drawer-row" key={script}>
                    <strong>{script}</strong>
                    <code>{command}</code>
                  </div>
                ))}
              </div>
            </DrawerSection>
          </div>
        ) : null}

        {drawer === 'terminal' ? (
          <div className="drawer-content">
            <DrawerSection title="Terminal">
              <CommandBlock command={terminalCommand} />
              <p className="drawer-note">
                DevSurface asked the operating system to open a terminal at the project root. The
                command is here if your system blocks the launch.
              </p>
            </DrawerSection>
          </div>
        ) : null}

        {drawer === 'folder' ? (
          <div className="drawer-content">
            <DrawerSection title="Folder Path">
              <CommandBlock command={project.root} />
              <p className="drawer-note">
                DevSurface asked the operating system to open this folder. The path is here if your
                system blocks browser-triggered launches.
              </p>
            </DrawerSection>
          </div>
        ) : null}

        {drawer === 'install' ? (
          <div className="drawer-content">
            <DrawerSection title="Install Command">
              <CommandBlock command={installCommand} />
              <p className="drawer-note">Run this in the project root to restore dependencies.</p>
            </DrawerSection>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

function SectionPage({
  view,
  project,
  warnings,
  logs,
  processes,
  settings,
  lastRefreshed,
  onRunScript,
  onRunConfiguredCommand,
  onStopProcess,
  onRefresh,
  onSettingsChange
}: {
  view: Exclude<ActiveView, 'overview'>;
  project: ScanResult;
  warnings: DoctorWarning[];
  logs: ProcessLogEvent[];
  processes: ManagedProcessSnapshot[];
  settings: DashboardSettings;
  lastRefreshed: Date;
  onRunScript: (script: string) => Promise<void>;
  onRunConfiguredCommand: (name: string, command: string) => Promise<void>;
  onStopProcess: (pid: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSettingsChange: (settings: DashboardSettings) => void;
}) {
  const titleMap: Record<Exclude<ActiveView, 'overview'>, string> = {
    scripts: 'Scripts',
    environment: 'Environment',
    ports: 'Ports',
    services: 'Services',
    health: 'Repo Health',
    logs: 'Logs',
    settings: 'Settings'
  };

  const manager = project.packageManager ?? 'npm';
  const installCommand = manager === 'npm' ? 'npm ci' : `${manager} install`;

  return (
    <section className="section-page">
      <header className="section-page-header">
        <div>
          <span className="drawer-kicker">DevSurface</span>
          <h1>{titleMap[view]}</h1>
        </div>
        <div className="section-header-actions">
          {view === 'scripts' ? (
            <AutoOpenUrlToggle compact settings={settings} onSettingsChange={onSettingsChange} />
          ) : null}
          {view !== 'settings' ? (
            <button
              className="utility-button compact"
              onClick={() => void onRefresh()}
              type="button"
            >
              <Icon name="refresh" />
              Refresh Data
            </button>
          ) : null}
        </div>
      </header>

      {view === 'scripts' ? (
        <div className="section-grid single">
          <ConfiguredCommandsSection
            project={project}
            processes={processes}
            onRun={onRunConfiguredCommand}
            onStop={onStopProcess}
          />
          <DrawerSection title="All Package Scripts">
            <div className="drawer-table script-drawer-table">
              {Object.entries(project.scripts).map(([script, command]) => {
                const processInfo = statusForScript(script, processes);
                const running = processInfo?.status === 'running';
                return (
                  <div className="drawer-row" key={script}>
                    <strong>{script}</strong>
                    <code>{command}</code>
                    <span className={`script-status status-${processInfo?.status ?? 'idle'}`}>
                      <i />
                      {displayProcessStatus(processInfo ?? null)}
                    </span>
                    {running ? (
                      <button
                        className="minor-button"
                        onClick={() => void onStopProcess(processInfo.pid)}
                        type="button"
                      >
                        Stop
                      </button>
                    ) : (
                      <button
                        className="minor-button"
                        onClick={() => void onRunScript(script)}
                        type="button"
                      >
                        <Icon name="play" />
                        Run
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </DrawerSection>
          <DrawerSection title="Run Notes">
            <p className="drawer-note">
              Long-running scripts stay attached to DevSurface and stream output into Logs.
            </p>
          </DrawerSection>
        </div>
      ) : null}

      {view === 'environment' ? (
        <div className="section-grid">
          <DrawerSection title="Env Files">
            <div className="drawer-table two-col">
              <span>.env</span>
              <strong className={project.env?.hasLocal ? 'text-ok' : 'text-bad'}>
                {project.env?.hasLocal ? 'found' : 'missing'}
              </strong>
              <span>.env.example</span>
              <strong className={project.env?.hasExample ? 'text-ok' : 'text-bad'}>
                {project.env?.hasExample ? 'found' : 'missing'}
              </strong>
            </div>
          </DrawerSection>
          <DrawerSection title="Variables">
            {project.env === null || project.env.keys.length === 0 ? (
              <p className="drawer-note">No env variables were detected.</p>
            ) : (
              <div className="drawer-table two-col">
                {project.env.keys.map((item) => (
                  <div className="drawer-row" key={item.key}>
                    <code>{item.key}</code>
                    <strong className={item.present && !item.empty ? 'text-ok' : 'text-bad'}>
                      {item.present ? (item.empty ? 'empty' : 'present') : 'missing'}
                    </strong>
                  </div>
                ))}
              </div>
            )}
          </DrawerSection>
        </div>
      ) : null}

      {view === 'ports' ? (
        <div className="section-grid single">
          <DrawerSection title="Detected Ports">
            {project.ports.length === 0 ? (
              <p className="drawer-note">No configured or inferred ports.</p>
            ) : (
              <div className="drawer-table three-col">
                {project.ports.map((port) => (
                  <div className="drawer-row" key={port.port}>
                    <strong>{port.port}</strong>
                    <code>http://localhost:{port.port}</code>
                    <span className={port.inUse ? 'text-bad' : 'text-ok'}>
                      {port.inUse ? 'in use' : 'available'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </DrawerSection>
          <p className="drawer-note">Last checked: {formatTime(lastRefreshed)}</p>
        </div>
      ) : null}

      {view === 'services' ? (
        <div className="section-grid">
          <DrawerSection title="Docker Compose">
            {project.docker === null ? (
              <p className="drawer-note">No Docker Compose file was detected in this project.</p>
            ) : (
              <div className="drawer-table two-col">
                {project.docker.services.map((service) => (
                  <div className="drawer-row" key={service.name}>
                    <strong>{service.name}</strong>
                    <span>{service.status}</span>
                  </div>
                ))}
              </div>
            )}
          </DrawerSection>
          <DrawerSection title="Install Command">
            <CommandBlock command={installCommand} />
          </DrawerSection>
        </div>
      ) : null}

      {view === 'health' ? (
        <div className="section-grid single">
          <DrawerSection title="Doctor Check">
            {warnings.length === 0 ? (
              <p className="drawer-note">No health warnings. All good.</p>
            ) : (
              <div className="drawer-list">
                {warnings.map((warning) => (
                  <article className={`drawer-warning ${warning.severity}`} key={warning.id}>
                    <strong>{warning.title}</strong>
                    <p>{warning.message}</p>
                  </article>
                ))}
              </div>
            )}
          </DrawerSection>
          <p className="drawer-note">Last checked: {formatTime(lastRefreshed)}</p>
        </div>
      ) : null}

      {view === 'logs' ? <LogsWorkspace processes={processes} logs={logs} /> : null}

      {view === 'settings' ? (
        <div className="section-grid">
          <DrawerSection title="Dashboard">
            <DashboardSettingsFields settings={settings} onSettingsChange={onSettingsChange} />
          </DrawerSection>
          <DrawerSection title="Workspace">
            <CommandBlock command={`Set-Location '${project.root}'`} />
            <p className="drawer-note">Project root: {formatPath(project.root)}</p>
          </DrawerSection>
        </div>
      ) : null}
    </section>
  );
}

export default function App() {
  const projectState = useProject();
  const socket = useSocket();
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const [selectedScript, setSelectedScript] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('overview');
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [settings, setSettings] = useState<DashboardSettings>(() => ({
    ...DEFAULT_DASHBOARD_SETTINGS
  }));
  const processes = useMemo(
    () => mergeProcesses(projectState.processes, socket.processes),
    [projectState.processes, socket.processes]
  );
  const logs = useMemo(
    () => mergeLogs(projectState.logs, socket.logs),
    [projectState.logs, socket.logs]
  );
  const projectLoaded = projectState.project !== null;

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent): void {
      const action = getDashboardShortcut(event);
      if (action === null) {
        return;
      }

      event.preventDefault();

      if (action.type === 'closeDrawer') {
        setDrawer(null);
        return;
      }

      if (action.type === 'refresh') {
        void refreshProject();
        return;
      }

      if (action.type === 'toggleSidebar') {
        setSidebarCollapsed((current) => !current);
        return;
      }

      setActiveView(action.view);
      setDrawer(null);
      if (action.view === 'overview') {
        document.getElementById('overview')?.scrollIntoView({ behavior: 'smooth' });
      }
    }

    window.addEventListener('keydown', handleShortcut);
    return () => window.removeEventListener('keydown', handleShortcut);
  }, []);

  useEffect(() => {
    if (!settings.autoRefreshEnabled || settings.autoRefreshSeconds <= 0 || !projectLoaded) {
      return undefined;
    }

    const interval = window.setInterval(() => {
      void refreshProject();
    }, settings.autoRefreshSeconds * 1000);

    return () => window.clearInterval(interval);
  }, [projectLoaded, settings.autoRefreshEnabled, settings.autoRefreshSeconds]);

  async function refreshProject(): Promise<void> {
    await projectState.refresh();
    setLastRefreshed(new Date());
  }

  async function postDashboardAction(pathname: string): Promise<boolean> {
    const response = await fetch(pathname, {
      method: 'POST',
      headers: {
        'X-DevSurface-Intent': 'dashboard'
      }
    });
    return response.ok;
  }

  async function openTerminal(): Promise<void> {
    const opened = await postDashboardAction('/api/open/terminal').catch(() => false);
    setDrawer(null);
    if (!opened) {
      window.alert('Unable to open a terminal from this platform.');
    }
  }

  async function openFolder(): Promise<void> {
    const opened = await postDashboardAction('/api/open/folder').catch(() => false);
    setDrawer(null);
    if (!opened) {
      window.alert('Unable to open the project folder.');
    }
  }

  async function viewPackageJson(): Promise<void> {
    const opened = await postDashboardAction('/api/open/package').catch(() => false);
    setDrawer(null);
    if (!opened) {
      window.alert('Unable to open package.json.');
    }
  }

  async function installDependencies(): Promise<void> {
    const manager = projectState.project?.packageManager ?? 'npm';
    const command = manager === 'npm' ? 'npm ci' : `${manager} install`;
    const confirmed = window.confirm(`Run dependency install?\n\n${command}`);
    if (!confirmed) {
      return;
    }

    const started = await postDashboardAction('/api/install').catch(() => false);
    await refreshProject();
    setDrawer(null);
    if (started) {
      setActiveView('logs');
    } else {
      window.alert('Unable to start dependency install.');
    }
  }

  async function runScript(script: string): Promise<void> {
    const project = projectState.project;
    const packageScript = project?.scripts[script] ?? '';

    if (settings.confirmBeforeRun && project !== null) {
      const exactCommand = `${project.packageManager ?? 'npm'} run ${script}`;
      const confirmed = window.confirm(
        `Run this command?\n\n${exactCommand}\n\npackage.json script:\n${packageScript}`
      );
      if (!confirmed) {
        return;
      }
    }

    const shouldAutoOpen =
      project !== null && settings.autoOpenAppUrl && scriptLooksLikeServer(script, packageScript);
    const pendingAppWindow = shouldAutoOpen ? createPendingAppWindow() : null;

    try {
      const response = await fetch(`/api/run/${encodeURIComponent(script)}`, {
        method: 'POST',
        headers: {
          'X-DevSurface-Intent': 'dashboard'
        }
      });
      if (!response.ok) {
        closePendingAppWindow(pendingAppWindow);
        throw new Error(`Unable to start ${script}`);
      }
    } catch (error) {
      closePendingAppWindow(pendingAppWindow);
      throw error;
    }

    await refreshProject();

    if (shouldAutoOpen && project !== null) {
      void waitForAutoOpenUrl({
        previousPorts: project.ports,
        candidatePorts: candidatePortsForScript(project, script),
        appWindow: pendingAppWindow,
        onRefresh: refreshProject
      }).catch(() => closePendingAppWindow(pendingAppWindow));
    }
  }

  async function runConfiguredCommand(name: string, command: string): Promise<void> {
    const dangerous = isDangerousCommand(command);
    if (settings.confirmBeforeRun || dangerous) {
      const confirmed = window.confirm(
        `${dangerous ? 'Dangerous configured command.\n\n' : ''}Run this configured command?\n\n${name}\n${command}`
      );
      if (!confirmed) {
        return;
      }
    }

    const response = await fetch(`/api/commands/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: {
        'X-DevSurface-Intent': 'dashboard'
      }
    });
    if (!response.ok) {
      throw new Error(`Unable to start ${name}`);
    }
    await refreshProject();
  }

  async function stopProcess(pid: string): Promise<void> {
    await fetch(`/api/run/${encodeURIComponent(pid)}`, {
      method: 'DELETE',
      headers: {
        'X-DevSurface-Intent': 'dashboard'
      }
    });
    await refreshProject();
  }

  async function copyEnvExample(): Promise<void> {
    const confirmed = window.confirm(
      'Copy .env.example to .env? Existing .env files are never overwritten.'
    );
    if (!confirmed) {
      return;
    }

    const response = await fetch('/api/env/copy', {
      method: 'POST',
      headers: {
        'X-DevSurface-Intent': 'dashboard'
      }
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? 'Unable to copy .env.example');
    }

    await refreshProject();
  }

  if (projectState.loading && projectState.project === null) {
    return (
      <main className="app-shell loading-shell">
        <div className="loading-panel">Scanning project...</div>
      </main>
    );
  }

  if (projectState.error && projectState.project === null) {
    return (
      <main className="app-shell loading-shell">
        <div className="loading-panel error-panel">{projectState.error}</div>
      </main>
    );
  }

  if (projectState.project === null) {
    return null;
  }

  const firstScript = scriptOrder(projectState.project)[0] ?? null;

  return (
    <main className="app-shell">
      <Sidebar
        activeView={activeView}
        collapsed={sidebarCollapsed}
        version={DEV_SURFACE_VERSION}
        onToggleCollapsed={() => setSidebarCollapsed((current) => !current)}
        onSelectView={(view) => {
          setActiveView(view);
          setDrawer(null);
          if (view === 'overview') {
            document.getElementById('overview')?.scrollIntoView({ behavior: 'smooth' });
          }
        }}
      />
      <div className="workspace">
        <Topbar project={projectState.project} onRefresh={refreshProject} />
        <div className="dashboard-frame">
          {activeView === 'overview' ? (
            <>
              <div className="primary-column">
                <OverviewMatrix project={projectState.project} lastRefreshed={lastRefreshed} />
                <QuickActionStrip
                  packageManager={projectState.project.packageManager}
                  onOpenTerminal={() => void openTerminal()}
                  onOpenFolder={() => void openFolder()}
                  onViewPackage={() => void viewPackageJson()}
                  onInstall={() => void installDependencies()}
                  onRunScript={() => {
                    if (firstScript !== null) {
                      setSelectedScript(firstScript);
                    }
                    setDrawer(null);
                    setActiveView('scripts');
                  }}
                />
                <ScriptsTable
                  project={projectState.project}
                  processes={processes}
                  selectedScript={selectedScript}
                  onRun={runScript}
                  onStop={stopProcess}
                  onSelect={setSelectedScript}
                />
              </div>
              <aside className="inspector-column">
                <EnvironmentInspector
                  project={projectState.project}
                  onCopyEnv={copyEnvExample}
                  onViewAll={() => setDrawer('environment')}
                />
                <PortsInspector
                  project={projectState.project}
                  onCheckPorts={() => {
                    void refreshProject();
                    setDrawer('ports');
                  }}
                />
                <ServicesInspector
                  project={projectState.project}
                  onDetect={() => {
                    void refreshProject();
                    setDrawer('services');
                  }}
                />
                <RepoHealthInspector
                  warnings={projectState.health}
                  lastRefreshed={lastRefreshed}
                  onRunCheck={() => {
                    void refreshProject();
                    setDrawer('health');
                  }}
                />
                <LogsInspector
                  connection={socket.connection}
                  logs={logs}
                  onOpenLogs={() => setDrawer('logs')}
                />
              </aside>
            </>
          ) : (
            <SectionPage
              view={activeView}
              project={projectState.project}
              warnings={projectState.health}
              logs={logs}
              processes={processes}
              settings={settings}
              lastRefreshed={lastRefreshed}
              onRunScript={runScript}
              onRunConfiguredCommand={runConfiguredCommand}
              onStopProcess={stopProcess}
              onRefresh={refreshProject}
              onSettingsChange={setSettings}
            />
          )}
        </div>
      </div>
      <DetailDrawer
        drawer={drawer}
        project={projectState.project}
        warnings={projectState.health}
        logs={logs}
        processes={processes}
        settings={settings}
        lastRefreshed={lastRefreshed}
        onRunScript={runScript}
        onStopProcess={stopProcess}
        onClose={() => setDrawer(null)}
        onSettingsChange={setSettings}
      />
    </main>
  );
}
