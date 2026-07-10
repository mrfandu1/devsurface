export type PackageManager = 'npm' | 'pnpm' | 'yarn' | 'bun';
export type ProjectLanguage = 'node' | 'python' | 'go' | 'java' | 'rust' | 'php' | 'ruby';

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
  engines?: Record<string, string>;
  packageManager?: string;
  workspaces?: string[] | { packages?: string[] };
  bin?: string | Record<string, string>;
  type?: string;
  homepage?: string;
  repository?: string | { url?: string };
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
  /** Keys present in .env but absent from .env.example (undocumented settings). */
  extraKeys: string[];
  keys: EnvKeyStatus[];
  /** Extra env files found at the root (.env.local, .env.development, …). */
  additionalFiles?: string[];
  /** Human descriptions harvested from comment lines above keys in the example. */
  descriptions?: Record<string, string>;
}

export interface ComposeServicePorts {
  service: string;
  /** Host-side published ports from the Compose file. */
  hostPorts: number[];
}

export interface DockerInfo {
  composeFiles: string[];
  services: DockerServiceInfo[];
  dockerRunning: boolean | null;
  daemonStatus: DockerDaemonStatus;
  message: string | null;
  /** Base image of the root Dockerfile ("node:20-alpine"), when one exists. */
  baseImage?: string | null;
  /** Published ports per compose service, parsed from the Compose files. */
  servicePorts?: ComposeServicePorts[];
}

export type DockerDaemonStatus = 'running' | 'stopped' | 'not-installed' | 'unknown';
export type DockerServiceStatus = 'running' | 'stopped' | 'error' | 'unknown';

export interface DockerServiceInfo {
  name: string;
  status: DockerServiceStatus;
  statusDetail: string | null;
  containerId: string | null;
}

export interface GitCommitInfo {
  hash: string;
  author: string;
  /** ISO timestamp of the commit. */
  date: string;
  subject: string;
}

export interface GitInfo {
  root: string;
  branch: string | null;
  /** Number of changed/untracked files, or null when the git CLI is unavailable. */
  dirtyFiles?: number | null;
  /** Commits ahead of the upstream branch, or null when there is no upstream. */
  ahead?: number | null;
  /** Commits behind the upstream branch, or null when there is no upstream. */
  behind?: number | null;
  /** Most recent commit, or null when the git CLI is unavailable. */
  lastCommit?: GitCommitInfo | null;
  /** Remote origin URL with any embedded credentials removed. */
  remoteUrl?: string | null;
  /** Total commits on the current branch, or null when the git CLI is unavailable. */
  commitCount?: number | null;
  /** Most recent tag reachable from HEAD, or null when there is none. */
  latestTag?: string | null;
  /** The remote's default branch (from origin/HEAD), or null when unknown. */
  defaultBranch?: string | null;
}

export interface FrameworkInfo {
  type: string;
  detected: string[];
}

export interface ProjectLanguageInfo {
  primary: ProjectLanguage | null;
  detected: ProjectLanguage[];
  files: string[];
}

export interface PresetInfo {
  name: string;
  label: string;
  commands: Record<string, string>;
  groups: Record<string, string[]>;
  ports: number[];
}

export interface FilePresence {
  path: string | null;
  exists: boolean;
}

export interface WorkspacePackageInfo {
  /** Package name from its package.json, or the directory name as a fallback. */
  name: string;
  /** Directory relative to the repo root, using forward slashes. */
  dir: string;
  /** Number of package.json scripts the member defines. */
  scriptCount?: number;
}

export interface MonorepoInfo {
  /** Workspace/monorepo tooling detected, e.g. "npm workspaces", "Turborepo". */
  tools: string[];
  /** Raw workspace globs from package.json / pnpm-workspace.yaml. */
  packageGlobs: string[];
  /** Member packages resolved from the globs (capped). */
  packages: WorkspacePackageInfo[];
  /** Total member packages found, even beyond the cap. */
  packageCount: number;
}

