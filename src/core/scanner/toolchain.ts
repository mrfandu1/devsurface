import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { PackageJsonInfo, ToolchainInfo } from '../types.js';

type ToolCategory = 'testRunner' | 'linter' | 'formatter' | 'bundler' | 'orm' | 'styling';

/** First match wins within a category, so list the most definitive tools first. */
const TOOLS: Record<ToolCategory, Array<{ packageName: string; label: string }>> = {
  testRunner: [
    { packageName: 'vitest', label: 'Vitest' },
    { packageName: 'jest', label: 'Jest' },
    { packageName: 'mocha', label: 'Mocha' },
    { packageName: 'ava', label: 'AVA' },
    { packageName: '@playwright/test', label: 'Playwright' },
    { packageName: 'cypress', label: 'Cypress' },
    { packageName: 'tap', label: 'node-tap' },
    { packageName: 'uvu', label: 'uvu' },
    { packageName: '@japa/runner', label: 'Japa' },
    { packageName: 'karma', label: 'Karma' }
  ],
  linter: [
    { packageName: 'eslint', label: 'ESLint' },
    { packageName: '@biomejs/biome', label: 'Biome' },
    { packageName: 'oxlint', label: 'Oxlint' },
    { packageName: 'standard', label: 'Standard' },
    { packageName: 'xo', label: 'XO' },
    { packageName: 'stylelint', label: 'Stylelint' }
  ],
  formatter: [
    { packageName: 'prettier', label: 'Prettier' },
    { packageName: '@biomejs/biome', label: 'Biome' },
    { packageName: 'dprint', label: 'dprint' }
  ],
  bundler: [
    { packageName: 'vite', label: 'Vite' },
    { packageName: 'webpack', label: 'webpack' },
    { packageName: 'rollup', label: 'Rollup' },
    { packageName: 'esbuild', label: 'esbuild' },
    { packageName: 'tsup', label: 'tsup' },
    { packageName: 'parcel', label: 'Parcel' },
    { packageName: 'rolldown', label: 'Rolldown' },
    { packageName: 'rspack', label: 'Rspack' },
    { packageName: 'turbopack', label: 'Turbopack' }
  ],
  orm: [
    { packageName: 'prisma', label: 'Prisma' },
    { packageName: 'drizzle-orm', label: 'Drizzle' },
    { packageName: 'typeorm', label: 'TypeORM' },
    { packageName: 'sequelize', label: 'Sequelize' },
    { packageName: 'mongoose', label: 'Mongoose' },
    { packageName: 'knex', label: 'Knex' },
    { packageName: 'kysely', label: 'Kysely' }
  ],
  styling: [
    { packageName: 'tailwindcss', label: 'Tailwind CSS' },
    { packageName: 'styled-components', label: 'styled-components' },
    { packageName: '@emotion/react', label: 'Emotion' },
    { packageName: 'sass', label: 'Sass' },
    { packageName: 'less', label: 'Less' },
    { packageName: '@vanilla-extract/css', label: 'vanilla-extract' }
  ]
};

const CI_MARKERS: Array<{ marker: string; label: string }> = [
  { marker: path.join('.github', 'workflows'), label: 'GitHub Actions' },
  { marker: '.gitlab-ci.yml', label: 'GitLab CI' },
  { marker: path.join('.circleci', 'config.yml'), label: 'CircleCI' },
  { marker: 'azure-pipelines.yml', label: 'Azure Pipelines' },
  { marker: 'Jenkinsfile', label: 'Jenkins' },
  { marker: '.travis.yml', label: 'Travis CI' },
  { marker: path.join('.buildkite', 'pipeline.yml'), label: 'Buildkite' },
  { marker: 'bitbucket-pipelines.yml', label: 'Bitbucket Pipelines' },
  { marker: '.drone.yml', label: 'Drone CI' },
  { marker: 'cloudbuild.yaml', label: 'Google Cloud Build' },
  { marker: path.join('.woodpecker', 'pipeline.yml'), label: 'Woodpecker CI' }
];

export const EMPTY_TOOLCHAIN: ToolchainInfo = {
  testRunner: null,
  linter: null,
  formatter: null,
  bundler: null,
  orm: null,
  styling: null,
  ci: null,
  typescript: null,
  gitHooks: null,
  e2eRunner: null
};

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Identify the everyday tools a contributor will touch: tests, lint, format, build, data, styles, CI. */
export async function detectToolchain(
  root: string,
  packageJson: PackageJsonInfo | null
): Promise<ToolchainInfo> {
  const dependencies = {
    ...packageJson?.data.dependencies,
    ...packageJson?.data.devDependencies
  };

  const result: ToolchainInfo = { ...EMPTY_TOOLCHAIN };
  for (const category of Object.keys(TOOLS) as ToolCategory[]) {
    const found = TOOLS[category].find((tool) => dependencies[tool.packageName] !== undefined);
    result[category] = found?.label ?? null;
  }

  for (const ci of CI_MARKERS) {
    if (await pathExists(path.join(root, ci.marker))) {
      result.ci = ci.label;
      break;
    }
  }

  result.typescript = typeof dependencies.typescript === 'string' ? dependencies.typescript : null;

  const e2eTools = [
    { packageName: '@playwright/test', label: 'Playwright' },
    { packageName: 'cypress', label: 'Cypress' },
    { packageName: 'webdriverio', label: 'WebdriverIO' },
    { packageName: 'puppeteer', label: 'Puppeteer' },
    { packageName: 'nightwatch', label: 'Nightwatch' }
  ];
  result.e2eRunner =
    e2eTools.find((tool) => dependencies[tool.packageName] !== undefined)?.label ?? null;

  result.gitHooks = null;
  if (dependencies.husky !== undefined || (await pathExists(path.join(root, '.husky')))) {
    result.gitHooks = 'Husky';
  } else if (
    dependencies.lefthook !== undefined ||
    (await pathExists(path.join(root, 'lefthook.yml')))
  ) {
    result.gitHooks = 'lefthook';
  } else if (await pathExists(path.join(root, '.pre-commit-config.yaml'))) {
    result.gitHooks = 'pre-commit';
  } else if (dependencies['simple-git-hooks'] !== undefined) {
    result.gitHooks = 'simple-git-hooks';
  }

  return result;
}

/**
 * The Node version this project asks for, from engines.node, .nvmrc, or
 * .node-version (in that priority order).
 */
export async function detectNodeRequirement(
  root: string,
  packageJson: PackageJsonInfo | null
): Promise<string | null> {
  const engines = packageJson?.data.engines?.node;
  if (typeof engines === 'string' && engines.trim().length > 0) {
    return engines.trim();
  }

  for (const file of ['.nvmrc', '.node-version']) {
    try {
      const content = (await fs.readFile(path.join(root, file), 'utf8')).trim();
      if (content.length > 0 && content.length <= 32) {
        return content;
      }
    } catch {
      // Try the next candidate.
    }
  }

  return null;
}
