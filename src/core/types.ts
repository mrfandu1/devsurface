export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';

export type WarningSeverity = 'error' | 'warning' | 'info';

export interface PackageJsonData {
  name?: string;
  version?: string;
  description?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface PackageJsonInfo {
  path: string;
  data: PackageJsonData;
}

export interface EnvKeyStatus {
  key: string;
  present: boolean;
  empty: boolean;
}

export interface EnvInfo {
  examplePath: string | null;
  localPath: string | null;
  hasExample: boolean;
  hasLocal: boolean;
  exampleKeys: string[];
  localKeys: string[];
  missingKeys: string[];
  emptyKeys: string[];
  keys: EnvKeyStatus[];
}

export interface DockerInfo {
  composeFiles: string[];
  services: DockerServiceInfo[];
  dockerRunning: boolean | null;
  daemonStatus: DockerDaemonStatus;
  message: string | null;
}

export type DockerDaemonStatus = 'running' | 'stopped' | 'not-installed' | 'unknown';
export type DockerServiceStatus = 'running' | 'stopped' | 'error' | 'unknown';

export interface DockerServiceInfo {
  name: string;
  status: DockerServiceStatus;
  statusDetail: string | null;
  containerId: string | null;
}

export interface GitInfo {
  root: string;
  branch: string | null;
}

export interface FrameworkInfo {
  type: string;
  detected: string[];
}

export interface FilePresence {
  path: string | null;
  exists: boolean;
}

export interface PortProbe {
  port: number;
  inUse: boolean;
}

export interface DevSurfaceConfig {
  name?: string;
  description?: string;
  commands?: Record<string, string>;
  groups?: Record<string, string[]>;
  ports?: number[];
  env?: {
    example?: string;
    local?: string;
  };
  services?: {
    docker?: boolean;
  };
  docs?: string;
}

export interface ConfigLoadResult {
  path: string;
  config: DevSurfaceConfig;
  warnings: string[];
}

export interface ScanResult {
  root: string;
  projectName: string;
  packageJson: PackageJsonInfo | null;
  packageManager: PackageManager | null;
  scripts: Record<string, string>;
  env: EnvInfo | null;
  docker: DockerInfo | null;
  git: GitInfo | null;
  framework: FrameworkInfo | null;
  ports: PortProbe[];
  readme: FilePresence;
  license: FilePresence;
  config: ConfigLoadResult | null;
}

export interface DoctorWarning {
  id: string;
  severity: WarningSeverity;
  title: string;
  message: string;
  target?: string;
}

export interface ProcessLogEvent {
  pid: string;
  script: string;
  stream: 'stdout' | 'stderr' | 'system';
  message: string;
  timestamp: string;
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
