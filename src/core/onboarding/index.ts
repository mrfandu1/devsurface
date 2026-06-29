import { isSafeHttpUrl } from '../security/url.js';
import type {
  DoctorWarning,
  OnboardingAction,
  OnboardingPlan,
  OnboardingStep,
  ScanResult,
  SetupGuideStep
} from '../types.js';

function hasWarning(warnings: DoctorWarning[], id: string): boolean {
  return warnings.some((warning) => warning.id === id);
}

/**
 * Pick the command that starts the project's dev server, preferring a real
 * package script, then a configured/preset command named "dev".
 */
function pickStartAction(scan: ScanResult): OnboardingAction | null {
  if (scan.scripts.dev !== undefined) {
    return { kind: 'run-script', label: 'Start dev server', target: 'dev' };
  }
  if (scan.scripts.start !== undefined) {
    return { kind: 'run-script', label: 'Start app', target: 'start' };
  }

  const configuredCommands = {
    ...scan.presetCommands,
    ...scan.config?.config.commands
  };
  for (const name of ['dev', 'start', 'serve']) {
    if (configuredCommands[name] !== undefined) {
      return { kind: 'run-command', label: `Run ${name}`, target: name };
    }
  }

  return null;
}

function dockerStep(scan: ScanResult): OnboardingStep | null {
  const docker = scan.docker;
  if (docker === null) {
    return null;
  }

  const runningServices = docker.services.filter((service) => service.status === 'running');
  const allRunning =
    docker.services.length > 0 && runningServices.length === docker.services.length;

  if (docker.daemonStatus !== 'running') {
    return {
      id: 'docker-start',
      title: 'Start Docker services',
      description:
        docker.message ?? 'A Docker Compose file was found, but the Docker engine is not running.',
      status: 'manual',
      blocking: false,
      action: { kind: 'docker', label: 'Open Services' }
    };
  }

  if (docker.services.length === 0 || allRunning) {
    return {
      id: 'docker-start',
      title: 'Start Docker services',
      description:
        docker.services.length === 0
          ? 'Docker is running. No Compose services need to be started.'
          : 'All Docker Compose services are running.',
      status: 'done',
      blocking: false
    };
  }

  return {
    id: 'docker-start',
    title: 'Start Docker services',
    description: `${runningServices.length}/${docker.services.length} Compose services running. Start the rest in Services.`,
    status: 'todo',
    blocking: false,
    action: { kind: 'docker', label: 'Open Services' }
  };
}

/**
 * Build an ordered onboarding checklist from a scan result and its doctor
 * warnings. Each step is either already satisfied (`done`), resolvable with a
 * one-click action (`todo`), or needs the contributor to act outside DevSurface
 * (`manual`). Readiness reflects only the blocking steps so a project can reach
 * 100% once it is genuinely runnable.
 */
export function buildOnboardingPlan(scan: ScanResult, warnings: DoctorWarning[]): OnboardingPlan {
  const steps: OnboardingStep[] = [];
  const isNodeProject = scan.language.detected.includes('node');

  // 1. Install dependencies (Node projects only).
  if (isNodeProject && scan.packageJson !== null) {
    const needsInstall = hasWarning(warnings, 'missing-node-modules');
    steps.push({
      id: 'install-dependencies',
      title: 'Install dependencies',
      description: needsInstall
        ? 'node_modules is missing. Install dependencies before running scripts.'
        : 'Dependencies are installed.',
      status: needsInstall ? 'todo' : 'done',
      blocking: true,
      action: needsInstall ? { kind: 'install', label: 'Install' } : undefined
    });
  }

  // 2. Create the local .env file from the example.
  if (scan.env?.hasExample) {
    const missingLocal = !scan.env.hasLocal;
    steps.push({
      id: 'create-env',
      title: 'Create .env file',
      description: missingLocal
        ? '.env.example exists but the local .env file is missing.'
        : '.env is present.',
      status: missingLocal ? 'todo' : 'done',
      blocking: true,
      action: missingLocal ? { kind: 'env-copy', label: 'Copy .env' } : undefined
    });

    // 3. Fill required env values (only meaningful once .env exists).
    if (scan.env.hasLocal) {
      const unset = [...new Set([...scan.env.missingKeys, ...scan.env.emptyKeys])];
      steps.push({
        id: 'fill-env',
        title: 'Fill in environment values',
        description:
          unset.length > 0
            ? `Set values for: ${unset.join(', ')}. Values are intentionally hidden.`
            : 'All environment keys from the example are present.',
        status: unset.length > 0 ? 'manual' : 'done',
        blocking: true
      });
    }
  }

  // 4. Docker services.
  const docker = dockerStep(scan);
  if (docker !== null) {
    steps.push(docker);
  }

  // 5. Free conflicting ports (informational guidance).
  const portsInUse = scan.ports.filter((probe) => probe.inUse);
  if (portsInUse.length > 0) {
    steps.push({
      id: 'free-ports',
      title: 'Resolve port conflicts',
      description: `Already in use: ${portsInUse.map((probe) => probe.port).join(', ')}. Stop the conflicting process or change the port.`,
      status: 'manual',
      blocking: false
    });
  }

  // 6. Maintainer-authored setup guide steps (non-blocking guidance).
  const allCommands = { ...scan.presetCommands, ...(scan.config?.config.commands ?? {}) };
  for (const [index, entry] of (scan.config?.config.setupGuide ?? []).entries()) {
    if (typeof entry === 'string') {
      steps.push({
        id: `guide-${index}`,
        title: entry,
        description: 'From the project setup guide.',
        status: 'manual',
        blocking: false
      });
    } else {
      const step = entry as SetupGuideStep;
      let action: OnboardingAction | undefined;
      if (step.command !== undefined && step.command in allCommands) {
        action = { kind: 'run-command', label: 'Run', target: step.command };
      } else if (step.script !== undefined) {
        action = { kind: 'run-script', label: 'Run', target: step.script };
      }
      steps.push({
        id: `guide-${index}`,
        title: step.title,
        description: step.description ?? 'From the project setup guide.',
        status: action !== undefined ? 'todo' : 'manual',
        blocking: false,
        action
      });
    }
  }

  // 7. Project docs link.
  const docs = scan.config?.config.docs;
  if (typeof docs === 'string' && docs.length > 0 && isSafeHttpUrl(docs)) {
    steps.push({
      id: 'read-docs',
      title: 'Read the project docs',
      description: docs,
      status: 'manual',
      blocking: false,
      action: { kind: 'open-docs', label: 'Open docs', target: docs }
    });
  }

  // 8. Start the app (the goal — never blocking).
  const startAction = pickStartAction(scan);
  if (startAction !== null) {
    steps.push({
      id: 'start-app',
      title: 'Start the app',
      description: 'Run the development server once setup is complete.',
      status: 'todo',
      blocking: false,
      action: startAction
    });
  }

  const blocking = steps.filter((step) => step.blocking);
  const blockingDone = blocking.filter((step) => step.status === 'done');
  const readiness =
    blocking.length === 0 ? 100 : Math.round((blockingDone.length / blocking.length) * 100);
  const ready = readiness === 100;
  const remaining = blocking.length - blockingDone.length;
  const summary = ready
    ? 'Project is ready to run.'
    : `${remaining} setup step${remaining === 1 ? '' : 's'} remaining before the project is ready.`;

  return { steps, readiness, ready, summary };
}
