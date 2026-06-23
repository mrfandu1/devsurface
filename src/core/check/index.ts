import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../config/load.js';
import {
  documentsEnvironmentSetup,
  extractScriptReferences,
  undocumentedPorts
} from '../documentation.js';
import { inferPortsFromScripts } from '../scanner/ports.js';
import { readPackageJson } from '../scanner/packageJson.js';
import { extractScripts } from '../scanner/scripts.js';
import type { DoctorWarning } from '../types.js';

interface DocumentationFile {
  path: string;
  content: string;
}

export interface RepositoryCheckResult {
  root: string;
  projectName: string;
  checks: DoctorWarning[];
}

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function readFileInsideRoot(root: string, relativePath: string): Promise<string | null> {
  const candidate = path.resolve(root, relativePath);
  if (!isWithinRoot(root, candidate)) {
    return null;
  }

  try {
    const [realRoot, realCandidate] = await Promise.all([
      fs.realpath(root),
      fs.realpath(candidate)
    ]);
    if (!isWithinRoot(realRoot, realCandidate)) {
      return null;
    }
    return await fs.readFile(realCandidate, 'utf8');
  } catch {
    return null;
  }
}

async function readFirstDocumentationFile(
  root: string,
  candidates: string[]
): Promise<DocumentationFile | null> {
  for (const candidate of candidates) {
    const content = await readFileInsideRoot(root, candidate);
    if (content !== null) {
      return { path: candidate, content };
    }
  }
  return null;
}

async function fileExistsInsideRoot(root: string, relativePath: string): Promise<boolean> {
  return (await readFileInsideRoot(root, relativePath)) !== null;
}

function check(
  id: string,
  severity: DoctorWarning['severity'],
  title: string,
  message: string,
  target?: string
): DoctorWarning {
  return { id, severity, title, message, target };
}

export async function runRepositoryChecks(
  requestedRoot = process.cwd()
): Promise<RepositoryCheckResult> {
  const root = await fs.realpath(path.resolve(requestedRoot));
  const [packageJson, config, readme, contributing] = await Promise.all([
    readPackageJson(root),
    loadConfig(root),
    readFirstDocumentationFile(root, ['README.md', 'README']),
    readFirstDocumentationFile(root, ['CONTRIBUTING.md', 'CONTRIBUTING'])
  ]);
  const checks: DoctorWarning[] = [];
  const scripts = extractScripts(packageJson) ?? {};
  const projectName = config?.config.name ?? packageJson?.data.name ?? path.basename(root);

  for (const configWarning of config?.warnings ?? []) {
    checks.push(
      check(
        'config-warning',
        'warning',
        'Invalid DevSurface configuration',
        configWarning,
        'devsurface.config.json'
      )
    );
  }

  if (packageJson === null) {
    checks.push(
      check(
        'missing-package-json',
        'error',
        'No package.json',
        'DevSurface checks require a Node.js project with a package.json.',
        'package.json'
      )
    );
  } else {
    if (scripts.test === undefined) {
      checks.push(
        check(
          'missing-test-script',
          'warning',
          'No test script',
          'package.json does not define a test script.',
          'package.json'
        )
      );
    }
    if (scripts.build === undefined) {
      checks.push(
        check(
          'missing-build-script',
          'warning',
          'No build script',
          'package.json does not define a build script.',
          'package.json'
        )
      );
    }
  }

  if (readme === null) {
    checks.push(
      check('missing-readme', 'warning', 'No README', 'No README.md or README file was found.')
    );
  } else {
    const missingScripts = extractScriptReferences(readme.content).filter(
      (script) => scripts[script] === undefined
    );
    if (missingScripts.length > 0) {
      checks.push(
        check(
          'readme-script-mismatch',
          'warning',
          'README references missing scripts',
          `README mentions scripts not present in package.json: ${missingScripts.join(', ')}.`,
          readme.path
        )
      );
    }
  }

  if (contributing === null) {
    checks.push(
      check(
        'missing-contributing',
        'warning',
        'No CONTRIBUTING guide',
        'No CONTRIBUTING.md or CONTRIBUTING file was found.'
      )
    );
  }

  const documentation = [readme?.content, contributing?.content].filter(Boolean).join('\n');
  const envExample = config?.config.env?.example ?? '.env.example';
  if ((await fileExistsInsideRoot(root, envExample)) && !documentsEnvironmentSetup(documentation)) {
    checks.push(
      check(
        'undocumented-env',
        'warning',
        'Environment setup is undocumented',
        `${envExample} exists, but README or CONTRIBUTING does not explain environment setup.`,
        envExample
      )
    );
  }

  const ports = Array.from(
    new Set([...(config?.config.ports ?? []), ...inferPortsFromScripts(scripts)])
  );
  const missingPortDocs = undocumentedPorts(documentation, ports);
  if (missingPortDocs.length > 0) {
    checks.push(
      check(
        'undocumented-ports',
        'info',
        'Detected ports are undocumented',
        `README or CONTRIBUTING does not mention: ${missingPortDocs.join(', ')}.`
      )
    );
  }

  return { root, projectName, checks };
}
