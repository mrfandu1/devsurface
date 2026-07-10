import { promises as fs } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { CONFIG_FILE_NAME } from '../../core/config/defaults.js';
import { scanProject } from '../../core/scanner/index.js';
import type { DevSurfaceConfig, ScanResult } from '../../core/types.js';

/**
 * Build a starter config from what the scanner already knows, so `init`
 * produces something true for THIS project instead of a generic template.
 */
export function buildDetectedConfig(scan: ScanResult): DevSurfaceConfig {
  const manager = scan.packageManager ?? 'npm';
  const config: DevSurfaceConfig = {
    name: scan.projectName,
    description: scan.packageJson?.data.description ?? 'Describe the project in one sentence.'
  };

  const commands: Record<string, string> = {};
  if (scan.language.detected.includes('node') && scan.packageJson !== null) {
    commands.install = manager === 'npm' ? 'npm ci' : `${manager} install`;
  }
  for (const script of ['dev', 'build', 'test', 'lint'] as const) {
    if (scan.scripts[script] !== undefined) {
      commands[script] = `${manager} run ${script}`;
    }
  }
  if (Object.keys(commands).length > 0) {
    config.commands = commands;
  }

  if (scan.ports.length > 0) {
    config.ports = scan.ports.map((probe) => probe.port).slice(0, 8);
  }

  if (scan.env?.hasExample) {
    config.env = { example: '.env.example', local: '.env' };
  }

  if (scan.docker !== null && scan.docker.composeFiles.length > 0) {
    config.services = { docker: true };
  }

  const launch: string[] = [];
  if (scan.docker !== null && scan.docker.composeFiles.length > 0) {
    launch.push('docker');
  }
  if (scan.scripts.dev !== undefined) {
    launch.push('dev');
  } else if (scan.scripts.start !== undefined) {
    launch.push('start');
  }
  if (launch.length > 0) {
    config.launch = launch;
  }

  if (scan.homepage != null) {
    config.docs = scan.homepage;
  }

  return config;
}

export async function initCommand(
  cwd = process.cwd(),
  options: { force?: boolean } = {}
): Promise<void> {
  const configPath = path.join(cwd, CONFIG_FILE_NAME);

  if (options.force !== true) {
    try {
      await fs.access(configPath);
      console.log(
        pc.yellow(`${CONFIG_FILE_NAME} already exists. Use --force to regenerate it from scratch.`)
      );
      return;
    } catch {
      // No config yet — proceed.
    }
  }

  const scan = await scanProject(cwd);
  const config = buildDetectedConfig(scan);
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
  console.log(pc.green(`Created ${CONFIG_FILE_NAME} from what DevSurface detected:`));
  console.log(
    pc.dim(
      `  ${Object.keys(config.commands ?? {}).length} commands, ${config.ports?.length ?? 0} ports, launch: ${config.launch?.join(' → ') ?? 'none'}`
    )
  );
}
