/**
 * The slice of a scan the launch planner needs. Structural, so both the core
 * ScanResult and the dashboard's mirrored type satisfy it.
 */
export interface LaunchScanSubset {
  scripts: Record<string, string>;
  presetCommands: Record<string, string>;
  docker: { composeFiles: string[] } | null;
  config: {
    config: { launch?: string[]; commands?: Record<string, string> };
  } | null;
}

export type LaunchStep =
  | { kind: 'docker' }
  | { kind: 'script'; name: string }
  | { kind: 'command'; name: string; command: string };

export interface LaunchPlan {
  steps: LaunchStep[];
  /** Entries from config.launch that matched nothing runnable. */
  unknown: string[];
  /** True when the plan came from config.launch rather than detection. */
  fromConfig: boolean;
}

/**
 * Resolve the launch sequence for a project. A configured `launch` array wins;
 * otherwise a sensible default is derived: Compose services first, then the
 * dev (or start) script.
 */
export function resolveLaunchPlan(scan: LaunchScanSubset): LaunchPlan {
  const configured = scan.config?.config.launch;
  const allCommands = { ...scan.presetCommands, ...(scan.config?.config.commands ?? {}) };

  if (configured !== undefined && configured.length > 0) {
    const steps: LaunchStep[] = [];
    const unknown: string[] = [];
    for (const entry of configured) {
      if (entry === 'docker' || entry === 'docker:up') {
        if (scan.docker !== null && scan.docker.composeFiles.length > 0) {
          steps.push({ kind: 'docker' });
        }
      } else if (scan.scripts[entry] !== undefined) {
        steps.push({ kind: 'script', name: entry });
      } else if (allCommands[entry] !== undefined) {
        steps.push({ kind: 'command', name: entry, command: allCommands[entry] });
      } else {
        unknown.push(entry);
      }
    }
    return { steps, unknown, fromConfig: true };
  }

  const steps: LaunchStep[] = [];
  if (scan.docker !== null && scan.docker.composeFiles.length > 0) {
    steps.push({ kind: 'docker' });
  }
  if (scan.scripts.dev !== undefined) {
    steps.push({ kind: 'script', name: 'dev' });
  } else if (scan.scripts.start !== undefined) {
    steps.push({ kind: 'script', name: 'start' });
  }
  return { steps, unknown: [], fromConfig: false };
}

/** Human-readable line for one step ("start Docker services", "run dev"). */
export function describeLaunchStep(step: LaunchStep): string {
  if (step.kind === 'docker') {
    return 'start Docker Compose services (docker compose up -d)';
  }
  if (step.kind === 'script') {
    return `run the "${step.name}" script`;
  }
  return `run the "${step.name}" command (${step.command})`;
}
