import { promises as fs } from 'node:fs';
import path from 'node:path';
import { extractScriptReferences } from '../documentation.js';
import { extractComposeEnvRefs } from '../docker/envRefs.js';
import { findSuspiciousExampleKeys } from '../env/secrets.js';
import { inspectTsconfigStrictness } from '../scanner/tsconfig.js';
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

/**
 * Extract the minimum required Node major from a simple engines range like
 * ">=18", "^20.10.0", "18.x", or ">=18 <21". Returns null for ranges that are
 * too complex to judge safely (e.g. containing "||").
 */
export function minimumNodeMajor(range: string): number | null {
  const trimmed = range.trim();
  if (trimmed.length === 0 || trimmed.includes('||')) {
    return null;
  }
  const match = /^(?:>=|\^|~|=)?\s*v?(\d+)/.exec(trimmed);
  return match === null ? null : Number(match[1]);
}

/** True when semver-ish `candidate` is strictly lower than `reference`. */
export function isVersionBehind(candidate: string, reference: string): boolean {
  const parse = (value: string): number[] | null => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(value.trim());
    return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])];
  };
  const left = parse(candidate);
  const right = parse(reference);
  if (left === null || right === null) {
    return false;
  }
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) {
      return left[index] < right[index];
    }
  }
  return false;
}

/**
 * The local file a script executes directly ("node scripts/build.js"), or
 * null. Generated output directories are skipped: they legitimately do not
 * exist before a build.
 */
