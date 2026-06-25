import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilePresence, ScanResult } from '../types.js';
import { loadConfig } from '../config/load.js';
import { detectDocker } from './docker.js';
import { detectEnv } from './env.js';
import { detectFramework } from './framework.js';
import { detectGit } from './git.js';
import { detectProjectLanguage } from './language.js';
import { detectPackageManager } from './packageManager.js';
import { readPackageJson } from './packageJson.js';
import { defaultPortsForFramework, detectPorts, inferPortsFromScripts } from './ports.js';
import { detectPresets, mergePresetCommands, mergePresetGroups } from './presets.js';
import { extractScripts } from './scripts.js';

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function findFirstFile(root: string, candidates: string[]): Promise<FilePresence> {
  const resolvedRoot = await fs.realpath(root).catch(() => path.resolve(root));

  for (const candidate of candidates) {
    const filePath = path.join(root, candidate);
    try {
      const [stat, realPath] = await Promise.all([fs.stat(filePath), fs.realpath(filePath)]);
      if (stat.isFile() && isWithinRoot(resolvedRoot, realPath)) {
        return { path: realPath, exists: true };
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
  const resolvedRoot = await fs.realpath(root).catch(() => path.resolve(root));
  const config = await loadConfig(resolvedRoot);
  const packageJson = await readPackageJson(resolvedRoot);
  const scripts = extractScripts(packageJson) ?? {};
  const framework = detectFramework(packageJson);
  const language = await detectProjectLanguage(resolvedRoot, packageJson);
  const presets = await detectPresets({
    root: resolvedRoot,
    packageJson,
    framework,
    language
  });
  const presetCommands = mergePresetCommands(presets);
  const presetGroups = mergePresetGroups(presets);
  const portsToProbe = [
    ...configuredPorts(config?.config.ports),
    ...inferPortsFromScripts(scripts),
    ...defaultPortsForFramework(framework),
    ...presets.flatMap((preset) => preset.ports)
  ];

  const [packageManager, env, docker, git, ports, readme, license] = await Promise.all([
    detectPackageManager(resolvedRoot),
    detectEnv(resolvedRoot, config?.config),
    detectDocker(resolvedRoot),
    detectGit(resolvedRoot),
    detectPorts(portsToProbe),
    findFirstFile(resolvedRoot, ['README.md', 'README']),
    findFirstFile(resolvedRoot, ['LICENSE', 'LICENSE.md', 'COPYING'])
  ]);

  return {
    root: resolvedRoot,
    projectName: config?.config.name ?? packageJson?.data.name ?? path.basename(resolvedRoot),
    packageJson,
    packageManager: packageManager ?? (packageJson ? 'npm' : null),
    language,
    scripts,
    env,
    docker,
    git,
    framework,
    presets,
    presetCommands,
    presetGroups,
    ports: ports ?? [],
    readme,
    license,
    config
  };
}
