import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { FrameworkInfo, PackageJsonInfo, PresetInfo, ProjectLanguageInfo } from '../types.js';

type PresetDraft = Omit<PresetInfo, 'commands' | 'groups' | 'ports'> & {
  commands?: Record<string, string>;
  groups?: Record<string, string[]>;
  ports?: number[];
};

function dependencyNames(packageJson: PackageJsonInfo | null): Set<string> {
  const data = packageJson?.data;
  return new Set(
    Object.keys({
      ...data?.dependencies,
      ...data?.devDependencies,
      ...data?.optionalDependencies,
      ...data?.peerDependencies
    })
  );
}

function hasAnyDependency(dependencies: Set<string>, names: string[]): boolean {
  return names.some((name) => dependencies.has(name));
}

async function readIfPresent(root: string, candidate: string): Promise<string | null> {
  const filePath = path.join(root, candidate);
  try {
    const [realRoot, realPath] = await Promise.all([fs.realpath(root), fs.realpath(filePath)]);
    const relative = path.relative(realRoot, realPath);
    if (relative.startsWith('..') || path.isAbsolute(relative)) {
      return null;
    }
    return await fs.readFile(realPath, 'utf8');
  } catch {
    return null;
  }
}

function completePreset(draft: PresetDraft): PresetInfo {
  return {
    name: draft.name,
    label: draft.label,
    commands: draft.commands ?? {},
    groups: draft.groups ?? {},
    ports: draft.ports ?? []
  };
}

function nodePresets(
  framework: FrameworkInfo | null,
  packageJson: PackageJsonInfo | null
): PresetInfo[] {
  const detected = new Set(framework?.detected ?? []);
  const dependencies = dependencyNames(packageJson);
  const presets: PresetDraft[] = [];

  if (detected.has('Next.js')) {
    presets.push({
      name: 'next',
      label: 'Next.js',
      commands: {
        'next:dev': 'next dev',
        'next:build': 'next build',
        'next:start': 'next start'
      },
      groups: {
        'Next.js': ['next:dev', 'next:build', 'next:start']
      },
      ports: [3000]
    });
  }

  if (detected.has('Vite')) {
    presets.push({
      name: 'vite',
      label: 'Vite',
      commands: {
        'vite:dev': 'vite --host 127.0.0.1',
        'vite:build': 'vite build',
        'vite:preview': 'vite preview --host 127.0.0.1'
      },
      groups: {
        Vite: ['vite:dev', 'vite:build', 'vite:preview']
      },
      ports: [5173, 4173]
    });
  }

  if (detected.has('NestJS')) {
    presets.push({
      name: 'nestjs',
      label: 'NestJS',
      commands: {
        'nest:start': 'nest start --watch',
        'nest:build': 'nest build'
      },
      groups: {
        NestJS: ['nest:start', 'nest:build']
      },
      ports: [3000]
    });
  }

  if (detected.has('Remix')) {
    presets.push({
      name: 'remix',
      label: 'Remix',
      commands: {
        'remix:dev': 'remix vite:dev',
        'remix:build': 'remix vite:build'
      },
      groups: {
        Remix: ['remix:dev', 'remix:build']
      },
      ports: [5173]
    });
  }

  if (detected.has('Express') || detected.has('Fastify')) {
    presets.push({
      name: detected.has('Fastify') ? 'fastify' : 'express',
      label: detected.has('Fastify') ? 'Fastify' : 'Express',
      ports: [3000]
    });
  }

  if (detected.has('Prisma') || hasAnyDependency(dependencies, ['prisma', '@prisma/client'])) {
    presets.push({
      name: 'prisma',
      label: 'Prisma',
      commands: {
        'prisma:migrate': 'prisma migrate dev',
        'prisma:studio': 'prisma studio'
      },
      groups: {
        Database: ['prisma:migrate', 'prisma:studio']
      },
      ports: [5555]
    });
  }

  return presets.map(completePreset);
}

