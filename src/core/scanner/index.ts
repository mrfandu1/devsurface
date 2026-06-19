import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilePresence, ScanResult } from '../types.js';
import { loadConfig } from '../config/load.js';
import { detectDocker } from './docker.js';
import { detectEnv } from './env.js';
import { detectFramework } from './framework.js';
import { detectGit } from './git.js';
import { detectPackageManager } from './packageManager.js';
import { readPackageJson } from './packageJson.js';
import { defaultPortsForFramework, detectPorts, inferPortsFromScripts } from './ports.js';
import { extractScripts } from './scripts.js';

async function findFirstFile(root: string, candidates: string[]): Promise<FilePresence> {
  for (const candidate of candidates) {
    const filePath = path.join(root, candidate);
    try {
      const stat = await fs.stat(filePath);
      if (stat.isFile()) {
        return { path: filePath, exists: true };
      }
    } catch {
      // Keep looking through the candidate list.
    }
  }

  return { path: null, exists: false };
}

function configuredPorts(configPorts: number[] | undefined): number[] {
  return Array.isArray(configPorts) ? configPorts : [];
}

export async function scanProject(root = process.cwd()): Promise<ScanResult> {
  const config = await loadConfig(root);
  const packageJson = await readPackageJson(root);
  const scripts = extractScripts(packageJson) ?? {};
  const framework = detectFramework(packageJson);
  const portsToProbe = [
    ...configuredPorts(config?.config.ports),
    ...inferPortsFromScripts(scripts),
    ...defaultPortsForFramework(framework)
  ];

  const [packageManager, env, docker, git, ports, readme, license] = await Promise.all([
    detectPackageManager(root),
    detectEnv(root, config?.config),
    detectDocker(root),
    detectGit(root),
    detectPorts(portsToProbe),
    findFirstFile(root, ['README.md', 'README']),
    findFirstFile(root, ['LICENSE', 'LICENSE.md', 'COPYING'])
  ]);

  return {
    root,
    projectName: config?.config.name ?? packageJson?.data.name ?? path.basename(root),
    packageJson,
    packageManager: packageManager ?? (packageJson ? 'npm' : null),
    scripts,
    env,
    docker,
    git,
    framework,
    ports: ports ?? [],
    readme,
    license,
    config
  };
}
