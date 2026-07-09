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
    const owner =
      port.owner == null
        ? 'Something'
        : port.owner.name === null
          ? `PID ${port.owner.pid}`
          : `${port.owner.name} (PID ${port.owner.pid})`;
    const suggestion =
      typeof port.suggestedFreePort === 'number'
        ? ` Port ${port.suggestedFreePort} is free — try that instead.`
        : '';
    warnings.push(
      warning(
        `port-${port.port}-in-use`,
        'error',
        `Port ${port.port} is already in use`,
        `${owner} is already bound to 127.0.0.1:${port.port}.${suggestion}`
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

  // Pinned Node version vs the Node actually running devsurface.
  if (isNodeProject) {
    const pinned =
      (await readIfPresent(path.join(root, '.nvmrc'))) ??
      (await readIfPresent(path.join(root, '.node-version')));
    const pinnedMajor = pinned === null ? null : /^v?(\d+)/.exec(pinned.trim())?.[1];
    const runningMajor = /^v?(\d+)/.exec(process.version)?.[1];
    if (pinnedMajor !== undefined && pinnedMajor !== null && pinnedMajor !== runningMajor) {
      warnings.push(
        warning(
          'node-version-mismatch',
          'warning',
          'Node version differs from the pinned version',
          `This project pins Node ${pinned?.trim()} but Node ${process.version} is running. Switch versions (for example with nvm or fnm) before installing or running.`
        )
      );
    }
  }

  // Multiple package-manager lockfiles usually mean contributors used different tools.
  const lockfiles = ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'bun.lockb', 'bun.lock'];
  const presentLockfiles: string[] = [];
  for (const lockfile of lockfiles) {
    if (await pathExists(path.join(root, lockfile))) {
      presentLockfiles.push(lockfile);
    }
  }
  if (presentLockfiles.length > 1) {
    warnings.push(
      warning(
        'multiple-lockfiles',
        'warning',
        'Multiple lockfiles found',
        `Found ${presentLockfiles.join(', ')}. Keep only the lockfile for the package manager this project uses to avoid dependency drift.`
      )
    );
  }

  // A local .env that .gitignore does not cover is one commit away from leaking secrets.
  if (result.env?.hasLocal && (await pathExists(path.join(root, '.git')))) {
    const gitignore = (await readIfPresent(path.join(root, '.gitignore'))) ?? '';
    const coversEnv = gitignore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .some((line) => line === '.env' || line === '.env*' || line === '*.env' || line === '/.env');
    if (!coversEnv) {
      warnings.push(
        warning(
          'env-not-gitignored',
          'error',
          '.env is not listed in .gitignore',
          'A local .env exists but .gitignore does not cover it, so secrets could be committed. Add ".env" to .gitignore.'
        )
      );
    }
  }

  // A pinned packageManager field that disagrees with the detected lockfile confuses installs.
  const pinnedManager = result.packageJson?.data.packageManager?.split('@')[0]?.trim();
  if (
    pinnedManager !== undefined &&
    pinnedManager.length > 0 &&
    result.packageManager !== null &&
    pinnedManager !== result.packageManager
  ) {
    warnings.push(
      warning(
        'package-manager-mismatch',
        'warning',
        'Package manager mismatch',
        `package.json pins "${pinnedManager}" via the packageManager field, but the lockfile belongs to ${result.packageManager}. Use ${pinnedManager} so installs match the lockfile the project expects.`
      )
    );
  }

  // Dev containers are a one-click setup path worth pointing out.
  if (
    (await pathExists(path.join(root, '.devcontainer', 'devcontainer.json'))) ||
    (await pathExists(path.join(root, '.devcontainer.json')))
  ) {
    warnings.push(
      warning(
        'devcontainer-available',
        'info',
        'Dev container available',
        'This project ships a dev container. Opening it in VS Code ("Reopen in Container") or GitHub Codespaces gives a ready-made environment.'
      )
    );
  }

  // Repos without any CI config get a gentle nudge, not an error.
  if (await pathExists(path.join(root, '.git'))) {
    const ciMarkers = [
      path.join('.github', 'workflows'),
      '.gitlab-ci.yml',
      path.join('.circleci', 'config.yml'),
      'azure-pipelines.yml',
      'Jenkinsfile'
    ];
    let hasCi = false;
    for (const marker of ciMarkers) {
      if (await pathExists(path.join(root, marker))) {
        hasCi = true;
        break;
      }
    }
    if (!hasCi) {
      warnings.push(
        warning(
          'no-ci-config',
          'info',
          'No CI configuration detected',
          'No GitHub Actions, GitLab CI, CircleCI, Azure Pipelines, or Jenkins config was found. Automated checks catch broken builds before review.'
        )
      );
    }
  }

  return warnings;
}
