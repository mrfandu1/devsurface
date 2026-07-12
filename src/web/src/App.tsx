import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { safeDisplayText } from '@core/security/text.js';
import { resolveLaunchPlan, describeLaunchStep } from '@core/launch/index.js';
import { isDangerousCommand } from '@core/security/dangerousCommand.js';
import { isSafeHttpUrl } from '@core/security/url.js';
import { explainScript } from '@core/explain/index.js';
import { DEV_SURFACE_VERSION } from '../../version';
import {
  appUrlForPort,
  candidatePortsForScript,
  chooseAutoOpenPort,
  scriptLooksLikeServer
} from './autoOpen';
import { useProject } from './hooks/useProject';
import { useSocket } from './hooks/useSocket';
import { useWorkspace } from './hooks/useWorkspace';
import { CommandPalette, type PaletteItem } from './components/CommandPalette';
import { LearnPanel } from './components/LearnPanel';
import { getDashboardShortcut, type DashboardShortcutView } from './keyboardShortcuts';
import { mutationHeaders, apiPrefix } from './mutation';
import { orderWithPins, readPinnedScripts, togglePinnedScript } from './pins';
import { applyStatusFavicon, faviconStateFromProcesses } from './favicon';
import { logLineTone, parseAnsiSpans } from './ansi';
import {
  applyTheme,
  readStoredThemePreference,
  storeThemePreference,
  toggledTheme,
  type ResolvedTheme,
  type ThemePreference
} from './theme';
import type {
  DoctorWarning,
  ManagedProcessSnapshot,
  OnboardingPlan,
  OnboardingStep,
  ProcessLogEvent,
  RunHistoryEntry,
  ScanResult,
  WorkspaceSummary
} from './types';

type DockerAction = 'start' | 'stop' | 'logs';

interface DockerBusyState {
  service: string;
  action: DockerAction;
}

interface DockerLogState {
  service: string;
  content: string;
}

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

function displayProcessStatus(processInfo: ManagedProcessSnapshot | null, now?: number): string {
  if (processInfo === null) {
    return 'idle';
  }

  if (processInfo.status === 'exited') {
    return processInfo.exitCode === 0 ? 'completed (0)' : `failed (${processInfo.exitCode ?? '?'})`;
  }

  if (processInfo.status === 'failed') {
    return `failed (${processInfo.exitCode ?? '?'})`;
  }

  if (processInfo.status === 'running' && now !== undefined) {
    const started = new Date(processInfo.startedAt).getTime();
    if (Number.isFinite(started) && now > started) {
      const seconds = Math.floor((now - started) / 1000);
      const elapsed =
        seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
      return `running · ${elapsed}`;
    }
  }

  return processInfo.status;
}

function scriptOrder(project: ScanResult): string[] {
  const preferred = ['build', 'build:web', 'build:cli', 'dev', 'lint', 'test', 'typecheck'];
  const ordered = preferred.filter((script) => project.scripts[script] !== undefined);
  const remaining = Object.keys(project.scripts).filter((script) => !ordered.includes(script));
  return [...ordered, ...remaining];
}

function configuredCommandGroups(
  project: ScanResult
): Array<{ name: string; commands: Array<{ name: string; command: string }> }> {
  const commands = {
    ...project.presetCommands,
    ...project.config?.config.commands
  };
  const rawGroups = {
    ...project.presetGroups,
    ...project.config?.config.groups
  };
  const commandNames = Object.keys(commands);
  if (commandNames.length === 0) {
    return [];
  }

  const grouped = new Set<string>();
  const groups = Object.entries(rawGroups)
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
    groups.push({ name: 'Detected Commands', commands: ungrouped });
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

type FontScale = 'comfortable' | 'large' | 'x-large';

interface DashboardSettings {
  autoRefreshEnabled: boolean;
  autoRefreshSeconds: number;
  autoOpenAppUrl: boolean;
  confirmBeforeRun: boolean;
  notifyOnFailure: boolean;
  fontScale: FontScale;
  highContrast: boolean;
}

const DEFAULT_DASHBOARD_SETTINGS: DashboardSettings = {
  autoRefreshEnabled: true,
  autoRefreshSeconds: 30,
  autoOpenAppUrl: true,
  confirmBeforeRun: true,
  notifyOnFailure: false,
  fontScale: 'comfortable',
  highContrast: false
};

const SETTINGS_STORAGE_KEY = 'devsurface-settings';
const SIDEBAR_STORAGE_KEY = 'devsurface-sidebar-collapsed';
const PALETTE_RECENTS_KEY = 'devsurface-palette-recents';

/** Settings persist across reloads; unknown/corrupt values fall back to defaults. */
function loadStoredSettings(): DashboardSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (raw === null) {
      return { ...DEFAULT_DASHBOARD_SETTINGS };
    }
    const parsed = JSON.parse(raw) as Partial<DashboardSettings>;
    return { ...DEFAULT_DASHBOARD_SETTINGS, ...parsed };
  } catch {
    return { ...DEFAULT_DASHBOARD_SETTINGS };
  }
}