async function pythonPresets(root: string, language: ProjectLanguageInfo): Promise<PresetInfo[]> {
  if (!language.detected.includes('python')) {
    return [];
  }

  const [requirements, pyproject, pipfile] = await Promise.all([
    readIfPresent(root, 'requirements.txt'),
    readIfPresent(root, 'pyproject.toml'),
    readIfPresent(root, 'Pipfile')
  ]);
  const manifest = [requirements, pyproject, pipfile].filter(Boolean).join('\n').toLowerCase();
  const commands: Record<string, string> = {};
  const groups: Record<string, string[]> = {};
  const ports: number[] = [];

  if (requirements !== null) {
    commands['python:install'] = 'python -m pip install -r requirements.txt';
    groups.Setup = ['python:install'];
  }

  if (manifest.includes('uvicorn') || manifest.includes('fastapi')) {
    commands['python:dev'] = 'uvicorn main:app --reload --host 127.0.0.1';
    groups.Python = [...(groups.Python ?? []), 'python:dev'];
    ports.push(8000);
  }

  if (manifest.includes('flask')) {
    commands['flask:dev'] = 'flask --app app run --host 127.0.0.1';
    groups.Python = [...(groups.Python ?? []), 'flask:dev'];
    ports.push(5000);
  }

  if (manifest.includes('django') || (await readIfPresent(root, 'manage.py')) !== null) {
    commands['django:dev'] = 'python manage.py runserver 127.0.0.1:8000';
    commands['django:migrate'] = 'python manage.py migrate';
    groups.Python = [...(groups.Python ?? []), 'django:dev', 'django:migrate'];
    ports.push(8000);
  }

  return [
    completePreset({
      name: 'python',
      label: 'Python',
      commands,
      groups,
      ports
    })
  ];
}

function goPresets(language: ProjectLanguageInfo): PresetInfo[] {
  if (!language.detected.includes('go')) {
    return [];
  }

  return [
    completePreset({
      name: 'go',
      label: 'Go',
      commands: {
        'go:run': 'go run .',
        'go:build': 'go build ./...',
        'go:test': 'go test ./...'
      },
      groups: {
        Go: ['go:run', 'go:build', 'go:test']
      }
    })
  ];
}

async function rustPresets(root: string, language: ProjectLanguageInfo): Promise<PresetInfo[]> {
  if (!language.detected.includes('rust')) {
    return [];
  }

  const commands: Record<string, string> = {
    'cargo:build': 'cargo build',
    'cargo:test': 'cargo test',
    'cargo:check': 'cargo check'
  };

  // Library-only crates and virtual workspaces have nothing to `cargo run`.
  const cargoToml = (await readIfPresent(root, 'Cargo.toml')) ?? '';
  const hasMain =
    (await readIfPresent(root, path.join('src', 'main.rs'))) !== null ||
    /^\[\[bin\]\]/m.test(cargoToml);
  if (hasMain) {
    commands['cargo:run'] = 'cargo run';
  }

  return [
    completePreset({
      name: 'rust',
      label: 'Rust',
      commands,
      groups: {
        Rust: Object.keys(commands)
      }
    })
  ];
}

async function phpPresets(root: string, language: ProjectLanguageInfo): Promise<PresetInfo[]> {
  if (!language.detected.includes('php')) {
    return [];
  }

  const commands: Record<string, string> = {
    'composer:install': 'composer install'
  };

  const composer = await readIfPresent(root, 'composer.json');
  if (composer !== null) {
    try {
      const data = JSON.parse(composer) as { scripts?: Record<string, unknown> };
      for (const name of Object.keys(data.scripts ?? {}).slice(0, 20)) {
        commands[`composer:${name}`] = `composer run ${name}`;
      }
    } catch {
      // Malformed composer.json still gets the install command.
    }
  }

  const ports: number[] = [];
  if ((await readIfPresent(root, 'artisan')) !== null) {
    commands['artisan:serve'] = 'php artisan serve --host 127.0.0.1';
    ports.push(8000);
  }

  return [
    completePreset({
      name: 'php',
      label: 'PHP',
      commands,
      groups: { PHP: Object.keys(commands) },
      ports
    })
  ];
}

async function rubyPresets(root: string, language: ProjectLanguageInfo): Promise<PresetInfo[]> {
  if (!language.detected.includes('ruby')) {
    return [];
  }

  const commands: Record<string, string> = {
    'bundle:install': 'bundle install'
  };
  const ports: number[] = [];

  const gemfile = ((await readIfPresent(root, 'Gemfile')) ?? '').toLowerCase();
  if (gemfile.includes('rails')) {
    commands['rails:server'] = 'bundle exec rails server -b 127.0.0.1';
    commands['rails:migrate'] = 'bundle exec rails db:migrate';
    ports.push(3000);
  }
  if (gemfile.includes('rspec')) {
    commands['rspec:test'] = 'bundle exec rspec';
  }

  return [
    completePreset({
      name: 'ruby',
      label: 'Ruby',
      commands,
      groups: { Ruby: Object.keys(commands) },
      ports
    })
  ];
}

