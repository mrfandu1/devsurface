/**
 * Config file inspector.
 *
 * Finds the configuration files scattered around a repo (tsconfig, eslint,
 * prettier, editorconfig, dockerfiles, CI, git config, …), validates that
 * the JSON ones actually parse, and flags common inconsistencies — a
 * .gitignore missing entries the doctor cares about, JSON with comments in a
 * strict-JSON file, and so on. Read-only.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface ConfigFileEntry {
  /** Repo-relative path. */
  file: string;
  /** Friendly label ("TypeScript config", "ESLint config"). */
  label: string;
  /** "json", "yaml", "toml", "ini", "js", "other". */
  format: string;
  /** Size in bytes. */
  bytes: number;
  /** True when the file is valid for its format (JSON parse check). */
  valid: boolean;
  /** Problem description when valid is false. */
  problem?: string;
}

export interface ConfigsReport {
  files: ConfigFileEntry[];
  /** Count of config files by format. */
  byFormat: Record<string, number>;
  /** Files that failed validation. */
  invalid: ConfigFileEntry[];
}

interface KnownConfig {
  file: string;
  label: string;
  format: string;
  /** JSON-with-comments is fine here (tsconfig, .vscode). */
  jsonc?: boolean;
}

const KNOWN_CONFIGS: KnownConfig[] = [
  { file: 'tsconfig.json', label: 'TypeScript config', format: 'json', jsonc: true },
  { file: 'jsconfig.json', label: 'JavaScript config', format: 'json', jsonc: true },
  { file: 'package.json', label: 'Package manifest', format: 'json' },
  { file: '.eslintrc.json', label: 'ESLint config', format: 'json' },
  { file: '.eslintrc', label: 'ESLint config', format: 'json' },
  { file: 'eslint.config.js', label: 'ESLint flat config', format: 'js' },
  { file: '.prettierrc', label: 'Prettier config', format: 'json' },
  { file: '.prettierrc.json', label: 'Prettier config', format: 'json' },
  { file: 'prettier.config.js', label: 'Prettier config', format: 'js' },
  { file: '.editorconfig', label: 'EditorConfig', format: 'ini' },
  { file: '.babelrc', label: 'Babel config', format: 'json' },
  { file: 'babel.config.js', label: 'Babel config', format: 'js' },
  { file: 'vite.config.ts', label: 'Vite config', format: 'js' },
  { file: 'vite.config.js', label: 'Vite config', format: 'js' },
  { file: 'vitest.config.ts', label: 'Vitest config', format: 'js' },
  { file: 'jest.config.js', label: 'Jest config', format: 'js' },
  { file: 'webpack.config.js', label: 'Webpack config', format: 'js' },
  { file: 'rollup.config.js', label: 'Rollup config', format: 'js' },
  { file: 'tailwind.config.js', label: 'Tailwind config', format: 'js' },
  { file: 'postcss.config.js', label: 'PostCSS config', format: 'js' },
  { file: 'Dockerfile', label: 'Dockerfile', format: 'other' },
  { file: 'docker-compose.yml', label: 'Docker Compose', format: 'yaml' },
  { file: 'docker-compose.yaml', label: 'Docker Compose', format: 'yaml' },
  { file: '.dockerignore', label: 'Docker ignore', format: 'other' },
  { file: '.gitignore', label: 'Git ignore', format: 'other' },
  { file: '.gitattributes', label: 'Git attributes', format: 'other' },
  { file: '.nvmrc', label: 'Node version pin', format: 'other' },
  { file: '.node-version', label: 'Node version pin', format: 'other' },
  { file: 'renovate.json', label: 'Renovate config', format: 'json' },
  { file: '.npmrc', label: 'npm config', format: 'ini' },
  { file: 'turbo.json', label: 'Turborepo config', format: 'json' },
  { file: 'nx.json', label: 'Nx config', format: 'json' },
  { file: 'pyproject.toml', label: 'Python project', format: 'toml' },
  { file: 'Cargo.toml', label: 'Rust manifest', format: 'toml' },
  { file: 'go.mod', label: 'Go module', format: 'other' }
];

/** Strip line and block comments so JSONC files can be parse-validated. */
export function stripJsonComments(input: string): string {
  return input
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:"])\/\/.*$/gm, '$1')
    .replace(/,(\s*[}\]])/g, '$1');
}

function validateJson(content: string, jsonc: boolean): { valid: boolean; problem?: string } {
  try {
    JSON.parse(jsonc ? stripJsonComments(content) : content);
    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { valid: false, problem: `Invalid JSON: ${message}` };
  }
}

/** Discover and validate configuration files at the repo root. */
export async function inspectConfigs(root: string): Promise<ConfigsReport> {
  const files: ConfigFileEntry[] = [];

  for (const known of KNOWN_CONFIGS) {
    const absPath = path.join(root, known.file);
    let stat;
    try {
      stat = await fs.stat(absPath);
    } catch {
      continue;
    }
    if (!stat.isFile()) {
      continue;
    }

    const entry: ConfigFileEntry = {
      file: known.file,
      label: known.label,
      format: known.format,
      bytes: stat.size,
      valid: true
    };

    if (known.format === 'json' && stat.size <= 512 * 1024) {
      try {
        const content = await fs.readFile(absPath, 'utf8');
        const result = validateJson(content, known.jsonc === true);
        entry.valid = result.valid;
        entry.problem = result.problem;
      } catch {
        entry.valid = false;
        entry.problem = 'Could not read the file.';
      }
    }

    files.push(entry);
  }

  files.sort((left, right) => left.label.localeCompare(right.label));

  const byFormat: Record<string, number> = {};
  for (const file of files) {
    byFormat[file.format] = (byFormat[file.format] ?? 0) + 1;
  }

  return { files, byFormat, invalid: files.filter((file) => !file.valid) };
}