function readPaletteRecents(): string[] {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(PALETTE_RECENTS_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

function recordPaletteRecent(id: string): void {
  try {
    const next = [id, ...readPaletteRecents().filter((item) => item !== id)].slice(0, 5);
    window.localStorage.setItem(PALETTE_RECENTS_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — recents just don't persist.
  }
}

interface Toast {
  id: number;
  message: string;
}

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
      appWindow.opener = null;
      appWindow.document.title = 'Starting local app';
      const main = appWindow.document.createElement('main');
      main.style.font = '14px system-ui';
      main.style.padding = '24px';
      main.textContent = 'Starting local app...';
      appWindow.document.body.replaceChildren(main);
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
      {name === 'sun' ? (
        <>
          <circle cx="12" cy="12" r="4" fill="none" />
          <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
        </>
      ) : null}
      {name === 'moon' ? <path d="M20 14A8 8 0 1 1 10 4a7 7 0 0 0 10 10Z" /> : null}
      {name === 'branch' ? (
        <>
          <circle cx="6" cy="6" r="2.4" fill="none" />
          <circle cx="6" cy="18" r="2.4" fill="none" />
          <circle cx="18" cy="8" r="2.4" fill="none" />
          <path d="M6 8.4v7.2" />
          <path d="M18 10.4c0 4-4 4.6-9 5" />
        </>
      ) : null}
      {name === 'search' ? (
        <>
          <circle cx="11" cy="11" r="6" fill="none" />
          <path d="m16 16 4.5 4.5" />
        </>
      ) : null}
      {name === 'external' ? (
        <>
          <path d="M14 5h5v5" />
          <path d="m19 5-9 9" />
          <path d="M19 14v5H5V5h5" />
        </>
      ) : null}
      {name === 'book' ? (
        <>
          <path d="M4 5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 1-2-2z" />
          <path d="M4 19a2 2 0 0 1 2-2h14" />
          <path d="M9 7h7" />
        </>
      ) : null}
    </svg>
  );
}

function Sidebar({
  version,
  activeView,
  collapsed,
  warningCount,
  onboardingTodo,
  busyPortCount,
  onSelectView,
  onToggleCollapsed
}: {
  version: string;
  activeView: ActiveView;
  collapsed: boolean;
  warningCount: number;
  onboardingTodo: number;
  busyPortCount: number;
  onSelectView: (view: ActiveView) => void;
  onToggleCollapsed: () => void;
}) {
  const items = [
    { icon: 'home', label: 'Overview', view: 'overview' },
    { icon: 'check', label: 'Onboarding', view: 'onboarding' },
    { icon: 'script', label: 'Scripts', view: 'scripts' },
    { icon: 'env', label: 'Environment', view: 'environment' },
    { icon: 'ports', label: 'Ports', view: 'ports' },
    { icon: 'box', label: 'Services', view: 'services' },
    { icon: 'heart', label: 'Repo Health', view: 'health' },
    { icon: 'doc', label: 'Logs', view: 'logs' },
    { icon: 'book', label: 'Learn', view: 'learn' }
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
            {item.view === 'health' && warningCount > 0 ? (
              <em className="nav-badge" aria-label={`${warningCount} health warnings`}>
                {warningCount > 9 ? '9+' : warningCount}
              </em>
            ) : null}
            {item.view === 'onboarding' && onboardingTodo > 0 ? (
              <em
                className="nav-badge warn-badge"
                aria-label={`${onboardingTodo} setup steps remaining`}
              >
                {onboardingTodo > 9 ? '9+' : onboardingTodo}
              </em>
            ) : null}
            {item.view === 'ports' && busyPortCount > 0 ? (
              <em className="nav-badge" aria-label={`${busyPortCount} busy ports`}>
                {busyPortCount > 9 ? '9+' : busyPortCount}
              </em>
            ) : null}
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

function describeRefreshAge(lastRefreshed: Date, now: number): string {
  const seconds = Math.max(0, Math.floor((now - lastRefreshed.getTime()) / 1000));
  if (seconds < 5) {
    return 'just now';
  }
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  return `${Math.floor(seconds / 60)}m ago`;
}

function Topbar({
  project,
  theme,
  lastRefreshed,
  now,
  onToggleTheme,
  onRefresh
}: {
  project: ScanResult;
  theme: ResolvedTheme;
  lastRefreshed: Date;
  now: number;
  onToggleTheme: () => void;
  onRefresh: () => Promise<void>;
}) {
  return (
    <header className="topbar">
      <div className="workspace-crumb">
        <Icon name="folder" />
        <strong>{project.projectName}</strong>
        <span>&middot;</span>
        <code>{formatPath(project.root)}</code>
      </div>
      <div className="topbar-actions">
        <span className="refresh-age" title={formatTime(lastRefreshed)}>
          {describeRefreshAge(lastRefreshed, now)}
        </span>
        <button
          className="refresh-button theme-toggle"
          onClick={onToggleTheme}
          type="button"
          title={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
        </button>
        <button className="refresh-button" onClick={() => void onRefresh()} type="button">
          <Icon name="refresh" />
          Refresh
          <kbd>F5</kbd>
        </button>
      </div>
    </header>
  );
}

function describePortOwner(owner: ScanResult['ports'][number]['owner']): string {
  if (owner === undefined || owner === null) {
    return '';
  }
  return owner.name === null ? ` by PID ${owner.pid}` : ` by ${owner.name} (PID ${owner.pid})`;
}

function describeBusyPort(port: ScanResult['ports'][number]): string {
  const suggestion =
    typeof port.suggestedFreePort === 'number' ? ` — try ${port.suggestedFreePort}` : '';
  return `in use${describePortOwner(port.owner)}${suggestion}`;
}

function describeGitSync(git: NonNullable<ScanResult['git']>): {
  value: string;
  tone?: string;
} {
  const parts: string[] = [];
  if (typeof git.dirtyFiles === 'number' && git.dirtyFiles > 0) {
    parts.push(`${git.dirtyFiles} changed`);
  }
  if (typeof git.ahead === 'number' && git.ahead > 0) {
    parts.push(`${git.ahead} ahead`);
  }
  if (typeof git.behind === 'number' && git.behind > 0) {
    parts.push(`${git.behind} behind`);
  }
  if (parts.length === 0) {
    const known = typeof git.dirtyFiles === 'number';
    return { value: known ? 'clean' : 'unknown', tone: known ? 'ok' : 'muted' };
  }
  return { value: parts.join(', '), tone: git.behind ? 'bad' : undefined };
}

function relativeAge(isoDate: string): string {
  const then = new Date(isoDate).getTime();
  if (!Number.isFinite(then)) {
    return '';
  }
  const minutes = Math.round((Date.now() - then) / 60_000);
  if (minutes < 60) {
    return `${Math.max(minutes, 0)}m ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 48) {
    return `${hours}h ago`;
  }
  const days = Math.round(hours / 24);
  return days < 60 ? `${days}d ago` : `${Math.round(days / 30)}mo ago`;
}

function OverviewMatrix({ project, lastRefreshed }: { project: ScanResult; lastRefreshed: Date }) {
  const packageData = project.packageJson?.data;
  const viteVersion =
    packageData?.devDependencies?.vite?.replace(/^[^\d]*/, 'v') ??
    (project.framework?.detected.includes('Vite') ? 'detected' : 'unknown');
  const nodeVersion = project.nodeRequirement ?? packageData?.engines?.node ?? 'local';
  const toolchain = project.toolchain ?? null;
  const lintFormat = [toolchain?.linter, toolchain?.formatter].filter(
    (tool): tool is string => tool != null
  );
  const env = project.env;
  const git = project.git;
  const gitSync = git ? describeGitSync(git) : null;
  const lastCommit = git?.lastCommit ?? null;
  const monorepo = project.monorepo ?? null;
  const deps = project.dependencies ?? null;

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
      label: 'Language',
      value:
        project.language.detected.length > 0 ? project.language.detected.join(', ') : 'unknown',
      tone: project.language.primary ? 'ok' : 'muted'
    },
    {
      icon: 'check',
      label: 'Node.js',
      value: nodeVersion,
      tone: 'ok'
    },
    {
      icon: 'branch',
      label: 'Branch',
      value: project.git?.branch ?? 'not detected'
    },
    ...(git !== null && gitSync !== null
      ? [
          {
            icon: 'branch',
            label: 'Working Tree',
            value: gitSync.value,
            tone: gitSync.tone
          }
        ]
      : []),
    ...(lastCommit !== null
      ? [
          {
            icon: 'doc',
            label: 'Last Commit',
            value: `${lastCommit.subject.slice(0, 60)}${lastCommit.subject.length > 60 ? '…' : ''} · ${relativeAge(lastCommit.date)}`
          }
        ]
      : []),
    ...(monorepo !== null
      ? [
          {
            icon: 'box',
            label: 'Monorepo',
            value: `${monorepo.tools.join(', ')}${monorepo.packageCount > 0 ? ` · ${monorepo.packageCount} packages` : ''}${(() => {
              const total = monorepo.packages.reduce(
                (sum, member) => sum + (member.scriptCount ?? 0),
                0
              );
              return total > 0 ? ` · ${total} scripts` : '';
            })()}`,
            tone: 'ok'
          }
        ]
      : []),
    ...((project.bins?.length ?? 0) > 0
      ? [
          {
            icon: 'terminal',
            label: 'Provides CLI',
            value: (project.bins ?? []).slice(0, 3).join(', '),
            tone: 'ok'
          }
        ]
      : []),
    ...(project.moduleType != null && project.packageJson !== null
      ? [
          {
            icon: 'script',
            label: 'Module System',
            value: project.moduleType === 'module' ? 'ESM' : 'CommonJS'
          }
        ]
      : []),
    ...(deps !== null
      ? [
          {
            icon: 'download',
            label: 'Dependencies',
            value: `${deps.runtimeCount} runtime + ${deps.devCount} dev${deps.lockfileStale ? ' · lockfile stale' : ''}`,
            tone: deps.lockfileStale ? 'bad' : undefined
          }
        ]
      : []),
    ...(toolchain?.testRunner != null
      ? [{ icon: 'check', label: 'Test Runner', value: toolchain.testRunner, tone: 'ok' }]
      : []),
    ...(lintFormat.length > 0
      ? [{ icon: 'check', label: 'Lint / Format', value: lintFormat.join(' + '), tone: 'ok' }]
      : []),
    ...(toolchain?.ci != null
      ? [{ icon: 'refresh', label: 'CI', value: toolchain.ci, tone: 'ok' }]
      : []),
    ...(typeof git?.commitCount === 'number'
      ? [
          {
            icon: 'branch',
            label: 'Commits',
            value: `${git.commitCount}${git.latestTag != null ? ` · latest tag ${git.latestTag}` : ''}`
          }
        ]
      : []),
    ...(project.licenseType != null
      ? [{ icon: 'doc', label: 'License Type', value: project.licenseType, tone: 'ok' }]
      : []),
    ...(typeof project.testFileCount === 'number' && project.testFileCount > 0
      ? [
          {
            icon: 'check',
            label: 'Test Files',
            value: String(project.testFileCount),
            tone: 'ok'
          }
        ]
      : []),
    {
      icon: 'box',
      label: 'Framework',
      value: project.framework?.type ?? viteVersion,
      tone: project.framework ? 'ok' : 'muted'
    },
    {
      icon: 'box',
      label: 'Presets',
      value:
        project.presets.length > 0
          ? project.presets.map((preset) => preset.label).join(', ')
          : 'none',
      tone: project.presets.length > 0 ? 'ok' : 'muted'
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
      {project.homepage != null && isSafeHttpUrl(project.homepage) ? (
        <p className="overview-homepage">
          <a href={project.homepage} rel="noreferrer" target="_blank">
            {project.homepage}
            <Icon name="external" />
          </a>
        </p>
      ) : null}
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
  passportHref,
  onRunScript,
  onOpenTerminal,
  onOpenFolder,
  onOpenEditor,
  onViewPackage,
  onInstall,
  onLaunch
}: {
  packageManager: ScanResult['packageManager'];
  passportHref: string;
  onRunScript: () => void;
  onOpenTerminal: () => void;
  onOpenFolder: () => void;
  onOpenEditor: () => void;
  onViewPackage: () => void;
  onInstall: () => void;
  onLaunch: () => void;
}) {
  const manager = packageManager ?? 'npm';
  const installCommand = manager === 'npm' ? 'npm ci' : `${manager} install`;
  const actions = [
    { icon: 'play', label: 'Launch', title: 'Run the launch sequence', onClick: onLaunch },
    { icon: 'script', label: 'Scripts', title: 'Open scripts', onClick: onRunScript },
    { icon: 'terminal', label: 'Terminal', title: 'Open in terminal', onClick: onOpenTerminal },
    { icon: 'folder', label: 'Folder', title: 'Open project folder', onClick: onOpenFolder },
    { icon: 'doc', label: 'Editor', title: 'Open in your code editor', onClick: onOpenEditor },
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
        <a
          className="utility-button"
          href={passportHref}
          target="_blank"
          rel="noreferrer"
          title="Open a shareable onboarding report for this project"
        >
          <Icon name="doc" />
          <span className="button-label">Passport</span>
        </a>
      </div>
    </section>
  );
}

function ScriptsTable({
  project,
  processes,
  selectedScript,
  pinned,
  now,
  onRun,
  onStop,
  onRestart,
  onSelect,
  onTogglePin
}: {
  project: ScanResult;
  processes: ManagedProcessSnapshot[];
  selectedScript: string | null;
  pinned: string[];
  now: number;
  onRun: (script: string) => Promise<void>;
  onStop: (pid: string) => Promise<void>;
  onRestart: (script: string, pid: string) => Promise<void>;
  onSelect: (script: string) => void;
  onTogglePin: (script: string) => void;
}) {
  const scripts = orderWithPins(scriptOrder(project), pinned);

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
          const statusLabel = displayProcessStatus(processInfo, now);
          const running = processInfo?.status === 'running';
          const isPinned = pinned.includes(script);
          return (
            <div
              className={`script-item ${selectedScript === script ? 'selected' : ''}`}
              key={script}
              role="row"
              onClick={() => onSelect(script)}
            >
              <strong>
                <button
                  className={`pin-button ${isPinned ? 'pinned' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onTogglePin(script);
                  }}
                  title={isPinned ? 'Unpin script' : 'Pin script to the top'}
                  aria-label={isPinned ? `Unpin ${script}` : `Pin ${script}`}
                  type="button"
                >
                  {isPinned ? '★' : '☆'}
                </button>
                {script}
              </strong>
              <div className="script-command">
                <code>{compactCommand(project.scripts[script])}</code>
                <span className="script-explain">
                  {explainScript(script, project.scripts[script])}
                </span>
              </div>
              <span className={`script-status status-${status}`}>
                <i />
                {statusLabel}
              </span>
              <div className="script-controls">
                <button
                  className="minor-button copy-command"
                  onClick={(event) => {
                    event.stopPropagation();
                    copyText(project.scripts[script]);
                  }}
                  title="Copy the raw command"
                  type="button"
                >
                  Copy
                </button>
                {running ? (
                  <>
                    <button
                      className="minor-button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void onRestart(script, processInfo.pid);
                      }}
                      title="Stop and start this script again"
                      type="button"
                    >
                      <Icon name="refresh" />
                      Restart
                    </button>
                    <button
                      className="run-button stop-button"
                      onClick={() => void onStop(processInfo.pid)}
                      type="button"
                    >
                      <Icon name="stop" />
                      Stop
                    </button>
                  </>
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
        {project.config?.config.docs && isSafeHttpUrl(project.config.config.docs) ? (
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
          <details className="configured-command-group" key={group.name} open>
            <summary>
              <h4>{group.name}</h4>
            </summary>
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
          </details>
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
              <span
                className={port.inUse ? 'badge bad' : 'badge ok'}
                title={port.inUse ? describeBusyPort(port) : undefined}
              >
                <i />
                {port.inUse ? describeBusyPort(port) : 'available'}
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
            {docker?.services.filter((service) => service.status === 'running').length === 1
              ? 'service'
              : 'services'}{' '}
            running
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
        <strong
          className={
            docker === null
              ? 'text-bad'
              : docker.daemonStatus === 'running'
                ? 'text-ok'
                : 'text-bad'
          }
        >
          {docker === null
            ? 'not detected'
            : docker.daemonStatus === 'running'
              ? 'running'
              : docker.daemonStatus.replace('-', ' ')}
          {docker === null ? <Icon name="alert" /> : null}
        </strong>
      </div>
    </InspectorPanel>
  );
}

function dockerStatusLabel(
  status: NonNullable<ScanResult['docker']>['services'][number]['status']
) {
  return status === 'unknown' ? 'unavailable' : status;
}

function DockerServicesWorkspace({
  docker,
  busy,
  logs,
  error,
  onStart,
  onStop,
  onLogs
}: {
  docker: ScanResult['docker'];
  busy: DockerBusyState | null;
  logs: DockerLogState | null;
  error: string | null;
  onStart: (service: string) => Promise<void>;
  onStop: (service: string) => Promise<void>;
  onLogs: (service: string) => Promise<void>;
}) {
  if (docker === null) {
    return <p className="drawer-note">No Docker Compose file was detected in this project.</p>;
  }

  const daemonReady = docker.daemonStatus === 'running';

  return (
    <div className="docker-workspace">
      <div className={`docker-daemon-state daemon-${docker.daemonStatus}`}>
        <div>
          <span>Docker engine</span>
          <strong>{docker.daemonStatus.replace('-', ' ')}</strong>
        </div>
        {docker.message ? <p>{docker.message}</p> : null}
      </div>

      <div className="compose-file-list">
        {docker.composeFiles.map((composeFile) => (
          <code key={composeFile}>{formatPath(composeFile)}</code>
        ))}
      </div>

      {error ? <p className="docker-action-error">{error}</p> : null}

      {docker.services.length === 0 ? (
        <p className="drawer-note">No services could be parsed from the Compose file.</p>
      ) : (
        <div className="docker-service-table">
          {docker.services.map((service) => {
            const serviceBusy = busy?.service === service.name;
            const running = service.status === 'running';
            const hostPorts =
              docker.servicePorts?.find((entry) => entry.service === service.name)?.hostPorts ?? [];
            return (
              <article className="docker-service-row" key={service.name}>
                <div className="docker-service-identity">
                  <strong>{service.name}</strong>
                  <span>
                    {service.statusDetail ?? 'No container status reported'}
                    {hostPorts.length > 0
                      ? ` · port${hostPorts.length === 1 ? '' : 's'} ${hostPorts.join(', ')}`
                      : ''}
                  </span>
                </div>
                <span className={`badge service-badge service-${service.status}`}>
                  <i />
                  {dockerStatusLabel(service.status)}
                </span>
                <div className="docker-service-actions">
                  {running ? (
                    <button
                      className="minor-button"
                      disabled={!daemonReady || serviceBusy}
                      onClick={() => void onStop(service.name)}
                      type="button"
                    >
                      <Icon name="stop" />
                      {busy?.service === service.name && busy.action === 'stop'
                        ? 'Stopping'
                        : 'Stop'}
                    </button>
                  ) : (
                    <button
                      className="minor-button"
                      disabled={!daemonReady || serviceBusy}
                      onClick={() => void onStart(service.name)}
                      type="button"
                    >
                      <Icon name="play" />
                      {busy?.service === service.name && busy.action === 'start'
                        ? 'Starting'
                        : 'Start'}
                    </button>
                  )}
                  <button
                    className="minor-button"
                    disabled={!daemonReady || serviceBusy}
                    onClick={() => void onLogs(service.name)}
                    type="button"
                  >
                    <Icon name="doc" />
                    {busy?.service === service.name && busy.action === 'logs' ? 'Loading' : 'Logs'}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {logs ? (
        <section className="docker-log-panel" aria-label={`${logs.service} Docker logs`}>
          <header>
            <strong>{logs.service}</strong>
            <span>Last 200 lines</span>
          </header>
          <pre>{safeDisplayText(logs.content || 'No logs returned for this service.')}</pre>
        </section>
      ) : null}
    </div>
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
  connection: 'connecting' | 'open' | 'closed' | 'reconnecting';
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

function ThemeSettingRow({
  themePreference,
  onThemeChange
}: {
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
}) {
  return (
    <label className="setting-row">
      <span>
        <strong>Theme</strong>
        <em>Follow the system setting or pick light/dark.</em>
      </span>
      <select
        value={themePreference}
        onChange={(event) => onThemeChange(event.target.value as ThemePreference)}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
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
      <label className="setting-row">
        <span>
          <strong>Notify on failure</strong>
          <em>Show a browser notification when a script fails.</em>
        </span>
        <input
          checked={settings.notifyOnFailure}
          onChange={(event) => {
            const enabled = event.target.checked;
            if (enabled && typeof Notification !== 'undefined') {
              void Notification.requestPermission();
            }
            onSettingsChange({ ...settings, notifyOnFailure: enabled });
          }}
          type="checkbox"
        />
      </label>
      <label className="setting-row">
        <span>
          <strong>Text size</strong>
          <em>Make everything in the dashboard easier to read.</em>
        </span>
        <select
          value={settings.fontScale}
          onChange={(event) =>
            onSettingsChange({ ...settings, fontScale: event.target.value as FontScale })
          }
        >
          <option value="comfortable">Comfortable</option>
          <option value="large">Large</option>
          <option value="x-large">Extra large</option>
        </select>
      </label>
      <label className="setting-row">
        <span>
          <strong>High contrast</strong>
          <em>Stronger colors and borders for readability.</em>
        </span>
        <input
          checked={settings.highContrast}
          onChange={(event) =>
            onSettingsChange({ ...settings, highContrast: event.target.checked })
          }
          type="checkbox"
        />
      </label>
      <div className="setting-row">
        <span>
          <strong>Reset dashboard settings</strong>
          <em>Restore every setting above to its default.</em>
        </span>
        <button
          className="minor-button"
          onClick={() => onSettingsChange({ ...DEFAULT_DASHBOARD_SETTINGS })}
          type="button"
        >
          Reset
        </button>
      </div>
    </>
  );
}

const SHORTCUTS_HELP: Array<[string, string]> = [
  ['Ctrl/Cmd + K', 'Open the command palette'],
  ['Ctrl/Cmd + B', 'Collapse or expand the sidebar'],
  [
    '1 – 9',
    'Jump to Overview, Onboarding, Scripts, Environment, Ports, Services, Health, Logs, Learn'
  ],
  [',', 'Open Settings'],
  ['F5', 'Refresh project data'],
  ['Esc', 'Close panels and overlays'],
  ['?', 'Show this shortcuts overview']
];

function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <div className="drawer-backdrop" onClick={onClose} role="presentation">
      <div
        className="shortcuts-modal"
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(event) => event.stopPropagation()}
      >
        <header>
          <h2>Keyboard shortcuts</h2>
          <button className="drawer-close" onClick={onClose} type="button">
            Close
          </button>
        </header>
        <div className="shortcuts-list">
          {SHORTCUTS_HELP.map(([keys, description]) => (
            <div className="shortcuts-row" key={keys}>
              <kbd>{keys}</kbd>
              <span>{description}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AnsiText({ message }: { message: string }) {
  const spans = parseAnsiSpans(message);
  return (
    <>
      {spans.map((span, index) =>
        span.className === null ? (
          <span key={index}>{safeDisplayText(span.text)}</span>
        ) : (
          <span className={span.className} key={index}>
            {safeDisplayText(span.text)}
          </span>
        )
      )}
    </>
  );
}

function LogConsole({
  logs,
  limit = 220,
  wrap = true,
  showTimestamps = true,
  autoScroll = false
}: {
  logs: ProcessLogEvent[];
  limit?: number;
  wrap?: boolean;
  showTimestamps?: boolean;
  autoScroll?: boolean;
}) {
  const visibleLogs = logs.slice(-limit);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [atBottom, setAtBottom] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (autoScroll && atBottom && container !== null) {
      container.scrollTop = container.scrollHeight;
    }
  }, [logs, autoScroll, atBottom]);

  return (
    <div className="log-console-shell">
      <div
        className={`log-console ${wrap ? '' : 'nowrap'}`}
        ref={containerRef}
        role="log"
        aria-label="Process output"
        onScroll={(event) => {
          const target = event.currentTarget;
          setAtBottom(target.scrollHeight - target.scrollTop - target.clientHeight < 40);
        }}
      >
        {visibleLogs.length === 0 ? (
          <div className="log-empty">No log entries yet.</div>
        ) : (
          visibleLogs.map((log, index) => {
            const tone = logLineTone(log.message);
            return (
              <div
                className={`log-console-line ${log.stream} ${tone !== null ? `tone-${tone}` : ''}`}
                key={`${log.timestamp}-${index}`}
              >
                {showTimestamps ? (
                  <time>{new Date(log.timestamp).toLocaleTimeString()}</time>
                ) : null}
                <strong>{log.script}</strong>
                <span>{log.stream}</span>
                <pre>
                  <AnsiText message={log.message} />
                </pre>
              </div>
            );
          })
        )}
      </div>
      {autoScroll && !atBottom ? (
        <button
          className="minor-button jump-latest"
          onClick={() => {
            const container = containerRef.current;
            if (container !== null) {
              container.scrollTop = container.scrollHeight;
              setAtBottom(true);
            }
          }}
          type="button"
        >
          Jump to latest ↓
        </button>
      ) : null}
    </div>
  );
}

function formatRunDuration(durationMs: number): string {
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  const seconds = durationMs / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)}s` : `${Math.round(seconds / 60)}m`;
}

function historyStatusMeta(entry: RunHistoryEntry): { label: string; className: string } {
  if (entry.status === 'exited' && entry.exitCode === 0) {
    return { label: 'ok', className: 'ok' };
  }
  if (entry.status === 'stopped') {
    return { label: 'stopped', className: 'stopped' };
  }
  return {
    label: entry.exitCode === null ? 'failed' : `failed (${entry.exitCode})`,
    className: 'failed'
  };
}

function RecentRunsSection({ history }: { history: RunHistoryEntry[] }) {
  if (history.length === 0) {
    return null;
  }

  return (
    <DrawerSection title="Recent Runs">
      <div className="history-table" aria-label="Recent script runs">
        {history.slice(0, 12).map((entry, index) => {
          const meta = historyStatusMeta(entry);
          return (
            <div className="history-row" key={`${entry.endedAt}-${entry.script}-${index}`}>
              <span className={`history-status ${meta.className}`}>
                <i />
                {meta.label}
              </span>
              <strong>{entry.script}</strong>
              <code>{entry.command}</code>
              <span className="history-duration">{formatRunDuration(entry.durationMs)}</span>
              <span className="history-when">{relativeAge(entry.endedAt)}</span>
            </div>
          );
        })}
      </div>
      <p className="drawer-note">
        Runs started from DevSurface are recorded locally (never inside the repository).
      </p>
    </DrawerSection>
  );
}

function formatLogLine(log: ProcessLogEvent): string {
  return `${log.timestamp} [${log.script}] ${log.stream}: ${log.message}`;
}

function downloadLogs(logs: ProcessLogEvent[]): void {
  const content = logs.map(formatLogLine).join('\n');
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `devsurface-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
  anchor.click();
  URL.revokeObjectURL(url);
}

type LogStreamFilter = 'all' | 'stdout' | 'stderr' | 'system';

function LogsWorkspace({
  processes,
  logs,
  compact = false,
  initialFilter = ''
}: {
  processes: ManagedProcessSnapshot[];
  logs: ProcessLogEvent[];
  compact?: boolean;
  initialFilter?: string;
}) {
  const [logFilter, setLogFilter] = useState(initialFilter);
  const [streamFilter, setStreamFilter] = useState<LogStreamFilter>('all');
  const [paused, setPaused] = useState(false);
  const [frozenLogs, setFrozenLogs] = useState<ProcessLogEvent[]>([]);
  const [wrapLines, setWrapLines] = useState(true);
  const [showTimestamps, setShowTimestamps] = useState(true);
  const [scriptFilter, setScriptFilter] = useState('all');
  const [clearedBefore, setClearedBefore] = useState<string | null>(null);

  const liveLogs = paused ? frozenLogs : logs;

  const filteredLogs = useMemo(() => {
    const query = logFilter.trim().toLowerCase();
    return liveLogs.filter(
      (log) =>
        (clearedBefore === null || log.timestamp > clearedBefore) &&
        (streamFilter === 'all' || log.stream === streamFilter) &&
        (scriptFilter === 'all' || log.script === scriptFilter) &&
        (query.length === 0 ||
          log.message.toLowerCase().includes(query) ||
          log.script.toLowerCase().includes(query))
    );
  }, [liveLogs, logFilter, streamFilter, scriptFilter, clearedBefore]);

  const scriptOptions = useMemo(
    () => [...new Set(liveLogs.map((log) => log.script))].sort(),
    [liveLogs]
  );

  const streamCounts = useMemo(() => {
    const counts = { stdout: 0, stderr: 0, system: 0 };
    for (const log of liveLogs) {
      counts[log.stream] += 1;
    }
    return counts;
  }, [liveLogs]);

  const logsByPid = useMemo(() => {
    const grouped = new Map<string, ProcessLogEvent[]>();
    for (const log of filteredLogs) {
      const processLogs = grouped.get(log.pid) ?? [];
      processLogs.push(log);
      grouped.set(log.pid, processLogs);
    }
    return grouped;
  }, [filteredLogs]);

  const filtering = logFilter.trim().length > 0 || streamFilter !== 'all';

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
            {filtering
              ? `${filteredLogs.length} of ${logs.length} log lines`
              : `${logs.length} captured log line${logs.length === 1 ? '' : 's'}`}
          </em>
        </header>
        {compact ? null : (
          <div className="log-toolbar">
            <label className="script-filter log-filter">
              <Icon name="search" />
              <input
                type="search"
                placeholder="Filter log lines…"
                value={logFilter}
                onChange={(event) => setLogFilter(event.target.value)}
                aria-label="Filter log lines"
              />
            </label>
            <div className="stream-chips" role="group" aria-label="Stream counts">
              {(['stdout', 'stderr', 'system'] as const).map((stream) => (
                <button
                  className={`health-chip ${streamFilter === stream ? 'active' : ''} ${stream === 'stderr' && streamCounts.stderr > 0 ? 'stderr-chip' : ''}`}
                  key={stream}
                  onClick={() => setStreamFilter(streamFilter === stream ? 'all' : stream)}
                  title={`Show only ${stream} lines`}
                  type="button"
                >
                  {stream} ({streamCounts[stream]})
                </button>
              ))}
            </div>
            <button
              className={`minor-button ${paused ? 'paused-button' : ''}`}
              type="button"
              onClick={() => {
                if (!paused) {
                  setFrozenLogs(logs);
                }
                setPaused(!paused);
              }}
              title={paused ? 'Resume live log updates' : 'Freeze the log view'}
            >
              <Icon name={paused ? 'play' : 'stop'} />
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              className="minor-button"
              type="button"
              disabled={filteredLogs.length === 0}
              onClick={() => downloadLogs(filteredLogs)}
            >
              <Icon name="download" />
              Download
            </button>
            <select
              value={scriptFilter}
              onChange={(event) => setScriptFilter(event.target.value)}
              aria-label="Filter by script"
            >
              <option value="all">All scripts</option>
              {scriptOptions.map((script) => (
                <option key={script} value={script}>
                  {script}
                </option>
              ))}
            </select>
            <label className="checkbox-control compact">
              <input
                checked={wrapLines}
                onChange={(event) => setWrapLines(event.target.checked)}
                type="checkbox"
              />
              <span>Wrap</span>
            </label>
            <label className="checkbox-control compact">
              <input
                checked={showTimestamps}
                onChange={(event) => setShowTimestamps(event.target.checked)}
                type="checkbox"
              />
              <span>Times</span>
            </label>
            <button
              className="minor-button"
              type="button"
              title="Hide everything logged so far (new lines still appear)"
              onClick={() => setClearedBefore(new Date().toISOString())}
            >
              Clear view
            </button>
          </div>
        )}
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
                      {processInfo.endedAt !== null
                        ? ` · ${formatRunDuration(
                            Math.max(
                              new Date(processInfo.endedAt).getTime() -
                                new Date(processInfo.startedAt).getTime(),
                              0
                            )
                          )}`
                        : ''}
                    </span>
                    <span>
                      {processLogs.length} line{processLogs.length === 1 ? '' : 's'}
                      {stderrCount > 0 ? `, ${stderrCount} stderr` : ''}
                    </span>
                    <code>#{processInfo.pid}</code>
                    <button
                      className="minor-button"
                      onClick={(event) => {
                        event.preventDefault();
                        copyText(processLogs.map(formatLogLine).join('\n'));
                      }}
                      title="Copy this process's log lines"
                      type="button"
                    >
                      Copy
                    </button>
                    <span className="process-logs-trigger">
                      Logs
                      <Icon name="chevron" />
                    </span>
                  </summary>
                  <LogConsole
                    logs={processLogs}
                    limit={compact ? 90 : 260}
                    wrap={wrapLines}
                    showTimestamps={showTimestamps}
                    autoScroll={!compact}
                  />
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
  dockerBusy,
  dockerLogs,
  dockerError,
  onStartDockerService,
  onStopDockerService,
  onLoadDockerLogs,
  onClose,
  onSettingsChange,
  themePreference,
  onThemeChange
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
  dockerBusy: DockerBusyState | null;
  dockerLogs: DockerLogState | null;
  dockerError: string | null;
  onStartDockerService: (service: string) => Promise<void>;
  onStopDockerService: (service: string) => Promise<void>;
  onLoadDockerLogs: (service: string) => Promise<void>;
  onClose: () => void;
  onSettingsChange: (settings: DashboardSettings) => void;
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
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
              <ThemeSettingRow themePreference={themePreference} onThemeChange={onThemeChange} />
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
              <DockerServicesWorkspace
                docker={project.docker}
                busy={dockerBusy}
                logs={dockerLogs}
                error={dockerError}
                onStart={onStartDockerService}
                onStop={onStopDockerService}
                onLogs={onLoadDockerLogs}
              />
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

function onboardingStatusMeta(status: OnboardingStep['status']): {
  className: string;
  label: string;
  icon: string;
} {
  if (status === 'done') {
    return { className: 'done', label: 'Done', icon: 'check' };
  }
  if (status === 'todo') {
    return { className: 'todo', label: 'To do', icon: 'play' };
  }
  return { className: 'manual', label: 'Manual', icon: 'alert' };
}

function OnboardingProgress({ plan }: { plan: OnboardingPlan }) {
  return (
    <section className="onboarding-progress">
      <div className="onboarding-progress-head">
        <strong>{plan.readiness}% ready</strong>
        <span>{plan.summary}</span>
      </div>
      <div className="onboarding-progress-bar">
        <span
          className={plan.ready ? 'ready' : ''}
          style={{ width: `${Math.max(plan.readiness, 2)}%` }}
        />
      </div>
    </section>
  );
}

function OnboardingBanner({ plan, onOpen }: { plan: OnboardingPlan; onOpen: () => void }) {
  return (
    <section className="onboarding-banner">
      <span className="onboarding-banner-score">{plan.readiness}%</span>
      <div className="onboarding-banner-copy">
        <strong>Project setup {plan.readiness}% ready</strong>
        <p>{plan.summary}</p>
      </div>
      <button className="minor-button" onClick={onOpen} type="button">
        View setup
        <Icon name="chevron" />
      </button>
    </section>
  );
}

function setupCommandsForProject(project: ScanResult): string[] {
  const manager = project.packageManager ?? 'npm';
  const commands: string[] = [];
  if (project.language.detected.includes('node') && project.packageJson !== null) {
    commands.push(manager === 'npm' ? 'npm ci' : `${manager} install`);
  }
  if (project.env?.hasExample && !project.env.hasLocal) {
    commands.push('cp .env.example .env');
  }
  if (project.docker !== null && project.docker.composeFiles.length > 0) {
    commands.push('docker compose up -d');
  }
  if (project.scripts.dev !== undefined) {
    commands.push(`${manager} run dev`);
  } else if (project.scripts.start !== undefined) {
    commands.push(`${manager} run start`);
  }
  return commands;
}

function OnboardingView({
  plan,
  project,
  onRunStep,
  onRefresh
}: {
  plan: OnboardingPlan | null;
  project: ScanResult;
  onRunStep: (step: OnboardingStep) => void;
  onRefresh: () => Promise<void>;
}) {
  const setupCommands = setupCommandsForProject(project);
  return (
    <section className="section-page">
      <header className="section-page-header">
        <div>
          <span className="drawer-kicker">DevSurface</span>
          <h1>Onboarding</h1>
        </div>
        <button className="utility-button compact" onClick={() => void onRefresh()} type="button">
          <Icon name="refresh" />
          Refresh Data
        </button>
      </header>
      {plan === null ? (
        <p className="drawer-note">
          Onboarding plan is unavailable. Refresh once the project finishes scanning.
        </p>
      ) : (
        <div className="section-grid single">
          {plan.ready ? (
            <section className="onboarding-ready-hero">
              <span className="round-status ok">
                <Icon name="check" />
              </span>
              <div>
                <strong>This project is ready to run</strong>
                <p>Every blocking setup step is done. Start the app and build something.</p>
              </div>
            </section>
          ) : null}
          <OnboardingProgress plan={plan} />
          {setupCommands.length > 0 ? (
            <div className="onboarding-copy-row">
              <button
                className="minor-button"
                onClick={() => copyText(setupCommands.join('\n'))}
                title="Copy the full setup recipe for a terminal"
                type="button"
              >
                Copy all setup commands
              </button>
              <code>{setupCommands.join('  →  ')}</code>
            </div>
          ) : null}
          {plan.steps.length === 0 ? (
            <p className="drawer-note">No onboarding steps were detected for this project.</p>
          ) : (
            <div className="onboarding-steps">
              {plan.steps.map((step) => {
                const meta = onboardingStatusMeta(step.status);
                const actionable = step.action !== undefined && step.status !== 'done';
                return (
                  <article className={`onboarding-step ${meta.className}`} key={step.id}>
                    <span className={`onboarding-step-badge ${meta.className}`}>
                      <Icon name={meta.icon} />
                    </span>
                    <div className="onboarding-step-body">
                      <strong>{step.title}</strong>
                      <p>{step.description}</p>
                    </div>
                    <div className="onboarding-step-action">
                      {actionable && step.action ? (
                        <button
                          className="minor-button"
                          onClick={() => onRunStep(step)}
                          type="button"
                        >
                          {step.action.label}
                        </button>
                      ) : (
                        <span className={`badge ${step.status === 'done' ? 'ok' : ''}`}>
                          {meta.label}
                        </span>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Write-only editor for one env key. The input is a password field, the value
 * is cleared after saving, and nothing about the value is ever rendered back.
 */
function EnvKeyEditor({
  envKey,
  onSave
}: {
  envKey: string;
  onSave: (key: string, value: string) => Promise<void>;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    if (value.length === 0 || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave(envKey, value);
      setValue('');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : String(saveError));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="env-editor">
      <input
        type="password"
        autoComplete="off"
        placeholder={`Paste a value for ${envKey}`}
        value={value}
        disabled={busy}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void save();
          }
        }}
      />
      <button
        className="minor-button"
        type="button"
        disabled={busy || value.length === 0}
        onClick={() => void save()}
      >
        {busy ? 'Saving…' : 'Save'}
      </button>
      {error !== null ? <span className="text-bad env-editor-error">{error}</span> : null}
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
  dockerBusy,
  dockerLogs,
  dockerError,
  onStartDockerService,
  onStopDockerService,
  onLoadDockerLogs,
  onRefresh,
  onSettingsChange,
  onSetEnv,
  onFreePort,
  onScanCommonPorts,
  onJumpToLogs,
  onStopAll,
  logsPrefill,
  history,
  themePreference,
  onThemeChange,
  workspaceId
}: {
  view: Exclude<ActiveView, 'overview' | 'onboarding'>;
  project: ScanResult;
  warnings: DoctorWarning[];
  logs: ProcessLogEvent[];
  processes: ManagedProcessSnapshot[];
  settings: DashboardSettings;
  lastRefreshed: Date;
  onRunScript: (script: string) => Promise<void>;
  onRunConfiguredCommand: (name: string, command: string) => Promise<void>;
  onStopProcess: (pid: string) => Promise<void>;
  dockerBusy: DockerBusyState | null;
  dockerLogs: DockerLogState | null;
  dockerError: string | null;
  onStartDockerService: (service: string) => Promise<void>;
  onStopDockerService: (service: string) => Promise<void>;
  onLoadDockerLogs: (service: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  onSettingsChange: (settings: DashboardSettings) => void;
  onSetEnv: (key: string, value: string) => Promise<void>;
  onFreePort: (port: ScanResult['ports'][number]) => Promise<void>;
  onScanCommonPorts: () => Promise<ScanResult['ports']>;
  onJumpToLogs: (script: string) => void;
  onStopAll: () => Promise<void>;
  logsPrefill: string;
  history: RunHistoryEntry[];
  themePreference: ThemePreference;
  onThemeChange: (preference: ThemePreference) => void;
  workspaceId: string | null;
}) {
  const [commonPorts, setCommonPorts] = useState<ScanResult['ports'] | null>(null);
  const [scanningCommon, setScanningCommon] = useState(false);

  async function scanCommonPorts(): Promise<void> {
    setScanningCommon(true);
    try {
      setCommonPorts(await onScanCommonPorts());
    } finally {
      setScanningCommon(false);
    }
  }
  const [scriptFilter, setScriptFilter] = useState('');
  const [scriptSort, setScriptSort] = useState<'default' | 'name' | 'recent'>('default');
  const [healthFilter, setHealthFilter] = useState<'all' | 'error' | 'warning' | 'info'>('all');
  const filteredWarnings =
    healthFilter === 'all'
      ? warnings
      : warnings.filter((warning) => warning.severity === healthFilter);
  const scriptQuery = scriptFilter.trim().toLowerCase();
  const filteredScripts = Object.entries(project.scripts)
    .filter(
      ([script, command]) =>
        scriptQuery.length === 0 ||
        script.toLowerCase().includes(scriptQuery) ||
        command.toLowerCase().includes(scriptQuery)
    )
    .sort(([left], [right]) => {
      if (scriptSort === 'name') {
        return left.localeCompare(right);
      }
      if (scriptSort === 'recent') {
        const leftIndex = history.findIndex((entry) => entry.script === left);
        const rightIndex = history.findIndex((entry) => entry.script === right);
        return (
          (leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex) -
          (rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex)
        );
      }
      return 0;
    });
  const runningCount = processes.filter((processInfo) => processInfo.status === 'running').length;
  const titleMap: Record<Exclude<ActiveView, 'overview' | 'onboarding'>, string> = {
    scripts: 'Scripts',
    environment: 'Environment',
    ports: 'Ports',
    services: 'Services',
    health: 'Repo Health',
    logs: 'Logs',
    learn: 'Learn',
    settings: 'Settings'
  };

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
            <div className="script-list-toolbar">
              <label className="script-filter">
                <Icon name="search" />
                <input
                  type="search"
                  placeholder="Filter scripts by name or command…"
                  value={scriptFilter}
                  onChange={(event) => setScriptFilter(event.target.value)}
                  aria-label="Filter scripts"
                />
                {scriptFilter.length > 0 ? (
                  <button type="button" onClick={() => setScriptFilter('')}>
                    Clear
                  </button>
                ) : null}
              </label>
              <select
                value={scriptSort}
                onChange={(event) =>
                  setScriptSort(event.target.value as 'default' | 'name' | 'recent')
                }
                aria-label="Sort scripts"
              >
                <option value="default">Package order</option>
                <option value="name">By name</option>
                <option value="recent">Recently run</option>
              </select>
              {runningCount > 0 ? (
                <button
                  className="minor-button stop-all-button"
                  onClick={() => void onStopAll()}
                  type="button"
                >
                  <Icon name="stop" />
                  Stop all ({runningCount})
                </button>
              ) : null}
            </div>
            <div className="drawer-table script-drawer-table">
              {filteredScripts.length === 0 ? (
                <p className="drawer-note">No scripts match “{scriptFilter}”.</p>
              ) : null}
              {filteredScripts.map(([script, command]) => {
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
                    <button
                      className="minor-button"
                      onClick={() => copyText(`${project.packageManager ?? 'npm'} run ${script}`)}
                      title="Copy the run invocation for a terminal"
                      type="button"
                    >
                      Copy
                    </button>
                    {processInfo !== null ? (
                      <button
                        className="minor-button"
                        onClick={() => onJumpToLogs(script)}
                        title="Open this script's output in the Logs view"
                        type="button"
                      >
                        Logs
                      </button>
                    ) : null}
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
          <RecentRunsSection history={history} />
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
              {(project.env?.additionalFiles ?? []).map((file) => (
                <div className="drawer-row" key={file}>
                  <span>{file}</span>
                  <strong className="text-ok">found</strong>
                </div>
              ))}
            </div>
          </DrawerSection>
          <DrawerSection title="Variables">
            {project.env === null || project.env.keys.length === 0 ? (
              <p className="drawer-note">No env variables were detected.</p>
            ) : (
              <div className="drawer-table two-col">
                {project.env.keys.map((item) => (
                  <div className="env-variable-block" key={item.key}>
                    <div className="drawer-row">
                      <code>{item.key}</code>
                      <strong className={item.present && !item.empty ? 'text-ok' : 'text-bad'}>
                        {item.present ? (item.empty ? 'empty' : 'present') : 'missing'}
                      </strong>
                    </div>
                    {project.env?.descriptions?.[item.key] !== undefined ? (
                      <p className="env-key-description">{project.env.descriptions[item.key]}</p>
                    ) : null}
                    {!item.present || item.empty ? (
                      <EnvKeyEditor envKey={item.key} onSave={onSetEnv} />
                    ) : null}
                  </div>
                ))}
              </div>
            )}
            <p className="drawer-note">
              Values you save are written straight to .env and are never shown back, logged, or sent
              anywhere.
            </p>
            {project.env !== null &&
            project.env.missingKeys.length + project.env.emptyKeys.length > 0 ? (
              <button
                className="minor-button"
                onClick={() =>
                  copyText(
                    [...new Set([...project.env!.missingKeys, ...project.env!.emptyKeys])]
                      .map((key) => `${key}=`)
                      .join('\n')
                  )
                }
                title="Copy every unset key as KEY= lines, ready to paste into .env"
                type="button"
              >
                Copy unset keys as template
              </button>
            ) : null}
          </DrawerSection>
          {project.env !== null && (project.env.extraKeys?.length ?? 0) > 0 ? (
            <DrawerSection title="Undocumented Keys">
              <p className="drawer-note">
                These keys exist in .env but not in .env.example, so other machines will not know
                about them. Add the key names (without values) to the example.
              </p>
              <div className="drawer-table two-col">
                {(project.env.extraKeys ?? []).map((key) => (
                  <div className="drawer-row" key={key}>
                    <code>{key}</code>
                    <span className="text-bad">not in example</span>
                  </div>
                ))}
              </div>
            </DrawerSection>
          ) : null}
        </div>
      ) : null}

      {view === 'ports' ? (
        <div className="section-grid single">
          <DrawerSection title="Detected Ports">
            {project.ports.length === 0 ? (
              <p className="drawer-note">No configured or inferred ports.</p>
            ) : (
              <div className="drawer-table port-action-table">
                {project.ports.map((port) => (
                  <div className="drawer-row" key={port.port}>
                    <strong>{port.port}</strong>
                    <code>http://localhost:{port.port}</code>
                    <span className={port.inUse ? 'text-bad' : 'text-ok'}>
                      {port.inUse ? describeBusyPort(port) : 'available'}
                    </span>
                    <span className="port-row-actions">
                      <button
                        className="minor-button"
                        onClick={() => copyText(`http://localhost:${port.port}`)}
                        title="Copy the URL"
                        type="button"
                      >
                        Copy
                      </button>
                      {port.inUse ? (
                        <>
                          <button
                            className="minor-button"
                            onClick={() =>
                              window.open(
                                `http://localhost:${port.port}`,
                                '_blank',
                                'noopener,noreferrer'
                              )
                            }
                            title="Open the URL in a new tab"
                            type="button"
                          >
                            <Icon name="external" />
                            Open
                          </button>
                          <button
                            className="minor-button"
                            onClick={() => void onFreePort(port)}
                            title="Stop the process using this port"
                            type="button"
                          >
                            <Icon name="stop" />
                            Free
                          </button>
                        </>
                      ) : null}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </DrawerSection>
          <DrawerSection title="What Else Is Running?">
            <p className="drawer-note">
              Scan the ports dev tools usually claim (3000, 5173, 8080, 5432…) to see what is
              occupying your machine right now.
            </p>
            <button
              className="minor-button"
              disabled={scanningCommon}
              onClick={() => void scanCommonPorts()}
              type="button"
            >
              <Icon name="search" />
              {scanningCommon ? 'Scanning…' : 'Scan common dev ports'}
            </button>
            {commonPorts !== null ? (
              commonPorts.filter((port) => port.inUse).length === 0 ? (
                <p className="drawer-note">All common dev ports are free.</p>
              ) : (
                <div className="drawer-table port-action-table">
                  {commonPorts
                    .filter((port) => port.inUse)
                    .map((port) => (
                      <div className="drawer-row" key={`common-${port.port}`}>
                        <strong>{port.port}</strong>
                        <code>http://localhost:{port.port}</code>
                        <span className="text-bad">{describeBusyPort(port)}</span>
                        <span className="port-row-actions">
                          <button
                            className="minor-button"
                            onClick={() => void onFreePort(port).then(() => scanCommonPorts())}
                            title="Stop the process using this port"
                            type="button"
                          >
                            <Icon name="stop" />
                            Free
                          </button>
                        </span>
                      </div>
                    ))}
                </div>
              )
            ) : null}
          </DrawerSection>
          <p className="drawer-note">Last checked: {formatTime(lastRefreshed)}</p>
        </div>
      ) : null}

      {view === 'services' ? (
        <div className="section-grid single">
          <DrawerSection title="Docker Compose">
            <DockerServicesWorkspace
              docker={project.docker}
              busy={dockerBusy}
              logs={dockerLogs}
              error={dockerError}
              onStart={onStartDockerService}
              onStop={onStopDockerService}
              onLogs={onLoadDockerLogs}
            />
          </DrawerSection>
        </div>
      ) : null}

      {view === 'health' ? (
        <div className="section-grid single">
          <DrawerSection title="Doctor Check">
            {warnings.length > 0 ? (
              <div className="health-toolbar">
                <div className="health-filter-chips" role="group" aria-label="Filter by severity">
                  {(['all', 'error', 'warning', 'info'] as const).map((severity) => {
                    const count =
                      severity === 'all'
                        ? warnings.length
                        : warnings.filter((warning) => warning.severity === severity).length;
                    return (
                      <button
                        className={`health-chip ${healthFilter === severity ? 'active' : ''}`}
                        key={severity}
                        onClick={() => setHealthFilter(severity)}
                        type="button"
                      >
                        {severity} ({count})
                      </button>
                    );
                  })}
                </div>
                <button
                  className="minor-button"
                  onClick={() =>
                    copyText(
                      warnings
                        .map(
                          (warning) =>
                            `- **${warning.title}** (${warning.severity}) — ${warning.message}`
                        )
                        .join('\n')
                    )
                  }
                  title="Copy every warning as a Markdown list"
                  type="button"
                >
                  Copy as Markdown
                </button>
              </div>
            ) : null}
            {warnings.length === 0 ? (
              <p className="drawer-note">No health warnings. All good.</p>
            ) : filteredWarnings.length === 0 ? (
              <p className="drawer-note">No {healthFilter} warnings.</p>
            ) : (
              <div className="drawer-list">
                {filteredWarnings.map((warning) => (
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

      {view === 'logs' ? (
        <LogsWorkspace
          key={logsPrefill}
          processes={processes}
          logs={logs}
          initialFilter={logsPrefill}
        />
      ) : null}

      {view === 'learn' ? <LearnPanel workspaceId={workspaceId} /> : null}

      {view === 'settings' ? (
        <div className="section-grid">
          <DrawerSection title="Dashboard">
            <ThemeSettingRow themePreference={themePreference} onThemeChange={onThemeChange} />
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

function WorkspaceSwitcher({
  workspaces,
  activeId,
  onSwitch
}: {
  workspaces: WorkspaceSummary[];
  activeId: string | null;
  onSwitch: (id: string) => void;
}) {
  if (workspaces.length <= 1) {
    return null;
  }

  return (
    <div className="workspace-switcher">
      <select
        value={activeId ?? ''}
        onChange={(e) => onSwitch(e.target.value)}
        aria-label="Switch workspace"
      >
        {workspaces.map((ws) => (
          <option key={ws.id} value={ws.id}>
            {ws.name}
            {ws.missing === true
              ? ' (missing)'
              : ws.runningProcesses > 0
                ? ` (${ws.runningProcesses} running)`
                : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

function AddWorkspaceForm({ onAdd }: { onAdd: (path: string) => Promise<string | null> }) {
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(): Promise<void> {
    if (path.trim().length === 0 || busy) {
      return;
    }
    setBusy(true);
    setError(null);
    const failure = await onAdd(path.trim());
    setBusy(false);
    if (failure === null) {
      setPath('');
    } else {
      setError(failure);
    }
  }

  return (
    <div className="hub-add-form">
      <input
        placeholder="Absolute path to a project folder…"
        value={path}
        disabled={busy}
        onChange={(event) => setPath(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void submit();
          }
        }}
        aria-label="Project folder path"
      />
      <button className="minor-button" disabled={busy} onClick={() => void submit()} type="button">
        {busy ? 'Adding…' : 'Add workspace'}
      </button>
      {error !== null ? <span className="text-bad">{error}</span> : null}
    </div>
  );
}

function HubOverview({
  workspaces,
  onSwitch,
  onPrune,
  onAdd
}: {
  workspaces: WorkspaceSummary[];
  onSwitch: (id: string) => void;
  onPrune: () => Promise<void>;
  onAdd: (path: string) => Promise<string | null>;
}) {
  const missingCount = workspaces.filter((ws) => ws.missing === true).length;
  const [hubQuery, setHubQuery] = useState('');
  const visibleWorkspaces = workspaces.filter((ws) => {
    const query = hubQuery.trim().toLowerCase();
    return (
      query.length === 0 ||
      ws.name.toLowerCase().includes(query) ||
      ws.path.toLowerCase().includes(query)
    );
  });

  return (
    <div className="hub-overview">
      <h2>Workspaces</h2>
      <AddWorkspaceForm onAdd={onAdd} />
      {workspaces.length > 3 ? (
        <label className="script-filter hub-search">
          <Icon name="search" />
          <input
            type="search"
            placeholder="Filter workspaces…"
            value={hubQuery}
            onChange={(event) => setHubQuery(event.target.value)}
            aria-label="Filter workspaces"
          />
        </label>
      ) : null}
      {missingCount > 0 ? (
        <p className="hub-prune-note">
          {missingCount} workspace{missingCount === 1 ? '' : 's'} point
          {missingCount === 1 ? 's' : ''} to folders that no longer exist.{' '}
          <button className="minor-button" onClick={() => void onPrune()} type="button">
            Remove missing
          </button>
        </p>
      ) : null}
      {workspaces.length === 0 ? (
        <p className="empty">
          No workspaces registered. Run <code>devsurface workspace add</code> or{' '}
          <code>npx devsurface</code> inside a project.
        </p>
      ) : (
        <div className="hub-workspace-grid">
          {visibleWorkspaces.map((ws) => (
            <button
              key={ws.id}
              className={`hub-workspace-card ${ws.missing === true ? 'missing' : ''}`}
              onClick={() => onSwitch(ws.id)}
            >
              <strong>{ws.name}</strong>
              <span className="hub-workspace-path">{ws.path}</span>
              <span className="hub-workspace-meta">
                {ws.missing === true
                  ? 'folder missing'
                  : ws.runningProcesses > 0
                    ? `${ws.runningProcesses} running`
                    : 'idle'}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const workspaceState = useWorkspace();
  const projectState = useProject(workspaceState.activeId);
  const socket = useSocket(workspaceState.activeId);
  const [lastRefreshed, setLastRefreshed] = useState(() => new Date());
  const [selectedScript, setSelectedScript] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<ActiveView>('overview');
  const [drawer, setDrawer] = useState<DrawerKind>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1'
  );
  const [settings, setSettings] = useState<DashboardSettings>(loadStoredSettings);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() =>
    readStoredThemePreference(typeof window !== 'undefined' ? window.localStorage : null)
  );
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() =>
    applyTheme(
      readStoredThemePreference(typeof window !== 'undefined' ? window.localStorage : null)
    )
  );
  const [dockerBusy, setDockerBusy] = useState<DockerBusyState | null>(null);
  const [dockerLogs, setDockerLogs] = useState<DockerLogState | null>(null);
  const [dockerError, setDockerError] = useState<string | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [pinned, setPinned] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [logsPrefill, setLogsPrefill] = useState('');
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
        setShortcutsOpen(false);
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

      if (action.type === 'palette') {
        setPaletteOpen((current) => !current);
        return;
      }

      if (action.type === 'shortcutsHelp') {
        setShortcutsOpen((current) => !current);
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

  useEffect(() => {
    setResolvedTheme(applyTheme(themePreference));
    storeThemePreference(
      typeof window !== 'undefined' ? window.localStorage : null,
      themePreference
    );

    if (themePreference !== 'system' || typeof window.matchMedia !== 'function') {
      return undefined;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const followSystem = (): void => setResolvedTheme(applyTheme('system'));
    media.addEventListener('change', followSystem);
    return () => media.removeEventListener('change', followSystem);
  }, [themePreference]);

  function addToast(message: string): void {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current.slice(-3), { id, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, 4200);
  }

  // Persist dashboard settings and sidebar state across reloads.
  useEffect(() => {
    try {
      window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // Storage unavailable — settings stay session-only.
    }
  }, [settings]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? '1' : '0');
    } catch {
      // Storage unavailable.
    }
  }, [sidebarCollapsed]);

  // A watched project file changed on disk. The server pushes the fresh scan
  // right behind this hint, so only announce it here.
  const projectChangeAt = socket.projectChange?.at ?? 0;
  useEffect(() => {
    if (projectChangeAt === 0) {
      return;
    }
    addToast(`${socket.projectChange?.file ?? 'A project file'} changed — rescanned.`);
  }, [projectChangeAt]);

  // Server-pushed rescan: apply scan + health + onboarding directly.
  const projectPushAt = socket.projectPush?.at ?? 0;
  useEffect(() => {
    if (projectPushAt === 0 || socket.projectPush === null) {
      return;
    }
    projectState.applyServerPush(socket.projectPush);
    setLastRefreshed(new Date());
  }, [projectPushAt]);

  // Finished runs stream into Recent Runs without a refresh.
  const runRecordedAt = socket.runRecorded?.at ?? 0;
  useEffect(() => {
    if (runRecordedAt === 0 || socket.runRecorded === null) {
      return;
    }
    projectState.prependHistory(socket.runRecorded.entry);
  }, [runRecordedAt]);

  // Registry changes (add/remove/prune) refresh the switcher everywhere.
  useEffect(() => {
    if (socket.workspacesChangedAt === 0) {
      return;
    }
    void workspaceState.refresh();
  }, [socket.workspacesChangedAt]);

  // Announce live-connection drops and recoveries.
  const previousConnection = useRef<typeof socket.connection>('connecting');
  useEffect(() => {
    const previous = previousConnection.current;
    previousConnection.current = socket.connection;
    if (previous === 'open' && socket.connection !== 'open') {
      addToast('Live connection lost — reconnecting…');
    }
    if (previous === 'reconnecting' && socket.connection === 'open') {
      addToast('Live connection restored.');
      void refreshProject();
    }
  }, [socket.connection]);

  // Pinned scripts are stored per project root.
  const projectRoot = projectState.project?.root ?? null;
  useEffect(() => {
    if (projectRoot !== null) {
      setPinned(readPinnedScripts(window.localStorage, projectRoot));
    }
  }, [projectRoot]);

  function togglePin(script: string): void {
    if (projectRoot !== null) {
      setPinned(togglePinnedScript(window.localStorage, projectRoot, script));
    }
  }

  // Tick once a second so elapsed times and "refreshed Xs ago" stay live.
  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  // Browser-tab affordances: project name in the title, status dot on the favicon.
  useEffect(() => {
    if (projectState.project !== null) {
      document.title = `${projectState.project.projectName} — DevSurface`;
    }
  }, [projectState.project]);

  useEffect(() => {
    applyStatusFavicon(faviconStateFromProcesses(processes));
  }, [processes]);

  // Browser notification when a watched process fails.
  const [seenFailures] = useState(() => new Set<string>());
  useEffect(() => {
    if (!settings.notifyOnFailure || typeof Notification === 'undefined') {
      return;
    }
    for (const processInfo of processes) {
      if (processInfo.status === 'failed' && !seenFailures.has(processInfo.pid)) {
        seenFailures.add(processInfo.pid);
        if (Notification.permission === 'granted') {
          new Notification(`DevSurface: ${processInfo.script} failed`, {
            body: `${processInfo.command} exited with code ${processInfo.exitCode ?? 'unknown'}.`
          });
        }
      }
    }
  }, [processes, settings.notifyOnFailure, seenFailures]);

  async function refreshProject(): Promise<void> {
    await projectState.refresh();
    setLastRefreshed(new Date());
  }

  const wsPrefix = apiPrefix(workspaceState.activeId);

  async function postDashboardAction(pathname: string): Promise<boolean> {
    const response = await fetch(pathname, {
      method: 'POST',
      headers: await mutationHeaders()
    });
    return response.ok;
  }

  async function openTerminal(): Promise<void> {
    const opened = await postDashboardAction(`${wsPrefix}/open/terminal`).catch(() => false);
    setDrawer(null);
    if (!opened) {
      window.alert('Unable to open a terminal from this platform.');
    }
  }

  async function openFolder(): Promise<void> {
    const opened = await postDashboardAction(`${wsPrefix}/open/folder`).catch(() => false);
    setDrawer(null);
    if (!opened) {
      window.alert('Unable to open the project folder.');
    }
  }

  async function openEditor(): Promise<void> {
    const opened = await postDashboardAction(`${wsPrefix}/open/editor`).catch(() => false);
    setDrawer(null);
    if (!opened) {
      window.alert(
        'No editor CLI was found. Install the VS Code "code" command or set DEVSURFACE_EDITOR.'
      );
    }
  }

  async function freeBusyPort(port: ScanResult['ports'][number]): Promise<void> {
    const owner =
      port.owner == null
        ? 'the process using it'
        : port.owner.name === null
          ? `PID ${port.owner.pid}`
          : `${port.owner.name} (PID ${port.owner.pid})`;
    const confirmed = window.confirm(
      `Free port ${port.port}?\n\nThis force-stops ${owner}. Unsaved work in that process is lost.`
    );
    if (!confirmed) {
      return;
    }

    const response = await fetch(`${wsPrefix}/ports/${port.port}/free`, {
      method: 'POST',
      headers: await mutationHeaders()
    }).catch(() => null);
    if (response === null || !response.ok) {
      const payload = (await response?.json().catch(() => null)) as { error?: string } | null;
      window.alert(payload?.error ?? `Unable to free port ${port.port}.`);
    }
    await refreshProject();
  }

  async function stopAllProcesses(): Promise<void> {
    const running = processes.filter((processInfo) => processInfo.status === 'running').length;
    if (running === 0) {
      addToast('Nothing is running.');
      return;
    }
    if (!window.confirm(`Stop all ${running} running process${running === 1 ? '' : 'es'}?`)) {
      return;
    }
    const response = await fetch(`${wsPrefix}/stop-all`, {
      method: 'POST',
      headers: await mutationHeaders()
    }).catch(() => null);
    if (response !== null && response.ok) {
      addToast(`Stopped ${running} process${running === 1 ? '' : 'es'}.`);
    }
    await refreshProject();
  }

  async function restartScript(script: string, pid: string): Promise<void> {
    await fetch(`${wsPrefix}/run/${encodeURIComponent(pid)}`, {
      method: 'DELETE',
      headers: await mutationHeaders()
    }).catch(() => null);
    // Give the process tree a moment to release ports before relaunching.
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    const response = await fetch(`${wsPrefix}/run/${encodeURIComponent(script)}`, {
      method: 'POST',
      headers: await mutationHeaders()
    }).catch(() => null);
    addToast(
      response !== null && response.ok ? `Restarted ${script}.` : `Unable to restart ${script}.`
    );
    await refreshProject();
  }

  async function launchProject(): Promise<void> {
    const project = projectState.project;
    if (project === null) {
      return;
    }
    const plan = resolveLaunchPlan(project);
    if (plan.steps.length === 0) {
      addToast('Nothing to launch: no Docker services or dev/start script.');
      return;
    }
    const description = plan.steps.map((step) => describeLaunchStep(step)).join('\n  ');
    if (!window.confirm(`Run the launch sequence?\n\n  ${description}`)) {
      return;
    }

    for (const step of plan.steps) {
      addToast(`Launch: ${describeLaunchStep(step)}`);
      if (step.kind === 'docker') {
        for (const service of project.docker?.services ?? []) {
          if (service.status !== 'running') {
            await fetch(`${wsPrefix}/docker/${encodeURIComponent(service.name)}/start`, {
              method: 'POST',
              headers: await mutationHeaders()
            }).catch(() => null);
          }
        }
      } else if (step.kind === 'script') {
        await fetch(`${wsPrefix}/run/${encodeURIComponent(step.name)}`, {
          method: 'POST',
          headers: await mutationHeaders()
        }).catch(() => null);
      } else {
        await fetch(`${wsPrefix}/commands/${encodeURIComponent(step.name)}`, {
          method: 'POST',
          headers: await mutationHeaders()
        }).catch(() => null);
      }
    }
    setActiveView('logs');
    await refreshProject();
  }

  function jumpToLogs(script: string): void {
    setLogsPrefill(script);
    setActiveView('logs');
    setDrawer(null);
  }

  async function scanCommonPorts(): Promise<ScanResult['ports']> {
    try {
      const response = await fetch(`${wsPrefix}/ports/common`);
      return response.ok ? ((await response.json()) as ScanResult['ports']) : [];
    } catch {
      return [];
    }
  }

  async function pruneWorkspaces(): Promise<void> {
    await fetch('/api/workspaces/prune', {
      method: 'POST',
      headers: await mutationHeaders()
    }).catch(() => null);
    await workspaceState.refresh();
  }

  async function addWorkspace(path: string): Promise<string | null> {
    try {
      const response = await fetch('/api/workspaces', {
        method: 'POST',
        headers: { ...(await mutationHeaders()), 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        return payload?.error ?? 'Unable to add workspace.';
      }
      await workspaceState.refresh();
      return null;
    } catch {
      return 'Unable to reach the DevSurface server.';
    }
  }

  async function viewPackageJson(): Promise<void> {
    const opened = await postDashboardAction(`${wsPrefix}/open/package`).catch(() => false);
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

    const started = await postDashboardAction(`${wsPrefix}/install`).catch(() => false);
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
      const response = await fetch(`${wsPrefix}/run/${encodeURIComponent(script)}`, {
        method: 'POST',
        headers: await mutationHeaders()
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

    const response = await fetch(`${wsPrefix}/commands/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: await mutationHeaders()
    });
    if (!response.ok) {
      throw new Error(`Unable to start ${name}`);
    }
    await refreshProject();
  }

  async function stopProcess(pid: string): Promise<void> {
    await fetch(`${wsPrefix}/run/${encodeURIComponent(pid)}`, {
      method: 'DELETE',
      headers: await mutationHeaders()
    });
    await refreshProject();
  }

  async function runOnboardingStep(step: OnboardingStep): Promise<void> {
    const action = step.action;
    const project = projectState.project;
    if (action === undefined || project === null) {
      return;
    }

    if (action.kind === 'install') {
      await installDependencies();
      return;
    }
    if (action.kind === 'env-copy') {
      await copyEnvExample();
      return;
    }
    if (action.kind === 'run-script' && action.target !== undefined) {
      await runScript(action.target);
      return;
    }
    if (action.kind === 'run-command' && action.target !== undefined) {
      const command =
        project.config?.config.commands?.[action.target] ??
        project.presetCommands[action.target] ??
        action.target;
      await runConfiguredCommand(action.target, command);
      return;
    }
    if (action.kind === 'docker') {
      setActiveView('services');
      return;
    }
    if (
      action.kind === 'open-docs' &&
      action.target !== undefined &&
      isSafeHttpUrl(action.target)
    ) {
      window.open(action.target, '_blank', 'noopener,noreferrer');
    }
  }

  async function copyEnvExample(): Promise<void> {
    const confirmed = window.confirm(
      'Copy .env.example to .env? Existing .env files are never overwritten.'
    );
    if (!confirmed) {
      return;
    }

    const response = await fetch(`${wsPrefix}/env/copy`, {
      method: 'POST',
      headers: await mutationHeaders()
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? 'Unable to copy .env.example');
    }

    await refreshProject();
  }

  async function setEnvKeyValue(key: string, value: string): Promise<void> {
    const response = await fetch(`${wsPrefix}/env/set`, {
      method: 'POST',
      headers: { ...(await mutationHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error ?? `Unable to save ${key}`);
    }
    await refreshProject();
  }

  async function dockerResponseError(response: Response, fallback: string): Promise<string> {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    return payload?.error ?? fallback;
  }

  async function changeDockerService(service: string, action: 'start' | 'stop'): Promise<void> {
    const command =
      action === 'start'
        ? `docker compose up -d -- ${service}`
        : `docker compose stop -- ${service}`;
    if (!window.confirm(`Run this Docker Compose command?\n\n${command}`)) {
      return;
    }

    setDockerBusy({ service, action });
    setDockerError(null);
    try {
      const response = await fetch(`${wsPrefix}/docker/${encodeURIComponent(service)}/${action}`, {
        method: 'POST',
        headers: await mutationHeaders()
      });
      if (!response.ok) {
        throw new Error(
          await dockerResponseError(response, `Unable to ${action} Docker service "${service}".`)
        );
      }
      setDockerLogs(null);
      await refreshProject();
    } catch (error) {
      setDockerError(error instanceof Error ? error.message : String(error));
    } finally {
      setDockerBusy(null);
    }
  }

  async function loadDockerLogs(service: string): Promise<void> {
    setDockerBusy({ service, action: 'logs' });
    setDockerError(null);
    try {
      const response = await fetch(`${wsPrefix}/docker/${encodeURIComponent(service)}/logs`);
      if (!response.ok) {
        throw new Error(
          await dockerResponseError(response, `Unable to load Docker logs for "${service}".`)
        );
      }
      const payload = (await response.json()) as { service: string; logs: string };
      setDockerLogs({ service: payload.service, content: payload.logs });
    } catch (error) {
      setDockerError(error instanceof Error ? error.message : String(error));
    } finally {
      setDockerBusy(null);
    }
  }

  if (!workspaceState.activeId && !workspaceState.loading) {
    return (
      <main className="app-shell loading-shell">
        <HubOverview
          workspaces={workspaceState.workspaces}
          onSwitch={workspaceState.switchWorkspace}
          onPrune={pruneWorkspaces}
          onAdd={addWorkspace}
        />
      </main>
    );
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

  const paletteItems: PaletteItem[] = [
    ...(
      [
        ['overview', 'Overview'],
        ['onboarding', 'Onboarding'],
        ['scripts', 'Scripts'],
        ['environment', 'Environment'],
        ['ports', 'Ports'],
        ['services', 'Services'],
        ['health', 'Repo Health'],
        ['logs', 'Logs'],
        ['learn', 'Learn'],
        ['settings', 'Settings']
      ] as Array<[ActiveView, string]>
    ).map(([view, label]) => ({
      id: `view-${view}`,
      label: `Go to ${label}`,
      group: 'Views',
      keywords: 'open show view page tab',
      action: () => {
        setActiveView(view);
        setDrawer(null);
      }
    })),
    {
      id: 'action-refresh',
      label: 'Refresh project data',
      group: 'Actions',
      keywords: 'rescan reload',
      action: () => void refreshProject()
    },
    {
      id: 'action-terminal',
      label: 'Open terminal here',
      group: 'Actions',
      keywords: 'shell console cmd',
      action: () => void openTerminal()
    },
    {
      id: 'action-folder',
      label: 'Open project folder',
      group: 'Actions',
      keywords: 'explorer finder files',
      action: () => void openFolder()
    },
    {
      id: 'action-editor',
      label: 'Open in code editor',
      group: 'Actions',
      keywords: 'vscode code cursor ide edit',
      action: () => void openEditor()
    },
    {
      id: 'action-install',
      label: 'Install dependencies',
      group: 'Actions',
      hint: projectState.project.packageManager ?? 'npm',
      keywords: 'npm pnpm yarn bun node_modules',
      action: () => void installDependencies()
    },
    {
      id: 'action-passport',
      label: 'Open Project Passport',
      group: 'Actions',
      hint: 'shareable onboarding report',
      keywords: 'report share html onboarding',
      action: () => {
        window.open(`${wsPrefix}/passport`, '_blank', 'noreferrer');
      }
    },
    {
      id: 'action-theme-toggle',
      label: resolvedTheme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
      group: 'Actions',
      keywords: 'theme dark light mode appearance color',
      action: () => setThemePreference(toggledTheme(resolvedTheme))
    },
    {
      id: 'action-theme-system',
      label: 'Use system theme',
      group: 'Actions',
      keywords: 'theme auto system mode appearance',
      action: () => setThemePreference('system')
    },
    {
      id: 'action-shortcuts',
      label: 'Show keyboard shortcuts',
      group: 'Actions',
      keywords: 'help keys keyboard hotkeys bindings',
      action: () => setShortcutsOpen(true)
    },
    {
      id: 'action-copy-path',
      label: 'Copy project path',
      group: 'Actions',
      hint: projectState.project.root,
      keywords: 'clipboard folder directory root path',
      action: () => copyText(projectState.project?.root ?? '')
    },
    {
      id: 'action-launch',
      label: 'Launch project',
      group: 'Actions',
      hint: 'docker + dev script, in order',
      keywords: 'up start sequence boot run everything',
      action: () => void launchProject()
    },
    {
      id: 'action-stop-all',
      label: 'Stop all running processes',
      group: 'Actions',
      keywords: 'kill halt terminate everything panic',
      action: () => void stopAllProcesses()
    },
    {
      id: 'action-report',
      label: 'Open Markdown report',
      group: 'Actions',
      hint: 'scan + health as Markdown',
      keywords: 'markdown export report md docs',
      action: () => {
        window.open(`${wsPrefix}/report.md`, '_blank', 'noreferrer');
      }
    },
    {
      id: 'action-badge',
      label: 'Open readiness badge (SVG)',
      group: 'Actions',
      keywords: 'badge svg readiness score shield',
      action: () => {
        window.open(`${wsPrefix}/badge.svg`, '_blank', 'noreferrer');
      }
    },
    ...(projectState.project.docker?.services ?? []).map((service) => ({
      id: `docker-${service.name}`,
      label:
        service.status === 'running'
          ? `Stop Docker service ${service.name}`
          : `Start Docker service ${service.name}`,
      group: 'Services',
      keywords: 'docker compose container service database',
      action: () =>
        void changeDockerService(service.name, service.status === 'running' ? 'stop' : 'start')
    })),
    ...projectState.project.ports
      .filter((port) => port.inUse)
      .map((port) => ({
        id: `free-port-${port.port}`,
        label: `Free port ${port.port}`,
        hint:
          port.owner?.name != null
            ? `stops ${port.owner.name} (PID ${port.owner.pid})`
            : 'stops the process using it',
        group: 'Actions',
        keywords: 'port busy kill stop conflict free',
        action: () => void freeBusyPort(port)
      })),
    ...Object.entries(projectState.project.scripts).map(([script, command]) => ({
      id: `script-${script}`,
      label: `Run ${script}`,
      hint: explainScript(script, command),
      group: 'Scripts',
      keywords: command,
      action: () => {
        setActiveView('scripts');
        setSelectedScript(script);
        void runScript(script);
      }
    })),
    ...workspaceState.workspaces
      .filter((workspace) => workspace.id !== workspaceState.activeId)
      .map((workspace) => ({
        id: `workspace-${workspace.id}`,
        label: `Switch to ${workspace.name}`,
        hint: workspace.path,
        group: 'Workspaces',
        keywords: 'workspace project change',
        action: () => workspaceState.switchWorkspace(workspace.id)
      }))
  ];

  return (
    <main
      className={`app-shell font-scale-${settings.fontScale}${settings.highContrast ? ' high-contrast' : ''}`}
    >
      <Sidebar
        activeView={activeView}
        collapsed={sidebarCollapsed}
        warningCount={projectState.health.filter((warning) => warning.severity !== 'info').length}
        onboardingTodo={
          projectState.onboarding?.steps.filter((step) => step.blocking && step.status !== 'done')
            .length ?? 0
        }
        busyPortCount={projectState.project.ports.filter((port) => port.inUse).length}
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
        <div className="topbar-row">
          <WorkspaceSwitcher
            workspaces={workspaceState.workspaces}
            activeId={workspaceState.activeId}
            onSwitch={workspaceState.switchWorkspace}
          />
          <Topbar
            project={projectState.project}
            theme={resolvedTheme}
            lastRefreshed={lastRefreshed}
            now={now}
            onToggleTheme={() => setThemePreference(toggledTheme(resolvedTheme))}
            onRefresh={refreshProject}
          />
        </div>
        <div className="dashboard-frame">
          {activeView === 'overview' ? (
            <>
              <div className="primary-column">
                {projectState.onboarding && !projectState.onboarding.ready ? (
                  <OnboardingBanner
                    plan={projectState.onboarding}
                    onOpen={() => setActiveView('onboarding')}
                  />
                ) : null}
                <OverviewMatrix project={projectState.project} lastRefreshed={lastRefreshed} />
                <QuickActionStrip
                  packageManager={projectState.project.packageManager}
                  passportHref={
                    workspaceState.activeId
                      ? `/api/workspaces/${encodeURIComponent(workspaceState.activeId)}/passport`
                      : '/api/passport'
                  }
                  onOpenTerminal={() => void openTerminal()}
                  onOpenFolder={() => void openFolder()}
                  onOpenEditor={() => void openEditor()}
                  onViewPackage={() => void viewPackageJson()}
                  onInstall={() => void installDependencies()}
                  onLaunch={() => void launchProject()}
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
                  pinned={pinned}
                  now={now}
                  onRun={runScript}
                  onStop={stopProcess}
                  onRestart={restartScript}
                  onSelect={setSelectedScript}
                  onTogglePin={togglePin}
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
          ) : activeView === 'onboarding' ? (
            <OnboardingView
              plan={projectState.onboarding}
              project={projectState.project}
              onRunStep={(step) => void runOnboardingStep(step)}
              onRefresh={refreshProject}
            />
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
              dockerBusy={dockerBusy}
              dockerLogs={dockerLogs}
              dockerError={dockerError}
              onStartDockerService={(service) => changeDockerService(service, 'start')}
              onStopDockerService={(service) => changeDockerService(service, 'stop')}
              onLoadDockerLogs={loadDockerLogs}
              onRefresh={refreshProject}
              onSettingsChange={setSettings}
              onSetEnv={setEnvKeyValue}
              onFreePort={freeBusyPort}
              onScanCommonPorts={scanCommonPorts}
              onJumpToLogs={jumpToLogs}
              onStopAll={stopAllProcesses}
              logsPrefill={logsPrefill}
              history={projectState.history}
              themePreference={themePreference}
              onThemeChange={setThemePreference}
              workspaceId={workspaceState.activeId}
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
        dockerBusy={dockerBusy}
        dockerLogs={dockerLogs}
        dockerError={dockerError}
        onStartDockerService={(service) => changeDockerService(service, 'start')}
        onStopDockerService={(service) => changeDockerService(service, 'stop')}
        onLoadDockerLogs={loadDockerLogs}
        onClose={() => setDrawer(null)}
        onSettingsChange={setSettings}
        themePreference={themePreference}
        onThemeChange={setThemePreference}
      />
      {paletteOpen ? (
        <CommandPalette
          items={(() => {
            const recents = readPaletteRecents();
            const rank = (id: string): number => {
              const index = recents.indexOf(id);
              return index === -1 ? Number.MAX_SAFE_INTEGER : index;
            };
            return [...paletteItems]
              .sort((left, right) => rank(left.id) - rank(right.id))
              .map((item) => ({
                ...item,
                action: () => {
                  recordPaletteRecent(item.id);
                  item.action();
                }
              }));
          })()}
          onClose={() => setPaletteOpen(false)}
        />
      ) : null}
      {shortcutsOpen ? <ShortcutsHelp onClose={() => setShortcutsOpen(false)} /> : null}
      {toasts.length > 0 ? (
        <div className="toast-stack" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <div className="toast" key={toast.id}>
              {toast.message}
            </div>
          ))}
        </div>
      ) : null}
    </main>
  );
}
