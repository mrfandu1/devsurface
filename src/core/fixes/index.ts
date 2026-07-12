/**
 * One-click fixes for the doctor warnings that have a mechanical, safe
 * remedy. Every fixer is append-only or create-only (never rewrites user
 * content), idempotent, and explains what it did in plain English.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ScanResult } from '../types.js';
import { scanProject } from '../scanner/index.js';

export interface FixDescriptor {
  /** Matches DoctorWarning.id. */
  warningId: string;
  /** Button label, e.g. "Add .env to .gitignore". */
  label: string;
  /** One sentence describing exactly what applying it will do. */
  description: string;
}

export interface FixResult {
  applied: boolean;
  warningId: string;
  /** What happened, in plain English. */
  message: string;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Append lines to a root file, creating it if needed, with a blank-line guard. */
async function appendLines(filePath: string, lines: string[]): Promise<void> {
  let existing = '';
  try {
    existing = await fs.readFile(filePath, 'utf8');
  } catch {
    // File will be created.
  }
  const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
  await fs.writeFile(filePath, existing + separator + lines.join('\n') + '\n', 'utf8');
}

interface Fixer extends FixDescriptor {
  /** True when this fixer applies to the current project state. */
  applies: (scan: ScanResult) => boolean;
  apply: (root: string, scan: ScanResult) => Promise<FixResult>;
}

const DOCKERIGNORE_TEMPLATE = [
  'node_modules',
  '.git',
  '.env',
  '.env.*',
  'dist',
  'build',
  'coverage',
  '*.log'
];

const FIXERS: Fixer[] = [
  {
    warningId: 'env-not-gitignored',
    label: 'Add .env to .gitignore',
    description: 'Appends ".env" to .gitignore so your secrets file can never be committed.',
    applies: (scan) => scan.env?.hasLocal === true,
    apply: async (root) => {
      await appendLines(path.join(root, '.gitignore'), ['.env']);
      return {
        applied: true,
        warningId: 'env-not-gitignored',
        message: 'Added ".env" to .gitignore — your settings file is now protected from commits.'
      };
    }
  },
  {
    warningId: 'node-modules-not-gitignored',
    label: 'Add node_modules to .gitignore',
    description: 'Appends "node_modules/" to .gitignore so installed packages stay out of git.',
    applies: () => true,
    apply: async (root) => {
      await appendLines(path.join(root, '.gitignore'), ['node_modules/']);
      return {
        applied: true,
        warningId: 'node-modules-not-gitignored',
        message: 'Added "node_modules/" to .gitignore.'
      };
    }
  },
  {
    warningId: 'missing-dockerignore',
    label: 'Create a .dockerignore',
    description:
      'Creates a standard .dockerignore (node_modules, .git, .env, build output) next to the Dockerfile.',
    applies: () => true,
    apply: async (root) => {
      const target = path.join(root, '.dockerignore');
      if (await pathExists(target)) {
        return {
          applied: false,
          warningId: 'missing-dockerignore',
          message: 'A .dockerignore already exists — nothing to do.'
        };
      }
      await fs.writeFile(target, DOCKERIGNORE_TEMPLATE.join('\n') + '\n', 'utf8');
      return {
        applied: true,
        warningId: 'missing-dockerignore',
        message: 'Created .dockerignore with the standard safe excludes.'
      };
    }
  },
  {
    warningId: 'missing-env',
    label: 'Create .env from the example',
    description: 'Copies .env.example to .env so you can fill in your own values.',
    applies: (scan) => scan.env?.hasExample === true && scan.env.hasLocal !== true,
    apply: async (root, scan) => {
      const example = scan.env?.examplePath;
      if (example == null) {
        return { applied: false, warningId: 'missing-env', message: 'No example file found.' };
      }
      const target = path.join(root, '.env');
      if (await pathExists(target)) {
        return {
          applied: false,
          warningId: 'missing-env',
          message: '.env already exists — nothing to do.'
        };
      }
      await fs.copyFile(example, target);
      return {
        applied: true,
        warningId: 'missing-env',
        message: 'Created .env from the example. Open it and fill in the values.'
      };
    }
  },
  {
    warningId: 'missing-env-example',
    label: 'Create .env.example from your keys',
    description:
      'Writes a .env.example listing your .env key names with empty values — values are never copied.',
    applies: (scan) => scan.env?.hasLocal === true && scan.env.hasExample !== true,
    apply: async (root, scan) => {
      const keys = scan.env?.localKeys ?? [];
      const target = path.join(root, '.env.example');
      if (await pathExists(target)) {
        return {
          applied: false,
          warningId: 'missing-env-example',
          message: '.env.example already exists — nothing to do.'
        };
      }
      const body =
        '# Settings this project needs. Copy to .env and fill in real values.\n' +
        keys.map((key) => `${key}=`).join('\n') +
        '\n';
      await fs.writeFile(target, body, 'utf8');
      return {
        applied: true,
        warningId: 'missing-env-example',
        message: `Created .env.example documenting ${keys.length} key name${keys.length === 1 ? '' : 's'} (no values were copied).`
      };
    }
  },
  {
    warningId: 'missing-readme',
    label: 'Create a starter README',
    description: 'Creates a small README.md skeleton with name, install, and run sections.',
    applies: (scan) => !scan.readme.exists,
    apply: async (root, scan) => {
      const target = path.join(root, 'README.md');
      if (await pathExists(target)) {
        return {
          applied: false,
          warningId: 'missing-readme',
          message: 'A README already exists — nothing to do.'
        };
      }
      const dev = ['dev', 'start', 'serve'].find((name) => scan.scripts[name] !== undefined);
      const body = [
        `# ${scan.projectName}`,
        '',
        '_One sentence about what this project does._',
        '',
        '## Getting started',
        '',
        '```bash',
        'npm install',
        ...(dev !== undefined ? [`npm run ${dev}`] : []),
        '```',
        ''
      ].join('\n');
      await fs.writeFile(target, body, 'utf8');
      return {
        applied: true,
        warningId: 'missing-readme',
        message: 'Created a starter README.md — fill in the one-sentence description.'
      };
    }
  }
];

/** The fix descriptors that apply to this project right now. */
export async function listAvailableFixes(
  root: string,
  scan?: ScanResult
): Promise<FixDescriptor[]> {
  const result = scan ?? (await scanProject(root));
  return FIXERS.filter((fixer) => fixer.applies(result)).map(
    ({ warningId, label, description }) => ({ warningId, label, description })
  );
}

/** Apply one fix by its warning id. Unknown ids are refused, never guessed. */
export async function applyFix(
  root: string,
  warningId: string,
  scan?: ScanResult
): Promise<FixResult> {
  const fixer = FIXERS.find((candidate) => candidate.warningId === warningId);
  if (fixer === undefined) {
    return { applied: false, warningId, message: 'No automatic fix exists for that warning.' };
  }
  const result = scan ?? (await scanProject(root));
  if (!fixer.applies(result)) {
    return {
      applied: false,
      warningId,
      message: 'That fix does not apply to the project in its current state.'
    };
  }
  return fixer.apply(root, result);
}
