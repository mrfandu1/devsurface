export type Severity = 'error' | 'warning' | 'info';
export type ProjectLanguage = 'node' | 'python' | 'go' | 'java' | 'rust' | 'php' | 'ruby';

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
    extraKeys?: string[];
    keys: EnvKeyStatus[];
    additionalFiles?: string[];
    descriptions?: Record<string, string>;
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
    baseImage?: string | null;
    servicePorts?: Array<{ service: string; hostPorts: number[] }>;
  } | null;
  git: {
    branch: string | null;
    dirtyFiles?: number | null;
    ahead?: number | null;
    behind?: number | null;
    commitCount?: number | null;
    latestTag?: string | null;
    lastCommit?: {
      hash: string;
      author: string;
      date: string;
      subject: string;
    } | null;
    remoteUrl?: string | null;
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
    suggestedFreePort?: number | null;
  }>;
  readme: {
    exists: boolean;
  };
  license: {
    exists: boolean;
  };
  monorepo?: {
    tools: string[];
    packageGlobs: string[];
    packages: Array<{ name: string; dir: string; scriptCount?: number }>;
    packageCount: number;
  } | null;
  toolchain?: {
    testRunner: string | null;
    linter: string | null;
    formatter: string | null;
    bundler: string | null;
    orm: string | null;
    styling: string | null;
    ci: string | null;
    typescript?: string | null;
    gitHooks?: string | null;
  };
  nodeRequirement?: string | null;
  readmeCommands?: string[];
  licenseType?: string | null;
  changelog?: { exists: boolean; latestVersion: string | null };
  community?: { contributing: boolean; codeOfConduct: boolean };
  vscodeExtensions?: string[];
  testFileCount?: number;
  bins?: string[];
  moduleType?: 'module' | 'commonjs' | null;
  homepage?: string | null;
  dependencies?: {
    runtimeCount: number;
    devCount: number;
    lockfile: string | null;
    lockfileStale: boolean;
  } | null;
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
  missing?: boolean;
}

export interface RunHistoryEntry {
  script: string;
  command: string;
  status: 'exited' | 'failed' | 'stopped';
  exitCode: number | null;
  startedAt: string;
  endedAt: string;
  durationMs: number;
}
