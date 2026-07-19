import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { exploreEnvUsage } from '../src/core/env/usage.js';
import type { EnvInfo } from '../src/core/types.js';
import { makeTempProject, removeTempProject } from './testUtils.js';

function envInfo(exampleKeys: string[], localKeys: string[]): EnvInfo {
  return {
    examplePath: '.env.example',
    localPath: '.env',
    hasExample: true,
    hasLocal: true,
    exampleKeys,
    localKeys,
    missingKeys: [],
    emptyKeys: [],
    extraKeys: [],
    keys: []
  };
}

describe('exploreEnvUsage', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('finds env reads and cross-references declarations', async () => {
    await fs.writeFile(
      path.join(root, 'app.ts'),
      [
        'const url = process.env.DATABASE_URL;',
        'const key = process.env["API_KEY"];',
        'console.log(process.env.API_KEY);'
      ].join('\n')
    );
    const report = await exploreEnvUsage(
      root,
      envInfo(['DATABASE_URL'], ['DATABASE_URL', 'UNUSED'])
    );

    const apiKey = report.used.find((u) => u.key === 'API_KEY');
    expect(apiKey?.count).toBe(2);
    expect(apiKey?.declaredInExample).toBe(false);

    expect(report.undocumented).toContain('API_KEY');
    expect(report.unused).toContain('UNUSED');
  });

  it('supports python and go env access', async () => {
    await fs.writeFile(path.join(root, 'a.py'), 'x = os.environ["SECRET_TOKEN"]\n');
    await fs.writeFile(path.join(root, 'b.go'), 'v := os.Getenv("GO_FLAG")\n');
    const report = await exploreEnvUsage(root, null);
    const keys = report.used.map((u) => u.key);
    expect(keys).toContain('SECRET_TOKEN');
    expect(keys).toContain('GO_FLAG');
  });

  it('does not treat well-known keys as undocumented', async () => {
    await fs.writeFile(path.join(root, 'a.ts'), 'if (process.env.NODE_ENV) {}\n');
    const report = await exploreEnvUsage(root, null);
    expect(report.undocumented).not.toContain('NODE_ENV');
  });
});
