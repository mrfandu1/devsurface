import { describe, expect, it } from 'vitest';
import { extractReadmeCommands } from '../src/core/documentation.js';
import { buildOnboardingPlan } from '../src/core/onboarding/index.js';
import type { ScanResult } from '../src/core/types.js';

const README = `
# My Project

Some prose about the project.

\`\`\`bash
$ npm install
npm run dev
# a comment that must be skipped
echo "not a known starter"
\`\`\`

\`\`\`js
const notACommand = true;
\`\`\`

\`\`\`
docker compose up -d
npm install
\`\`\`
`;

describe('extractReadmeCommands', () => {
  it('extracts deduplicated commands from bash and untagged fences only', () => {
    expect(extractReadmeCommands(README)).toEqual([
      'npm install',
      'npm run dev',
      'docker compose up -d'
    ]);
  });

  it('strips shell prompts and ignores long or unknown lines', () => {
    const content = '```sh\n$ pnpm install\n> pnpm run build\nunknowncmd --flag\n```';
    expect(extractReadmeCommands(content)).toEqual(['pnpm install', 'pnpm run build']);
  });

  it('returns nothing for prose-only readmes', () => {
    expect(extractReadmeCommands('Just words, no code fences.')).toEqual([]);
  });
});

function baseScan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    root: '/tmp/project',
    projectName: 'project',
    packageJson: { path: '/tmp/project/package.json', data: { name: 'project' } },
    packageManager: 'npm',
    language: { primary: 'node', detected: ['node'], files: ['package.json'] },
    scripts: {},
    env: null,
    docker: null,
    git: null,
    framework: null,
    presets: [],
    presetCommands: {},
    presetGroups: {},
    ports: [],
    readme: { path: null, exists: false },
    license: { path: null, exists: false },
    monorepo: null,
    dependencies: null,
    toolchain: {
      testRunner: null,
      linter: null,
      formatter: null,
      bundler: null,
      orm: null,
      styling: null,
      ci: null
    },
    nodeRequirement: null,
    readmeCommands: [],
    config: null,
    ...overrides
  };
}

describe('onboarding README steps', () => {
  it('adds README quick-start commands as manual steps', () => {
    const plan = buildOnboardingPlan(
      baseScan({ readmeCommands: ['npm install', 'npm run dev'] }),
      []
    );
    const readmeSteps = plan.steps.filter((step) => step.id.startsWith('readme-'));
    expect(readmeSteps.map((step) => step.title)).toEqual(['npm install', 'npm run dev']);
    expect(readmeSteps.every((step) => !step.blocking)).toBe(true);
  });

  it('skips README steps when a maintainer setup guide exists', () => {
    const plan = buildOnboardingPlan(
      baseScan({
        readmeCommands: ['npm install'],
        config: {
          path: '/tmp/project/devsurface.config.json',
          config: { setupGuide: ['Follow the wiki'] },
          warnings: []
        }
      }),
      []
    );
    expect(plan.steps.some((step) => step.id.startsWith('readme-'))).toBe(false);
  });
});
