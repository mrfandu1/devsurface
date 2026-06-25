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
  return [
    ...nodePresets(options.framework, options.packageJson),
    ...(await pythonPresets(options.root, options.language)),
    ...goPresets(options.language),
    ...(await javaPresets(options.language))
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
