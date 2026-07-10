import { promises as fs } from 'node:fs';
import path from 'node:path';
import { isSafeHttpUrl } from '../security/url.js';
import type { ConfigLoadResult, DevSurfaceConfig, SetupGuideStep } from '../types.js';
import { CONFIG_FILE_NAME } from './defaults.js';

export const MAX_CONFIGURED_PORTS = 32;

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toStringRecord(
  value: unknown,
  warnings: string[],
  label: string
): Record<string, string> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    warnings.push(`${label} must be an object.`);
    return undefined;
  }

  const record: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === 'string') {
      record[key] = raw;
    } else {
      warnings.push(`${label}.${key} must be a string.`);
    }
  }

  return record;
}

function toGroups(value: unknown, warnings: string[]): Record<string, string[]> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!isRecord(value)) {
    warnings.push('groups must be an object.');
    return undefined;
  }

  const groups: Record<string, string[]> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (Array.isArray(raw) && raw.every((entry) => typeof entry === 'string')) {
      groups[key] = raw;
    } else {
      warnings.push(`groups.${key} must be an array of command names.`);
    }
  }

  return groups;
}

export const MAX_SETUP_GUIDE_STEPS = 24;
const MAX_SETUP_GUIDE_STEP_LENGTH = 200;

function toSetupGuide(
  value: unknown,
  warnings: string[]
): Array<string | SetupGuideStep> | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    warnings.push('setupGuide must be an array of strings or step objects.');
    return undefined;
  }

  const steps: Array<string | SetupGuideStep> = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      const trimmed = entry.trim();
      if (trimmed.length > 0) {
        steps.push(trimmed.slice(0, MAX_SETUP_GUIDE_STEP_LENGTH));
      }
    } else if (isRecord(entry)) {
      if (typeof entry.title !== 'string' || entry.title.trim().length === 0) {
        warnings.push('setupGuide step objects must have a non-empty title string.');
        continue;
      }
      const step: SetupGuideStep = {
        title: entry.title.trim().slice(0, MAX_SETUP_GUIDE_STEP_LENGTH)
      };
      if (typeof entry.description === 'string' && entry.description.trim().length > 0) {
        step.description = entry.description.trim().slice(0, MAX_SETUP_GUIDE_STEP_LENGTH);
      }
      if (typeof entry.command === 'string' && entry.command.trim().length > 0) {
        step.command = entry.command.trim();
      }
      if (typeof entry.script === 'string' && entry.script.trim().length > 0) {
        step.script = entry.script.trim();
      }
      steps.push(step);
    } else {
      warnings.push('setupGuide entries must be strings or step objects.');
    }
  }

  if (steps.length > MAX_SETUP_GUIDE_STEPS) {
    warnings.push(`setupGuide may contain at most ${MAX_SETUP_GUIDE_STEPS} steps.`);
  }

  return steps.slice(0, MAX_SETUP_GUIDE_STEPS);
}

function toPorts(value: unknown, warnings: string[]): number[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Array.isArray(value)) {
    warnings.push('ports must be an array of numbers.');
    return undefined;
  }

  const ports = value.filter(
    (port): port is number => Number.isInteger(port) && port > 0 && port < 65536
  );
  if (ports.length !== value.length) {
    warnings.push('ports may only contain integers between 1 and 65535.');
  }

  if (ports.length > MAX_CONFIGURED_PORTS) {
    warnings.push(`ports may contain at most ${MAX_CONFIGURED_PORTS} entries.`);
  }

  return ports.slice(0, MAX_CONFIGURED_PORTS);
}

const KNOWN_CONFIG_KEYS = new Set([
  '$schema',
  'name',
  'description',
  'commands',
  'groups',
  'ports',
  'env',
  'services',
  'setupGuide',
  'setup_guide',
  'docs',
  'launch'
]);

export const MAX_LAUNCH_STEPS = 10;

function toLaunch(value: unknown, warnings: string[]): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    warnings.push('launch must be an array of script/command names (or "docker").');
    return undefined;
  }
  const steps = value.map((entry) => entry.trim()).filter((entry) => entry.length > 0);
  if (steps.length > MAX_LAUNCH_STEPS) {
    warnings.push(`launch may contain at most ${MAX_LAUNCH_STEPS} steps.`);
  }
  return steps.slice(0, MAX_LAUNCH_STEPS);
}

export function validateConfig(raw: unknown): { config: DevSurfaceConfig; warnings: string[] } {
  const warnings: string[] = [];
  if (!isRecord(raw)) {
    return { config: {}, warnings: ['devsurface.config.json must contain a JSON object.'] };
  }

  for (const key of Object.keys(raw)) {
    if (!KNOWN_CONFIG_KEYS.has(key)) {
      warnings.push(`Unknown config key "${key}" is ignored.`);
    }
  }

  const env = isRecord(raw.env)
    ? {
        example: typeof raw.env.example === 'string' ? raw.env.example : undefined,
        local: typeof raw.env.local === 'string' ? raw.env.local : undefined
      }
    : undefined;

  if (raw.env !== undefined && !isRecord(raw.env)) {
    warnings.push('env must be an object.');
  }

  const services = isRecord(raw.services)
    ? {
        docker: typeof raw.services.docker === 'boolean' ? raw.services.docker : undefined
      }
    : undefined;

  if (raw.services !== undefined && !isRecord(raw.services)) {
    warnings.push('services must be an object.');
  }

  let docs: string | undefined;
  if (typeof raw.docs === 'string' && raw.docs.length > 0) {
    if (isSafeHttpUrl(raw.docs)) {
      docs = raw.docs;
    } else {
      warnings.push('docs must be an http or https URL.');
    }
  }

  return {
    config: {
      name: typeof raw.name === 'string' ? raw.name : undefined,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      commands: toStringRecord(raw.commands, warnings, 'commands'),
      groups: toGroups(raw.groups, warnings),
      ports: toPorts(raw.ports, warnings),
      env,
      services,
      setupGuide: toSetupGuide(raw.setupGuide ?? raw.setup_guide, warnings),
      docs,
      launch: toLaunch(raw.launch, warnings)
    },
    warnings
  };
}

export async function loadConfig(root: string): Promise<ConfigLoadResult | null> {
  const configPath = path.join(root, CONFIG_FILE_NAME);

  try {
    const [realRoot, realConfigPath] = await Promise.all([
      fs.realpath(root),
      fs.realpath(configPath)
    ]);
    if (!isWithinRoot(realRoot, realConfigPath)) {
      return null;
    }
    const content = await fs.readFile(realConfigPath, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    const { config, warnings } = validateConfig(parsed);
    return { path: realConfigPath, config, warnings };
  } catch (error) {
    const code =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    if (code === 'ENOENT') {
      return null;
    }

    if (error instanceof SyntaxError) {
      return {
        path: configPath,
        config: {},
        warnings: [`${CONFIG_FILE_NAME} contains invalid JSON.`]
      };
    }

    return null;
  }
}
