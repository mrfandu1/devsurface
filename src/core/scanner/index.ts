import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FilePresence, ScanResult } from '../types.js';
import { loadConfig } from '../config/load.js';
import { detectDependencies } from './dependencies.js';
import { detectDocker } from './docker.js';
import { detectEnv } from './env.js';
import { detectMonorepo } from './monorepo.js';
import { detectFramework } from './framework.js';
import { detectGit } from './git.js';
import { detectProjectLanguage } from './language.js';
import { detectPackageManager } from './packageManager.js';
import { readPackageJson } from './packageJson.js';
import {
  defaultPortsForFramework,
  detectPorts,
  findFreePort,
  inferPortsFromScripts
} from './ports.js';
import { findPortOwners } from './portOwner.js';
import { detectPresets, mergePresetCommands, mergePresetGroups } from './presets.js';
import { extractScripts } from './scripts.js';
import { detectNodeRequirement, detectToolchain } from './toolchain.js';
import { extractReadmeCommands } from '../documentation.js';
import { parseComposePorts, parseDockerfileBaseImage } from '../docker/composeMeta.js';
import {
  countTestFiles,
  detectChangelog,
  detectCommunityFiles,
  detectLicenseType,
  detectVscodeExtensions
} from './projectMeta.js';

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

  const [packageManager, env, docker, git, ports, readme, license, monorepo] = await Promise.all([
    detectPackageManager(resolvedRoot),
    detectEnv(resolvedRoot, config?.config),
    detectDocker(resolvedRoot),
    detectGit(resolvedRoot),
    detectPorts(portsToProbe),
    findFirstFile(resolvedRoot, ['README.md', 'README']),
    findFirstFile(resolvedRoot, ['LICENSE', 'LICENSE.md', 'COPYING']),
    detectMonorepo(resolvedRoot, packageJson)
  ]);

  const resolvedPackageManager = packageManager ?? (packageJson ? 'npm' : null);
  const [dependencies, toolchain, nodeRequirement] = await Promise.all([
    detectDependencies(resolvedRoot, packageJson, resolvedPackageManager),
    detectToolchain(resolvedRoot, packageJson),
    detectNodeRequirement(resolvedRoot, packageJson)
  ]);

  let readmeCommands: string[] = [];
  if (readme.exists && readme.path !== null) {
    try {
      const content = await fs.readFile(readme.path, 'utf8');
      readmeCommands = extractReadmeCommands(content.slice(0, 64 * 1024));
    } catch {
      // No README content — commands stay empty.
    }
  }

  let licenseType: string | null = null;
  if (license.exists && license.path !== null) {
    try {
      licenseType = detectLicenseType(await fs.readFile(license.path, 'utf8'));
    } catch {
      // License file unreadable — type stays unknown.
    }
  }

  const binField = packageJson?.data.bin;
  const bins =
    typeof binField === 'string'
      ? [packageJson?.data.name ?? path.basename(resolvedRoot)]
      : binField !== undefined && binField !== null
        ? Object.keys(binField)
        : [];
  const moduleType =
    packageJson?.data.type === 'module'
      ? ('module' as const)
      : packageJson?.data.type === 'commonjs'
        ? ('commonjs' as const)
        : packageJson !== null
          ? ('commonjs' as const)
          : null;
  const repositoryField = packageJson?.data.repository;
  const repositoryUrl =
    typeof repositoryField === 'string' ? repositoryField : (repositoryField?.url ?? null);
  const homepageCandidate =
    packageJson?.data.homepage ??
    (repositoryUrl === null ? null : repositoryUrl.replace(/^git\+/, '').replace(/\.git$/, ''));
  const homepage =
    typeof homepageCandidate === 'string' && /^https?:\/\//.test(homepageCandidate)
      ? homepageCandidate
      : null;

  const [changelog, community, vscodeExtensions, testFileCount] = await Promise.all([
    detectChangelog(resolvedRoot),
    detectCommunityFiles(resolvedRoot),
    detectVscodeExtensions(resolvedRoot),
    countTestFiles(resolvedRoot)
  ]);

  const portList = ports ?? [];

  // Compose-published ports and the Dockerfile base image enrich Docker info,
  // and any newly discovered host ports get probed too.
  if (docker !== null) {
    const servicePorts = [];
    for (const composeFile of docker.composeFiles) {
      try {
        servicePorts.push(...parseComposePorts(await fs.readFile(composeFile, 'utf8')));
      } catch {
        // Malformed compose files simply contribute no ports.
      }
    }
    docker.servicePorts = servicePorts;
    try {
      docker.baseImage = parseDockerfileBaseImage(
        await fs.readFile(path.join(resolvedRoot, 'Dockerfile'), 'utf8')
      );
    } catch {
      docker.baseImage = null;
    }

    const probed = new Set(portList.map((probe) => probe.port));
    const extraPorts = servicePorts
      .flatMap((entry) => entry.hostPorts)
      .filter((port) => !probed.has(port));
    if (extraPorts.length > 0) {
      const extraProbes = await detectPorts(extraPorts);
      if (extraProbes !== null) {
        portList.push(...extraProbes);
      }
    }
  }

  // Identify who is squatting on busy ports so conflicts are actionable.
  const busyPorts = portList.filter((probe) => probe.inUse).map((probe) => probe.port);
  if (busyPorts.length > 0) {
    const owners = await findPortOwners(busyPorts);
    for (const probe of portList) {
      if (probe.inUse) {
        probe.owner = owners.get(probe.port) ?? null;
        probe.suggestedFreePort = await findFreePort(probe.port);
      }
    }
  }

  return {
    root: resolvedRoot,
    projectName: config?.config.name ?? packageJson?.data.name ?? path.basename(resolvedRoot),
    packageJson,
    packageManager: resolvedPackageManager,
    language,
    scripts,
    env,
    docker,
    git,
    framework,
    presets,
    presetCommands,
    presetGroups,
    ports: portList,
    readme,
    license,
    monorepo,
    dependencies,
    toolchain,
    nodeRequirement,
    readmeCommands,
    licenseType,
    changelog,
    community,
    vscodeExtensions,
    testFileCount,
    bins,
    moduleType,
    homepage,
    config
  };
}
