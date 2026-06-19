import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ConfigLoadResult, DevSurfaceConfig } from '../types.js';
import { CONFIG_FILE_NAME } from './defaults.js';

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

  return ports;
}

export function validateConfig(raw: unknown): { config: DevSurfaceConfig; warnings: string[] } {
  const warnings: string[] = [];
  if (!isRecord(raw)) {
    return { config: {}, warnings: ['devsurface.config.json must contain a JSON object.'] };
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

  return {
    config: {
      name: typeof raw.name === 'string' ? raw.name : undefined,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      commands: toStringRecord(raw.commands, warnings, 'commands'),
      groups: toGroups(raw.groups, warnings),
      ports: toPorts(raw.ports, warnings),
      env,
      services,
      docs: typeof raw.docs === 'string' ? raw.docs : undefined
    },
    warnings
  };
}

export async function loadConfig(root: string): Promise<ConfigLoadResult | null> {
  const configPath = path.join(root, CONFIG_FILE_NAME);

  try {
    const content = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(content) as unknown;
    const { config, warnings } = validateConfig(parsed);
    return { path: configPath, config, warnings };
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
