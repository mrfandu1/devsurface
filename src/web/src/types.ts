export type Severity = 'error' | 'warning' | 'info';

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
  ports: Array<{
    port: number;
    inUse: boolean;
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
      docs?: string;
    };
    warnings: string[];
  } | null;
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
