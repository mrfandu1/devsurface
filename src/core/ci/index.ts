/**
 * CI / workflow insights.
 *
 * Reads the CI pipeline definitions in a repo (GitHub Actions, GitLab CI,
 * CircleCI, Travis, Azure Pipelines) and explains, in plain English, what
 * triggers a build, which jobs run, and which project scripts the pipeline
 * calls — so you can tell whether "the checks that run in CI" match "the
 * checks you can run locally". YAML parsing only; nothing is executed.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export interface CiWorkflow {
  /** Provider label ("GitHub Actions", "GitLab CI", …). */
  provider: string;
  /** Repo-relative path to the workflow file. */
  file: string;
  /** Workflow name, if declared. */
  name: string | null;
  /** Events that trigger it ("push", "pull_request", "schedule"). */
  triggers: string[];
  /** Job identifiers. */
  jobs: string[];
  /** Project scripts the pipeline runs ("npm run build" → "build"). */
  scriptsUsed: string[];
}

export interface CiReport {
  configured: boolean;
  workflows: CiWorkflow[];
  /** Scripts that CI runs but package.json does not define. */
  missingScripts: string[];
  /** package.json quality scripts that no CI workflow runs. */
  uncheckedScripts: string[];
}

const SCRIPT_REFERENCE = /\b(?:npm|pnpm|bun|yarn)\s+(?:run\s+)?([a-z0-9:_-]+)/gi;
const YARN_BUILTINS = new Set(['install', 'add', 'remove', 'ci', 'run', 'global', 'dlx', 'exec']);
const QUALITY_SCRIPTS = ['lint', 'typecheck', 'test', 'build', 'format:check'];

function collectStrings(node: unknown, out: string[]): void {
  if (typeof node === 'string') {
    out.push(node);
  } else if (Array.isArray(node)) {
    for (const item of node) {
      collectStrings(item, out);
    }
  } else if (node !== null && typeof node === 'object') {
    for (const value of Object.values(node)) {
      collectStrings(value, out);
    }
  }
}

/** Extract project-script names from all `run:` strings in a workflow tree. */
export function extractScriptsUsed(doc: unknown): string[] {
  const strings: string[] = [];
  collectStrings(doc, strings);
  const scripts = new Set<string>();
  for (const text of strings) {
    SCRIPT_REFERENCE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = SCRIPT_REFERENCE.exec(text)) !== null) {
      const name = match[1];
      if (!YARN_BUILTINS.has(name)) {
        scripts.add(name);
      }
    }
  }
  return [...scripts];
}

function parseGitHubTriggers(on: unknown): string[] {
  if (typeof on === 'string') {
    return [on];
  }
  if (Array.isArray(on)) {
    return on.filter((item): item is string => typeof item === 'string');
  }
  if (on !== null && typeof on === 'object') {
    return Object.keys(on);
  }
  return [];
}

async function readGitHubWorkflows(root: string): Promise<CiWorkflow[]> {
  const dir = path.join(root, '.github', 'workflows');
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const workflows: CiWorkflow[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !/\.ya?ml$/i.test(entry.name)) {
      continue;
    }
    try {
      const content = await fs.readFile(path.join(dir, entry.name), 'utf8');
      const doc = parseYaml(content) as Record<string, unknown>;
      const jobs =
        doc.jobs !== null && typeof doc.jobs === 'object'
          ? Object.keys(doc.jobs as Record<string, unknown>)
          : [];
      workflows.push({
        provider: 'GitHub Actions',
        file: `.github/workflows/${entry.name}`,
        name: typeof doc.name === 'string' ? doc.name : null,
        triggers: parseGitHubTriggers(doc.on),
        jobs,
        scriptsUsed: extractScriptsUsed(doc)
      });
    } catch {
      // Skip unparseable workflow.
    }
  }
  return workflows;
}

async function readSingleFileWorkflow(
  root: string,
  file: string,
  provider: string
): Promise<CiWorkflow | null> {
  try {
    const content = await fs.readFile(path.join(root, file), 'utf8');
    const doc = parseYaml(content) as Record<string, unknown>;
    const jobs =
      doc !== null && typeof doc === 'object'
        ? Object.keys(doc).filter((key) => !key.startsWith('.') && key !== 'stages')
        : [];
    return {
      provider,
      file,
      name: typeof doc?.name === 'string' ? doc.name : null,
      triggers: [],
      jobs: jobs.slice(0, 30),
      scriptsUsed: extractScriptsUsed(doc)
    };
  } catch {
    return null;
  }
}

/** Gather CI insights across every provider we understand. */
export async function analyzeCi(
  root: string,
  scripts: Record<string, string> = {}
): Promise<CiReport> {
  const workflows: CiWorkflow[] = [...(await readGitHubWorkflows(root))];

  for (const [file, provider] of [
    ['.gitlab-ci.yml', 'GitLab CI'],
    ['.circleci/config.yml', 'CircleCI'],
    ['.travis.yml', 'Travis CI'],
    ['azure-pipelines.yml', 'Azure Pipelines'],
    ['bitbucket-pipelines.yml', 'Bitbucket Pipelines']
  ] as const) {
    const workflow = await readSingleFileWorkflow(root, file, provider);
    if (workflow !== null) {
      workflows.push(workflow);
    }
  }

  const usedScripts = new Set<string>();
  for (const workflow of workflows) {
    for (const script of workflow.scriptsUsed) {
      usedScripts.add(script);
    }
  }

  const definedScripts = new Set(Object.keys(scripts));
  const missingScripts = [...usedScripts].filter((script) => !definedScripts.has(script)).sort();
  const uncheckedScripts = QUALITY_SCRIPTS.filter(
    (script) => definedScripts.has(script) && !usedScripts.has(script)
  );

  return {
    configured: workflows.length > 0,
    workflows,
    missingScripts,
    uncheckedScripts
  };
}