// Recipes like `build:` or `build arg1:` at column zero; skips settings and comments.
const justfileRecipePattern = /^([A-Za-z_][\w-]*)(?:\s+[^:=]*)?:(?!=)/;

async function justfilePresets(root: string): Promise<PresetInfo[]> {
  const justfile =
    (await readIfPresent(root, 'justfile')) ??
    (await readIfPresent(root, 'Justfile')) ??
    (await readIfPresent(root, '.justfile'));
  if (justfile === null) {
    return [];
  }

  const recipes: string[] = [];
  for (const line of justfile.split(/\r?\n/)) {
    const match = justfileRecipePattern.exec(line);
    if (
      match !== null &&
      match[1] !== 'set' &&
      match[1] !== 'alias' &&
      !recipes.includes(match[1])
    ) {
      recipes.push(match[1]);
    }
    if (recipes.length >= 20) {
      break;
    }
  }
  if (recipes.length === 0) {
    return [];
  }

  const commands: Record<string, string> = {};
  for (const recipe of recipes) {
    commands[`just:${recipe}`] = `just ${recipe}`;
  }

  return [
    completePreset({
      name: 'just',
      label: 'Justfile',
      commands,
      groups: { Justfile: Object.keys(commands) }
    })
  ];
}

async function taskfilePresets(root: string): Promise<PresetInfo[]> {
  const taskfile =
    (await readIfPresent(root, 'Taskfile.yml')) ?? (await readIfPresent(root, 'Taskfile.yaml'));
  if (taskfile === null) {
    return [];
  }

  // Task names are two-space-indented keys under the top-level `tasks:` block.
  const tasks: string[] = [];
  let inTasks = false;
  for (const line of taskfile.split(/\r?\n/)) {
    if (/^tasks:\s*$/.test(line)) {
      inTasks = true;
      continue;
    }
    if (inTasks && /^\S/.test(line)) {
      break;
    }
    const match = inTasks ? /^ {2}([A-Za-z_][\w:-]*):\s*$/.exec(line) : null;
    if (match !== null && !tasks.includes(match[1])) {
      tasks.push(match[1]);
    }
    if (tasks.length >= 20) {
      break;
    }
  }
  if (tasks.length === 0) {
    return [];
  }

  const commands: Record<string, string> = {};
  for (const task of tasks) {
    commands[`task:${task}`] = `task ${task}`;
  }

  return [
    completePreset({
      name: 'taskfile',
      label: 'Taskfile',
      commands,
      groups: { Taskfile: Object.keys(commands) }
    })
  ];
}

async function denoPresets(root: string): Promise<PresetInfo[]> {
  const source =
    (await readIfPresent(root, 'deno.json')) ?? (await readIfPresent(root, 'deno.jsonc'));
  if (source === null) {
    return [];
  }

  let tasks: string[] = [];
  try {
    // Strip line comments so deno.jsonc parses; good enough for task names.
    const data = JSON.parse(source.replace(/^\s*\/\/.*$/gm, '')) as {
      tasks?: Record<string, unknown>;
    };
    tasks = Object.keys(data.tasks ?? {}).slice(0, 20);
  } catch {
    return [];
  }
  if (tasks.length === 0) {
    return [];
  }

  const commands: Record<string, string> = {};
  for (const task of tasks) {
    commands[`deno:${task}`] = `deno task ${task}`;
  }

  return [
    completePreset({
      name: 'deno',
      label: 'Deno',
      commands,
      groups: { Deno: Object.keys(commands) }
    })
  ];
}

async function gitHookPresets(root: string): Promise<PresetInfo[]> {
  const commands: Record<string, string> = {};

  if ((await readIfPresent(root, '.pre-commit-config.yaml')) !== null) {
    commands['pre-commit:install'] = 'pre-commit install';
    commands['pre-commit:run'] = 'pre-commit run --all-files';
  }

  if (
    (await readIfPresent(root, 'lefthook.yml')) !== null ||
    (await readIfPresent(root, 'lefthook.yaml')) !== null
  ) {
    commands['lefthook:install'] = 'lefthook install';
    commands['lefthook:run'] = 'lefthook run pre-commit';
  }

  if (Object.keys(commands).length === 0) {
    return [];
  }

  return [
    completePreset({
      name: 'git-hooks',
      label: 'Git hooks',
      commands,
      groups: { 'Git hooks': Object.keys(commands) }
    })
  ];
}