export interface ToolchainInfo {
  /** e.g. "Vitest", "Jest" — null when none detected. */
  testRunner: string | null;
  linter: string | null;
  formatter: string | null;
  bundler: string | null;
  orm: string | null;
  styling: string | null;
  /** CI provider detected from config files, e.g. "GitHub Actions". */
  ci: string | null;
  /** TypeScript version range from devDependencies, e.g. "^5.6.0". */
  typescript?: string | null;
  /** Git-hook manager, e.g. "Husky", "lefthook", "pre-commit". */
  gitHooks?: string | null;
  /** End-to-end test runner (kept separate from the unit test runner). */
  e2eRunner?: string | null;
}

export interface DependencyInfo {
  /** Number of production dependencies in package.json. */
  runtimeCount: number;
  /** Number of devDependencies in package.json. */
  devCount: number;
  /** Lockfile filename that pairs with the detected package manager, if present. */
  lockfile: string | null;
  /**
   * True when package.json was modified after the lockfile, which usually
   * means dependencies changed but the lockfile was never regenerated.
   */
  lockfileStale: boolean;
  /** Exact manager version pinned via the packageManager field ("pnpm@9.1.0"). */
  pinnedManagerVersion?: string | null;
}

export interface PortOwner {
  pid: number;
  name: string | null;
}

export interface PortProbe {
  port: number;
  inUse: boolean;
  /** Process listening on the port, when it can be identified. */
  owner?: PortOwner | null;
  /** Next free port after this one, filled in when the port is busy. */
  suggestedFreePort?: number | null;
}

export interface SetupGuideStep {
  title: string;
  description?: string;
  /** Key in config.commands — generates a run-command action button. */
  command?: string;
  /** package.json script name — generates a run-script action button. */
  script?: string;
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
  setupGuide?: Array<string | SetupGuideStep>;
  docs?: string;
  /**
   * Ordered launch sequence: "docker" starts Compose services, any other
   * entry names a package script or configured command.
   */
  launch?: string[];
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
  language: ProjectLanguageInfo;
  scripts: Record<string, string>;
  env: EnvInfo | null;
  docker: DockerInfo | null;
  git: GitInfo | null;
  framework: FrameworkInfo | null;
  presets: PresetInfo[];
  presetCommands: Record<string, string>;
  presetGroups: Record<string, string[]>;
  ports: PortProbe[];
  readme: FilePresence;
  license: FilePresence;
  monorepo: MonorepoInfo | null;
  dependencies: DependencyInfo | null;
  toolchain: ToolchainInfo;
  /** Node version the project asks for (engines.node, .nvmrc, or .node-version). */
  nodeRequirement: string | null;
  /** Setup/run commands extracted from fenced code blocks in the README. */
  readmeCommands: string[];
  /** SPDX-ish license name detected from the LICENSE file ("MIT", "Apache-2.0"). */
  licenseType?: string | null;
  /** CHANGELOG.md presence and its most recent version heading. */
  changelog?: { exists: boolean; latestVersion: string | null };
  /** Community/contribution docs found at the repo root. */
  community?: { contributing: boolean; codeOfConduct: boolean };
  /** Recommended VS Code extensions from .vscode/extensions.json. */
  vscodeExtensions?: string[];
  /** Number of test files found in the repo (capped scan). */
  testFileCount?: number;
  /** CLI command names this package provides via its bin field. */
  bins?: string[];
  /** "module" (ESM) or "commonjs", from package.json "type". */
  moduleType?: 'module' | 'commonjs' | null;
  /** Project homepage or repository URL (validated http/https). */
  homepage?: string | null;
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
  /** Script name, configured command name, or URL depending on the action kind. */
  target?: string;
}

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  status: OnboardingStepStatus;
  /** Whether this step gates project readiness (counts toward the readiness score). */
  blocking: boolean;
  action?: OnboardingAction;
}

export interface OnboardingPlan {
  steps: OnboardingStep[];
  /** Percentage (0-100) of blocking steps already satisfied. */
  readiness: number;
  /** True when every blocking step is satisfied. */
  ready: boolean;
  summary: string;
}