export function scriptFileTarget(command: string): string | null {
  const match =
    /^(?:node|tsx|ts-node|python3?|bash|sh)\s+((?:\.\/)?[\w./-]+\.(?:js|cjs|mjs|ts|mts|py|sh))(?:\s|$)/.exec(
      command.trim()
    );
  if (match === null) {
    return null;
  }
  const target = match[1].replace(/^\.\//, '');
  if (/^(dist|build|out|action|coverage|\.next)\//.test(target)) {
    return null;
  }
  return target;
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
      // A four-line README leaves newcomers guessing what the project even is.
      if (readme.trim().length < 300) {
        warnings.push(
          warning(
            'short-readme',
            'info',
            'README is very short',
            'The README is under 300 characters. A sentence on what the project does, how to install it, and how to run it goes a long way for new contributors.'
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

  // A lockfile older than package.json usually means an install was skipped.
  if (result.dependencies?.lockfileStale === true && result.dependencies.lockfile !== null) {
    warnings.push(
      warning(
        'stale-lockfile',
        'warning',
        'Lockfile may be out of date',
        `package.json was modified after ${result.dependencies.lockfile}. Run the project install command to bring the lockfile back in sync.`
      )
    );
  }

  // engines.node vs the Node actually running devsurface.
  const enginesRange = result.packageJson?.data.engines?.node;
  if (isNodeProject && typeof enginesRange === 'string') {
    const requiredMajor = minimumNodeMajor(enginesRange);
    const runningMajor = Number(/^v?(\d+)/.exec(process.version)?.[1]);
    if (requiredMajor !== null && Number.isFinite(runningMajor) && runningMajor < requiredMajor) {
      warnings.push(
        warning(
          'engines-node-mismatch',
          'warning',
          'Node version below the required range',
          `package.json requires Node "${enginesRange.trim()}" but Node ${process.version} is running. Installs and scripts may fail until you switch versions.`
        )
      );
    }
  }

  // Keys used locally but missing from the example never reach new machines.
  if (result.env && result.env.extraKeys.length > 0 && result.env.hasExample) {
    warnings.push(
      warning(
        'undocumented-env-keys',
        'info',
        'Env keys missing from .env.example',
        `Keys in .env but not in .env.example: ${result.env.extraKeys.join(', ')}. Add them to the example (without values) so other machines know they exist.`
      )
    );
  }

  // A local .env without a committed example makes onboarding guesswork.
  if (result.env?.hasLocal && !result.env.hasExample) {
    warnings.push(
      warning(
        'missing-env-example',
        'info',
        'No .env.example',
        'A local .env exists but there is no .env.example. Committing an example (keys only, no values) tells new contributors which settings they need.'
      )
    );
  }

  // Public-looking repos without a license leave reuse rights unclear.
  if (result.git !== null && !result.license.exists) {
    warnings.push(
      warning(
        'missing-license',
        'info',
        'No LICENSE file',
        'No LICENSE, LICENSE.md, or COPYING file was found. Without one, others technically have no permission to use the code.'
      )
    );
  }

  // Branch behind its upstream: pull before building on stale code.
  if (typeof result.git?.behind === 'number' && result.git.behind > 0) {
    warnings.push(
      warning(
        'git-behind-upstream',
        'info',
        'Branch is behind its upstream',
        `This branch is ${result.git.behind} commit${result.git.behind === 1 ? '' : 's'} behind its upstream. Pull the latest changes before starting new work.`
      )
    );
  }

  // Real-looking secrets in .env.example are committed to the repository.
  if (result.env?.hasExample && result.env.examplePath !== null) {
    const exampleContent = await readIfPresent(result.env.examplePath);
    if (exampleContent !== null) {
      const suspicious = findSuspiciousExampleKeys(exampleContent);
      if (suspicious.length > 0) {
        warnings.push(
          warning(
            'secret-in-env-example',
            'error',
            '.env.example may contain real secrets',
            `These keys hold values that look like real credentials, not placeholders: ${suspicious.join(', ')}. .env.example is committed — replace the values with placeholders and rotate anything that leaked.`,
            result.env.examplePath
          )
        );
      }
    }
  }

  // Compose files referencing ${VARS} that no local env defines fail at "docker compose up".
  if (result.docker !== null && result.env?.hasLocal) {
    const definedKeys = new Set(result.env.localKeys);
    const missingRefs = new Set<string>();
    for (const composeFile of result.docker.composeFiles) {
      const content = await readIfPresent(composeFile);
      if (content === null) {
        continue;
      }
      for (const ref of extractComposeEnvRefs(content)) {
        if (!ref.hasDefault && !definedKeys.has(ref.name) && process.env[ref.name] === undefined) {
          missingRefs.add(ref.name);
        }
      }
    }
    if (missingRefs.size > 0) {
      warnings.push(
        warning(
          'compose-env-missing',
          'warning',
          'Compose file uses undefined environment variables',
          `Docker Compose references ${[...missingRefs].join(', ')} with no default, but .env does not define ${missingRefs.size === 1 ? 'it' : 'them'}. "docker compose up" will substitute empty strings.`
        )
      );
    }
  }

  // TypeScript without strict mode silently allows a class of bugs.
  if (isNodeProject) {
    const tsconfigContent = await readIfPresent(path.join(root, 'tsconfig.json'));
    if (tsconfigContent !== null) {
      const strictness = inspectTsconfigStrictness(tsconfigContent);
      if (strictness.strict === false) {
        warnings.push(
          warning(
            'tsconfig-strict-off',
            'info',
            'TypeScript strict mode is off',
            'tsconfig.json does not enable "strict". Turning it on catches null/undefined mistakes at compile time; enable it early — retrofitting later is much harder.'
          )
        );
      }
    }
  }

  // A Node runtime past end-of-life stops getting security fixes.
  {
    const runningMajor = Number(/^v?(\d+)/.exec(process.version)?.[1]);
    if (Number.isFinite(runningMajor) && runningMajor < 20) {
      warnings.push(
        warning(
          'node-end-of-life',
          'warning',
          'Node runtime is past end-of-life',
          `Node ${process.version} no longer receives security updates. Upgrade to an active LTS release.`
        )
      );
    }
  }

  // package.json metadata newcomers and registries rely on.
  if (result.packageJson !== null) {
    const data = result.packageJson.data as Record<string, unknown>;
    const missingFields = ['description', 'license'].filter(
      (field) => typeof data[field] !== 'string' || (data[field] as string).length === 0
    );
    if (missingFields.length > 0) {
      warnings.push(
        warning(
          'package-missing-fields',
          'info',
          'package.json is missing metadata',
          `No ${missingFields.join(' or ')} field in package.json. Registries and license scanners rely on these.`
        )
      );
    }

    // The same package pinned in both dependency blocks drifts silently.
    const runtimeDeps = Object.keys(result.packageJson.data.dependencies ?? {});
    const devDeps = new Set(Object.keys(result.packageJson.data.devDependencies ?? {}));
    const duplicates = runtimeDeps.filter((name) => devDeps.has(name));
    if (duplicates.length > 0) {
      warnings.push(
        warning(
          'duplicate-dependencies',
          'warning',
          'Packages listed in dependencies and devDependencies',
          `${duplicates.join(', ')} appear${duplicates.length === 1 ? 's' : ''} in both blocks. Keep each package in exactly one so versions cannot drift apart.`
        )
      );
    }

    // "*" and "latest" versions make installs unreproducible.
    const allDeps = {
      ...result.packageJson.data.dependencies,
      ...result.packageJson.data.devDependencies
    };
    const wildcards = Object.entries(allDeps)
      .filter(([, version]) => version === '*' || version === 'latest')
      .map(([name]) => name);
    if (wildcards.length > 0) {
      warnings.push(
        warning(
          'wildcard-dependency-versions',
          'warning',
          'Wildcard dependency versions',
          `${wildcards.join(', ')} use${wildcards.length === 1 ? 's' : ''} "*" or "latest". Every install may pull a different version — pin a range instead.`
        )
      );
    }
  }

  // CHANGELOG left behind after a version bump.
  if (
    result.changelog?.exists === true &&
    result.changelog.latestVersion !== null &&
    typeof result.packageJson?.data.version === 'string' &&
    isVersionBehind(result.changelog.latestVersion, result.packageJson.data.version)
  ) {
    warnings.push(
      warning(
        'changelog-behind',
        'warning',
        'CHANGELOG is behind package.json',
        `package.json is at ${result.packageJson.data.version} but the newest CHANGELOG entry is ${result.changelog.latestVersion}. Add a changelog entry for the current version.`
      )
    );
  }

  // node_modules committed to git bloats every clone.
  if (isNodeProject && (await pathExists(path.join(root, '.git')))) {
    const gitignore = (await readIfPresent(path.join(root, '.gitignore'))) ?? '';
    const coversNodeModules = gitignore
      .split(/\r?\n/)
      .map((line) => line.trim())
      .some(
        (line) => line === 'node_modules' || line === 'node_modules/' || line === '/node_modules'
      );
    if (!coversNodeModules) {
      warnings.push(
        warning(
          'node-modules-not-gitignored',
          'warning',
          'node_modules is not in .gitignore',
          'Add "node_modules/" to .gitignore — committing installed packages bloats the repository and breaks cross-platform installs.'
        )
      );
    }
  }

  // Un-pinned base images silently change under you.
  const baseImage = result.docker?.baseImage;
  if (
    typeof baseImage === 'string' &&
    (baseImage.endsWith(':latest') || !baseImage.includes(':'))
  ) {
    warnings.push(
      warning(
        'dockerfile-latest-tag',
        'info',
        'Dockerfile base image is not pinned',
        `The Dockerfile builds FROM "${baseImage}", which floats to whatever is newest. Pin a version tag (for example node:20-alpine) for reproducible builds.`
      )
    );
  }

  // Scripts pointing at files that do not exist fail on first run.
  {
    const missingTargets: string[] = [];
    for (const [name, command] of Object.entries(result.scripts)) {
      const target = scriptFileTarget(command);
      if (target !== null && !(await pathExists(path.join(root, target)))) {
        missingTargets.push(`${name} → ${target}`);
      }
    }
    if (missingTargets.length > 0) {
      warnings.push(
        warning(
          'script-missing-file',
          'warning',
          'Scripts reference missing files',
          `These scripts point at files that do not exist: ${missingTargets.join('; ')}.`
        )
      );
    }
  }

  // package.json license field disagreeing with the LICENSE file confuses scanners.
  {
    const declared = result.packageJson?.data as { license?: unknown } | undefined;
    const declaredLicense = typeof declared?.license === 'string' ? declared.license : null;
    if (
      declaredLicense !== null &&
      result.licenseType != null &&
      !declaredLicense.toLowerCase().startsWith(result.licenseType.toLowerCase().split('-')[0])
    ) {
      warnings.push(
        warning(
          'license-mismatch',
          'warning',
          'License field disagrees with the LICENSE file',
          `package.json says "${declaredLicense}" but the LICENSE file looks like ${result.licenseType}. Align them so tooling reports the right license.`
        )
      );
    }
  }

  // Test files with no way to run them.
  if (
    isNodeProject &&
    typeof result.testFileCount === 'number' &&
    result.testFileCount > 0 &&
    result.scripts.test === undefined
  ) {
    warnings.push(
      warning(
        'tests-without-script',
        'info',
        'Test files exist but there is no test script',
        `${result.testFileCount} test file${result.testFileCount === 1 ? '' : 's'} found, but package.json has no "test" script to run them.`
      )
    );
  }

  // The default npm placeholder test script fails on purpose.
  if (result.scripts.test?.includes('no test specified')) {
    warnings.push(
      warning(
        'placeholder-test-script',
        'warning',
        'Test script is the npm placeholder',
        'The "test" script still says "no test specified" and exits with an error. Wire it to a real test runner or remove it.'
      )
    );
  }

  // .nvmrc and engines.node pinning different majors sends contributors in circles.
  if (isNodeProject) {
    const nvmrc = (await readIfPresent(path.join(root, '.nvmrc')))?.trim();
    const engines = result.packageJson?.data.engines?.node;
    const nvmrcMajor = nvmrc === undefined ? null : /^v?(\d+)/.exec(nvmrc)?.[1];
    const enginesMajor =
      typeof engines === 'string' ? String(minimumNodeMajor(engines) ?? '') : null;
    if (
      nvmrcMajor != null &&
      enginesMajor !== null &&
      enginesMajor.length > 0 &&
      nvmrcMajor !== enginesMajor
    ) {
      warnings.push(
        warning(
          'nvmrc-engines-conflict',
          'warning',
          '.nvmrc and engines.node disagree',
          `.nvmrc pins Node ${nvmrc} but engines.node says "${engines}". Pick one source of truth so version managers and installers agree.`
        )
      );
    }
  }

  // Obsolete top-level "version:" key in Compose files.
  if (result.docker !== null) {
    for (const composeFile of result.docker.composeFiles) {
      const content = await readIfPresent(composeFile);
      if (content !== null && /^version\s*:/m.test(content)) {
        warnings.push(
          warning(
            'compose-version-obsolete',
            'info',
            'Compose file uses the obsolete version field',
            'The top-level "version:" key is ignored by modern Docker Compose and prints a warning. It can be deleted.'
          )
        );
        break;
      }
    }
  }

  // Scripts calling tools that are not declared as dependencies rely on global installs.
  {
    const KNOWN_TOOL_PACKAGES: Record<string, string[]> = {
      eslint: ['eslint'],
      prettier: ['prettier'],
      vitest: ['vitest'],
      jest: ['jest'],
      tsc: ['typescript'],
      tsup: ['tsup'],
      vite: ['vite'],
      webpack: ['webpack'],
      playwright: ['@playwright/test', 'playwright'],
      cypress: ['cypress'],
      tsx: ['tsx'],
      nodemon: ['nodemon']
    };
    const allDeps = new Set(
      Object.keys({
        ...result.packageJson?.data.dependencies,
        ...result.packageJson?.data.devDependencies
      })
    );
    const missingTools = new Set<string>();
    for (const command of Object.values(result.scripts)) {
      const firstWord = command.trim().split(/\s+/)[0];
      const providers = KNOWN_TOOL_PACKAGES[firstWord];
      if (providers !== undefined && !providers.some((provider) => allDeps.has(provider))) {
        missingTools.add(firstWord);
      }
    }
    if (missingTools.size > 0 && result.packageJson !== null) {
      warnings.push(
        warning(
          'tool-not-in-deps',
          'warning',
          'Scripts use tools that are not dependencies',
          `${[...missingTools].join(', ')} ${missingTools.size === 1 ? 'is' : 'are'} called by scripts but not listed in dependencies, so fresh installs rely on global tools. Add ${missingTools.size === 1 ? 'it' : 'them'} to devDependencies.`
        )
      );
    }
  }

  // Formatter/linter config files whose tool is not installed.
  if (result.packageJson !== null) {
    const allDeps = new Set(
      Object.keys({
        ...result.packageJson.data.dependencies,
        ...result.packageJson.data.devDependencies
      })
    );
    const orphans: string[] = [];
    const prettierConfigs = ['.prettierrc', '.prettierrc.json', 'prettier.config.js'];
    if (!allDeps.has('prettier')) {
      for (const configFile of prettierConfigs) {
        if (await pathExists(path.join(root, configFile))) {
          orphans.push(`${configFile} (prettier)`);
          break;
        }
      }
    }
    const eslintConfigs = [
      '.eslintrc',
      '.eslintrc.json',
      '.eslintrc.cjs',
      'eslint.config.js',
      'eslint.config.mjs'
    ];
    if (!allDeps.has('eslint')) {
      for (const configFile of eslintConfigs) {
        if (await pathExists(path.join(root, configFile))) {
          orphans.push(`${configFile} (eslint)`);
          break;
        }
      }
    }
    if (orphans.length > 0) {
      warnings.push(
        warning(
          'orphan-tool-config',
          'warning',
          'Tool config without the tool installed',
          `Found ${orphans.join(', ')} but the matching package is not in dependencies. Install it or delete the config.`
        )
      );
    }
  }

  // Configured launch entries that match nothing runnable.
  {
    const launch = result.config?.config.launch ?? [];
    if (launch.length > 0) {
      const allCommands = { ...result.presetCommands, ...(result.config?.config.commands ?? {}) };
      const unknown = launch.filter(
        (entry) =>
          entry !== 'docker' &&
          entry !== 'docker:up' &&
          result.scripts[entry] === undefined &&
          allCommands[entry] === undefined
      );
      if (unknown.length > 0) {
        warnings.push(
          warning(
            'launch-unknown-entries',
            'warning',
            'Launch sequence references unknown commands',
            `These launch entries match no script or configured command: ${unknown.join(', ')}.`,
            result.config?.path
          )
        );
      }
    }
  }

  // Duplicate configured ports are usually a copy-paste slip.
  {
    const configPorts = result.config?.config.ports ?? [];
    if (new Set(configPorts).size !== configPorts.length) {
      warnings.push(
        warning(
          'duplicate-config-ports',
          'info',
          'Duplicate ports in devsurface.config.json',
          'The ports array lists the same port more than once.',
          result.config?.path
        )
      );
    }
  }

  // An example env file with no keys documents nothing.
  if (result.env?.hasExample && result.env.exampleKeys.length === 0) {
    warnings.push(
      warning(
        'empty-env-example',
        'info',
        '.env.example declares no keys',
        'The example env file exists but contains no KEY=value lines, so it does not tell contributors anything.',
        result.env.examplePath ?? undefined
      )
    );
  }

  // Names npm would reject block publishing and some tooling.
  {
    const name = result.packageJson?.data.name;
    if (
      typeof name === 'string' &&
      name.length > 0 &&
      !/^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(name)
    ) {
      warnings.push(
        warning(
          'invalid-package-name',
          'warning',
          'package.json name is not npm-valid',
          `"${name}" contains characters npm rejects (uppercase letters, spaces, …). Rename it to lowercase kebab-case.`
        )
      );
    }
  }

  // A README without a title renders poorly everywhere.
  if (result.readme.exists) {
    const readmeContent = await readIfPresent(result.readme.path);
    if (readmeContent !== null && !/^#\s+\S|^<h1/m.test(readmeContent)) {
      warnings.push(
        warning(
          'readme-no-title',
          'info',
          'README has no top-level heading',
          'Add a "# Project Name" heading so the README renders with a title on GitHub and in editors.'
        )
      );
    }
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