async function dockerfilePresets(root: string, projectName: string): Promise<PresetInfo[]> {
  if ((await readIfPresent(root, 'Dockerfile')) === null) {
    return [];
  }

  const image = projectName
    .toLowerCase()
    .replace(/[^a-z0-9_.-]+/g, '-')
    .replace(/^[-._]+/, '')
    .replace(/[-._]+$/, '');
  const tag = image.length > 0 ? image : 'app';

  return [
    completePreset({
      name: 'dockerfile',
      label: 'Docker image',
      commands: {
        'docker:build': `docker build -t ${tag} .`
      },
      groups: { Docker: ['docker:build'] }
    })
  ];
}

// Targets like `build:` at column zero; skips pattern rules, dot targets, and variable lines.
const makefileTargetPattern = /^([A-Za-z0-9][\w.-]*)\s*:(?!=)([^=]*)$/;

async function makefilePresets(root: string): Promise<PresetInfo[]> {
  const makefile =
    (await readIfPresent(root, 'Makefile')) ??
    (await readIfPresent(root, 'makefile')) ??
    (await readIfPresent(root, 'GNUmakefile'));
  if (makefile === null) {
    return [];
  }

  const targets: string[] = [];
  for (const line of makefile.split(/\r?\n/)) {
    const match = makefileTargetPattern.exec(line);
    if (match !== null && !targets.includes(match[1])) {
      targets.push(match[1]);
    }
    if (targets.length >= 20) {
      break;
    }
  }
  if (targets.length === 0) {
    return [];
  }

  const commands: Record<string, string> = {};
  for (const target of targets) {
    commands[`make:${target}`] = `make ${target}`;
  }

  return [
    completePreset({
      name: 'make',
      label: 'Makefile',
      commands,
      groups: {
        Makefile: Object.keys(commands)
      }
    })
  ];
}

async function javaPresets(language: ProjectLanguageInfo): Promise<PresetInfo[]> {
  if (!language.detected.includes('java')) {
    return [];
  }

  const hasMaven = language.files.some((file) => path.basename(file) === 'pom.xml');
  const hasGradle = language.files.some((file) => path.basename(file).startsWith('build.gradle'));
  const commands: Record<string, string> = {};
  const groups: Record<string, string[]> = {};

  if (hasMaven) {
    commands['maven:test'] = 'mvn test';
    commands['maven:package'] = 'mvn package';
    groups.Maven = ['maven:test', 'maven:package'];
  }

  if (hasGradle) {
    commands['gradle:test'] = 'gradle test';
    commands['gradle:build'] = 'gradle build';
    groups.Gradle = ['gradle:test', 'gradle:build'];
  }

  return [completePreset({ name: 'java', label: 'Java', commands, groups })];
}

export async function detectPresets(options: {
  root: string;
  packageJson: PackageJsonInfo | null;
  framework: FrameworkInfo | null;
  language: ProjectLanguageInfo;
}): Promise<PresetInfo[]> {
  const projectName = options.packageJson?.data.name ?? path.basename(path.resolve(options.root));
  return [
    ...nodePresets(options.framework, options.packageJson),
    ...(await pythonPresets(options.root, options.language)),
    ...goPresets(options.language),
    ...(await rustPresets(options.root, options.language)),
    ...(await phpPresets(options.root, options.language)),
    ...(await rubyPresets(options.root, options.language)),
    ...(await javaPresets(options.language)),
    ...(await makefilePresets(options.root)),
    ...(await justfilePresets(options.root)),
    ...(await taskfilePresets(options.root)),
    ...(await denoPresets(options.root)),
    ...(await gitHookPresets(options.root)),
    ...(await dockerfilePresets(options.root, projectName))
  ].filter(
    (preset) =>
      Object.keys(preset.commands).length > 0 ||
      Object.keys(preset.groups).length > 0 ||
      preset.ports.length > 0
  );
}

export function mergePresetCommands(presets: PresetInfo[]): Record<string, string> {
  return Object.assign({}, ...presets.map((preset) => preset.commands));
}

export function mergePresetGroups(presets: PresetInfo[]): Record<string, string[]> {
  const groups: Record<string, string[]> = {};
  for (const preset of presets) {
    for (const [group, commands] of Object.entries(preset.groups)) {
      groups[group] = [...(groups[group] ?? []), ...commands];
    }
  }
  return groups;
}
