import { promises as fs } from 'node:fs';
import path from 'node:path';
import { extractScriptReferences } from '../documentation.js';
import type { DoctorWarning, ScanResult } from '../types.js';
import { scanProject } from '../scanner/index.js';

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readIfPresent(filePath: string | null): Promise<string | null> {
  if (filePath === null) {
    return null;
  }

  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function warning(
  id: string,
  severity: DoctorWarning['severity'],
  title: string,
  message: string,
  target?: string
): DoctorWarning {
  return { id, severity, title, message, target };
}

export async function runDoctor(root = process.cwd(), scan?: ScanResult): Promise<DoctorWarning[]> {
  const result = scan ?? (await scanProject(root));
  const warnings: DoctorWarning[] = [];

  for (const configWarning of result.config?.warnings ?? []) {
    warnings.push(
      warning('config-warning', 'warning', 'Config warning', configWarning, result.config?.path)
    );
  }

  const isNodeProject = result.language.detected.includes('node');
  const hasKnownProjectLanguage = result.language.detected.length > 0;

  if (result.packageJson === null && !hasKnownProjectLanguage) {
    warnings.push(
      warning(
        'missing-package-json',
        'error',
        'No package.json',
        'This directory is not a Node.js project.'
      )
    );
    return warnings;
  }

  if (isNodeProject && !(await pathExists(path.join(root, 'node_modules', '.bin')))) {
    warnings.push(
      warning(
        'missing-node-modules',
        'warning',
        'Dependencies are not installed',
        'node_modules/.bin is missing. Run the project install command before starting scripts.'
      )
    );
  }

  if (result.env?.hasExample && !result.env.hasLocal) {
    warnings.push(
      warning(
        'missing-env',
        'error',
        '.env is missing',
        '.env.example exists, but the local .env file is missing.',
        result.env.examplePath ?? undefined
      )
    );
  }

  if (result.env && result.env.missingKeys.length > 0 && result.env.hasLocal) {
    warnings.push(
      warning(
        'missing-env-keys',
        'warning',
        'Environment keys are missing',
        `Missing keys: ${result.env.missingKeys.join(', ')}. Values are intentionally hidden.`
      )
    );
  }

  if (result.env && result.env.emptyKeys.length > 0) {
    warnings.push(
      warning(
        'empty-env-keys',
        'info',
        'Environment keys are empty',
        `Empty keys: ${result.env.emptyKeys.join(', ')}. Values are intentionally hidden.`
      )
    );
  }

  const missingReadme = !result.readme.exists;
  if (missingReadme) {
    warnings.push(
      warning('missing-readme', 'warning', 'No README', 'No README.md or README file was found.')
    );
  } else {
    const readme = await readIfPresent(result.readme.path);
    if (readme !== null) {
      const references = extractScriptReferences(readme);
      const missingScripts = references.filter((script) => result.scripts[script] === undefined);
      if (missingScripts.length > 0) {
        warnings.push(
          warning(
            'readme-script-mismatch',
            'warning',
            'README references missing scripts',
            `README mentions scripts not present in package.json: ${missingScripts.join(', ')}.`
          )
        );
      }
    }
  }

  for (const port of result.ports.filter((probe) => probe.inUse)) {
    warnings.push(
      warning(
        `port-${port.port}-in-use`,
        'error',
        `Port ${port.port} is already in use`,
        `Something is already bound to 127.0.0.1:${port.port}.`
      )
    );
  }

  if (result.docker && result.docker.dockerRunning === false) {
    warnings.push(
      warning(
        'docker-not-running',
        'warning',
        'Docker Compose found but Docker is not running',
        result.docker.message ?? 'A compose file exists, but Docker is not available.'
      )
    );
  }

  if (isNodeProject && result.scripts.test === undefined) {
    warnings.push(
      warning(
        'missing-test-script',
        'warning',
        'No test script',
        'package.json does not define a test script.'
      )
    );
  }

  if (isNodeProject && result.scripts.build === undefined) {
    warnings.push(
      warning(
        'missing-build-script',
        'warning',
        'No build script',
        'package.json does not define a build script.'
      )
    );
  }

  return warnings;
}
