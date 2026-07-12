/**
 * A numbered, plain-English "first run" recipe generated from the scan.
 *
 * Where onboarding tracks readiness state, quickstart is a printable recipe:
 * exactly which commands to type, in order, with a sentence explaining why
 * each step exists. Steps a project does not need are simply omitted.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ScanResult } from '../types.js';

export interface QuickstartStep {
  id: string;
  title: string;
  /** Why this step exists, in one friendly sentence. */
  why: string;
  /** Exact command to type, when the step is a command. */
  command?: string;
  /** True when the scan shows the step is already satisfied. */
  done?: boolean;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function installCommand(scan: ScanResult): string {
  switch (scan.packageManager) {
    case 'pnpm':
      return 'pnpm install';
    case 'yarn':
      return 'yarn';
    case 'bun':
      return 'bun install';
    default:
      return 'npm install';
  }
}

function runCommand(scan: ScanResult, script: string): string {
  switch (scan.packageManager) {
    case 'pnpm':
      return `pnpm ${script}`;
    case 'yarn':
      return `yarn ${script}`;
    case 'bun':
      return `bun run ${script}`;
    default:
      return `npm run ${script}`;
  }
}

/** Build the ordered quickstart recipe for a scanned project. */
export async function buildQuickstart(scan: ScanResult): Promise<QuickstartStep[]> {
  const steps: QuickstartStep[] = [];
  const isNodeProject = scan.language.detected.includes('node');

  if (scan.nodeRequirement != null) {
    steps.push({
      id: 'node-version',
      title: `Make sure Node.js ${scan.nodeRequirement} is installed`,
      why: 'The project was built against this version; a different one can cause confusing errors.',
      command: 'node --version'
    });
  }

  if (isNodeProject && scan.packageJson !== null) {
    const installed = await pathExists(path.join(scan.root, 'node_modules'));
    steps.push({
      id: 'install',
      title: 'Install the project’s packages',
      why: 'Downloads every library the code depends on. Nothing works before this step.',
      command: installCommand(scan),
      done: installed
    });
  }

  if (scan.env?.hasExample === true) {
    steps.push({
      id: 'env-copy',
      title: 'Create your local settings file',
      why: 'The app reads its settings (and secrets) from .env. The example file lists which keys you need.',
      command:
        process.platform === 'win32'
          ? `copy ${path.basename(scan.env.examplePath ?? '.env.example')} .env`
          : `cp ${path.basename(scan.env.examplePath ?? '.env.example')} .env`,
      done: scan.env.hasLocal
    });
    if (scan.env.exampleKeys.length > 0) {
      steps.push({
        id: 'env-fill',
        title: `Fill in the ${scan.env.exampleKeys.length} settings inside .env`,
        why: 'Open .env in any text editor and give each KEY a value. Ask a teammate for values you do not know — never guess secrets.',
        done:
          scan.env.hasLocal && scan.env.missingKeys.length === 0 && scan.env.emptyKeys.length === 0
      });
    }
  }

  if ((scan.docker?.composeFiles.length ?? 0) > 0) {
    steps.push({
      id: 'docker-up',
      title: 'Start the supporting services with Docker',
      why: 'Databases and other helpers run in containers. The app cannot connect to them until they are up.',
      command: 'docker compose up -d',
      done: scan.docker?.services.some((service) => service.status === 'running') === true
    });
  }

  const migrate = Object.keys(scan.scripts).find(
    (name) => name === 'migrate' || name.startsWith('db:migrate') || name === 'db:push'
  );
  if (migrate !== undefined) {
    steps.push({
      id: 'migrate',
      title: 'Prepare the database',
      why: 'Applies the project’s database structure so the app finds the tables it expects.',
      command: runCommand(scan, migrate)
    });
  }

  const dev = ['dev', 'start', 'serve'].find((name) => scan.scripts[name] !== undefined);
  if (dev !== undefined) {
    steps.push({
      id: 'dev',
      title: 'Start the app',
      why: 'Runs the development server. Leave this window open — Ctrl+C stops it when you are done.',
      command: runCommand(scan, dev)
    });
  }

  const firstPort = scan.ports[0]?.port;
  if (dev !== undefined && firstPort !== undefined) {
    steps.push({
      id: 'open-browser',
      title: `Open the app in your browser`,
      why: `Once the previous step says it is ready, the app is served on your own machine at this address.`,
      command: `http://localhost:${firstPort}`
    });
  }

  if (steps.length === 0) {
    steps.push({
      id: 'read-readme',
      title: 'Read the README',
      why: 'This project has no detectable install or start commands, so the README is the best guide to how it runs.'
    });
  }

  return steps;
}
