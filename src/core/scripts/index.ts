/**
 * Script intelligence.
 *
 * Reads package.json scripts the way a reviewer would: which scripts call
 * which other scripts, which pre/post hooks fire automatically, which
 * referenced files are missing, and which one-liners will break on another
 * operating system. Pure analysis — nothing is executed.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

export type ScriptCategory =
  | 'dev'
  | 'build'
  | 'test'
  | 'lint'
  | 'format'
  | 'deploy'
  | 'db'
  | 'other';

export interface ScriptInsight {
  name: string;
  command: string;
  category: ScriptCategory;
  /** Other package scripts this one invokes via `npm run` / `yarn` / `pnpm`. */
  calls: string[];
  /** Hooks that run automatically around this script ("prebuild", "postbuild"). */
  hooks: string[];
  /** Human-readable problems detected in this script. */
  issues: string[];
}

export interface ScriptsReport {
  insights: ScriptInsight[];
  /** Scripts referenced via `npm run X` that do not exist. */
  missingReferences: Array<{ script: string; missing: string }>;
  /** Scripts nothing references and no convention explains (candidates to prune). */
  orphans: string[];
  /** Count per category for summary chips. */
  categories: Record<ScriptCategory, number>;
}

const CATEGORY_RULES: Array<{ category: ScriptCategory; pattern: RegExp }> = [
  { category: 'dev', pattern: /^(dev|start|serve|watch|preview)/ },
  { category: 'build', pattern: /^(build|compile|bundle|package|dist)/ },
  { category: 'test', pattern: /^(test|e2e|coverage|spec)/ },
  { category: 'lint', pattern: /^(lint|typecheck|check|tsc)/ },
  { category: 'format', pattern: /^(format|fmt|prettier)/ },
  { category: 'deploy', pattern: /^(deploy|publish|release|ship)/ },
  { category: 'db', pattern: /^(db|migrate|seed|prisma|drizzle)/ }
];

/** Names every ecosystem tool understands — never counted as orphans. */
const WELL_KNOWN_SCRIPTS = new Set([
  'start',
  'dev',
  'build',
  'test',
  'lint',
  'format',
  'prepare',
  'prepublishOnly',
  'prepack',
  'postinstall',
  'preinstall',
  'version',
  'serve',
  'preview',
  'typecheck'
]);

const RUN_REFERENCE =
  /\b(?:npm|pnpm|bun)\s+run\s+([A-Za-z0-9:_.-]+)|\byarn\s+(?:run\s+)?([A-Za-z0-9:_.-]+)/g;
const NODE_FILE_REFERENCE =
  /\b(?:node|tsx|ts-node)\s+(?:--[\w-]+\s+)*([\w./\\-]+\.(?:js|mjs|cjs|ts|mts))/g;

function categorize(name: string): ScriptCategory {
  const lower = name.toLowerCase();
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(lower)) {
      return rule.category;
    }
  }
  return 'other';
}

/** Extract package-script names referenced by a command string. */
export function findScriptReferences(command: string): string[] {
  const names: string[] = [];
  RUN_REFERENCE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RUN_REFERENCE.exec(command)) !== null) {
    const name = match[1] ?? match[2];
    // yarn matches also catch subcommands like "yarn install"; keep only
    // plausible script names that are not yarn built-ins.
    if (name !== undefined && !['install', 'add', 'remove', 'run'].includes(name)) {
      names.push(name);
    }
  }
  return [...new Set(names)];
}

/** Spot cross-platform and hygiene issues in one script command. */
export function findScriptIssues(command: string): string[] {
  const issues: string[] = [];
  if (/(^|&&|;)\s*[A-Z][A-Z0-9_]*=[^\s=]/.test(command) && !/cross-env/.test(command)) {
    issues.push(
      'Sets env vars with "FOO=bar" syntax, which fails on Windows — cross-env fixes it.'
    );
  }
  if (/\brm\s+-rf?\b/.test(command) && !/rimraf|del-cli/.test(command)) {
    issues.push('Uses "rm -rf", which does not exist on Windows — rimraf is the portable option.');
  }
  if (/\bcp\s+-r?\b/.test(command)) {
    issues.push(
      'Uses "cp", which does not exist on Windows — cpy-cli or a node script is portable.'
    );
  }
  if (/\bsudo\b/.test(command)) {
    issues.push('Runs sudo — package scripts should never need admin rights.');
  }
  if (command.length > 200) {
    issues.push('Very long one-liner — consider moving it into a script file.');
  }
  return issues;
}

/** Analyze package.json scripts without running anything. */
export async function analyzeScripts(
  root: string,
  scripts: Record<string, string>
): Promise<ScriptsReport> {
  const names = Object.keys(scripts);
  const nameSet = new Set(names);
  const referenced = new Set<string>();
  const missingReferences: Array<{ script: string; missing: string }> = [];

  const insights: ScriptInsight[] = [];
  for (const name of names) {
    const command = scripts[name];
    const calls = findScriptReferences(command);
    for (const call of calls) {
      if (nameSet.has(call)) {
        referenced.add(call);
      } else {
        missingReferences.push({ script: name, missing: call });
      }
    }

    const hooks = [`pre${name}`, `post${name}`].filter((hook) => nameSet.has(hook));
    const issues = findScriptIssues(command);

    // Referenced files that do not exist are broken before they ever run.
    NODE_FILE_REFERENCE.lastIndex = 0;
    let fileMatch: RegExpExecArray | null;
    while ((fileMatch = NODE_FILE_REFERENCE.exec(command)) !== null) {
      const relFile = fileMatch[1];
      if (relFile.includes('node_modules')) {
        continue;
      }
      try {
        await fs.access(path.join(root, relFile));
      } catch {
        issues.push(`References "${relFile}", which does not exist.`);
      }
    }

    insights.push({ name, command, category: categorize(name), calls, hooks, issues });
  }

  // Pre/post hooks count as referenced by their base script.
  for (const name of names) {
    const base = name.replace(/^(pre|post)/, '');
    if (base !== name && nameSet.has(base)) {
      referenced.add(name);
    }
  }

  const orphans = names.filter(
    (name) =>
      !referenced.has(name) &&
      !WELL_KNOWN_SCRIPTS.has(name) &&
      categorize(name) === 'other' &&
      !name.startsWith('pre') &&
      !name.startsWith('post')
  );

  const categories: Record<ScriptCategory, number> = {
    dev: 0,
    build: 0,
    test: 0,
    lint: 0,
    format: 0,
    deploy: 0,
    db: 0,
    other: 0
  };
  for (const insight of insights) {
    categories[insight.category] += 1;
  }

  return { insights, missingReferences, orphans, categories };
}
