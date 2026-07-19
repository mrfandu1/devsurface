import { describe, expect, it } from 'vitest';
import {
  analyzeScripts,
  findScriptIssues,
  findScriptReferences
} from '../src/core/scripts/index.js';
import { makeTempProject, removeTempProject } from './testUtils.js';

describe('findScriptReferences', () => {
  it('extracts npm/pnpm/yarn run targets', () => {
    expect(findScriptReferences('npm run build && npm run test')).toEqual(['build', 'test']);
    expect(findScriptReferences('pnpm run lint')).toEqual(['lint']);
    expect(findScriptReferences('yarn build')).toEqual(['build']);
  });

  it('ignores package-manager subcommands', () => {
    expect(findScriptReferences('yarn install')).toEqual([]);
  });
});

describe('findScriptIssues', () => {
  it('flags non-portable env var syntax', () => {
    expect(findScriptIssues('NODE_ENV=production node app.js')[0]).toContain('Windows');
  });

  it('flags rm -rf without rimraf', () => {
    expect(findScriptIssues('rm -rf dist').some((i) => i.includes('rm -rf'))).toBe(true);
    expect(findScriptIssues('rimraf dist')).toHaveLength(0);
  });

  it('accepts cross-env-wrapped commands', () => {
    expect(findScriptIssues('cross-env NODE_ENV=production node app.js')).toHaveLength(0);
  });
});

describe('analyzeScripts', () => {
  it('detects chains, hooks, orphans, and missing references', async () => {
    const root = await makeTempProject();
    const scripts = {
      build: 'tsc',
      prebuild: 'npm run clean',
      clean: 'rimraf dist',
      ci: 'npm run build && npm run missing',
      random: 'echo hi'
    };
    const report = await analyzeScripts(root, scripts);

    const ci = report.insights.find((i) => i.name === 'ci');
    expect(ci?.calls).toContain('build');
    const build = report.insights.find((i) => i.name === 'build');
    expect(build?.hooks).toContain('prebuild');

    expect(report.missingReferences).toEqual([{ script: 'ci', missing: 'missing' }]);
    expect(report.orphans).toContain('random');
    expect(report.categories.build).toBeGreaterThanOrEqual(1);
    await removeTempProject(root);
  });
});
