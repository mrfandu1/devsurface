export type Severity = 'error' | 'warning' | 'info';
export type ProjectLanguage = 'node' | 'python' | 'go' | 'java';

export interface EnvKeyStatus {
  key: string;
  present: boolean;
  empty: boolean;
}

export interface ScanResult {
  root: string;
  projectName: string;
  packageJson: {
    path: string;
    data: {
      name?: string;
      version?: string;
      description?: string;
      scripts?: Record<string, string>;
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      engines?: Record<string, string>;
    };
  } | null;
  packageManager: 'npm' | 'pnpm' | 'yarn' | 'bun' | null;
  language: {
    primary: ProjectLanguage | null;
    detected: ProjectLanguage[];
    files: string[];
  };
  scripts: Record<string, string>;
  env: {
    hasExample: boolean;
    hasLocal: boolean;
    exampleKeys: string[];
    localKeys: string[];
    missingKeys: string[];
    emptyKeys: string[];
    keys: EnvKeyStatus[];
  } | null;
  docker: {
    composeFiles: string[];
    services: Array<{
      name: string;
      status: 'running' | 'stopped' | 'error' | 'unknown';
      statusDetail: string | null;
      containerId: string | null;
    }>;
    dockerRunning: boolean | null;
    daemonStatus: 'running' | 'stopped' | 'not-installed' | 'unknown';
    message: string | null;
  } | null;
  git: {
    branch: string | null;
  } | null;
  framework: {
    type: string;
    detected: string[];
  } | null;
  presets: Array<{
    name: string;
    label: string;
    commands: Record<string, string>;
    groups: Record<string, string[]>;
    ports: number[];
  }>;
  presetCommands: Record<string, string>;
  presetGroups: Record<string, string[]>;
  ports: Array<{
    port: number;
    inUse: boolean;
    owner?: { pid: number; name: string | null } | null;
  }>;
  readme: {
    exists: boolean;
  };
  license: {
    exists: boolean;
  };
  config: {
    config: {
      description?: string;
      commands?: Record<string, string>;
      groups?: Record<string, string[]>;
      ports?: number[];
      setupGuide?: Array<
        string | { title: string; description?: string; command?: string; script?: string }
      >;
      docs?: string;
    };
    warnings: string[];
  } | null;
}

export type OnboardingStepStatus = 'done' | 'todo' | 'manual';

export type OnboardingActionKind =
  | 'install'
  | 'env-copy'
  | 'run-script'
  | 'run-command'
  | 'docker'
  | 'open-docs';

export interface OnboardingAction {
  kind: OnboardingActionKind;
  label: string;
  target?: string;
}

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  status: OnboardingStepStatus;
  blocking: boolean;
  action?: OnboardingAction;
}

export interface OnboardingPlan {
  steps: OnboardingStep[];
  readiness: number;
  ready: boolean;
  summary: string;
}

export interface DoctorWarning {
  id: string;
  severity: Severity;
  title: string;
  message: string;
}

export interface ManagedProcessSnapshot {
  pid: string;
  script: string;
  command: string;
  status: 'running' | 'exited' | 'failed' | 'stopped';
  startedAt: string;
  endedAt: string | null;
  exitCode: number | null;
}

export interface ProcessLogEvent {
  pid: string;
  script: string;
  stream: 'stdout' | 'stderr' | 'system';
  message: string;
  timestamp: string;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  runningProcesses: number;
}
