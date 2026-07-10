import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectEnv } from '../src/core/scanner/env.js';
import { runDoctor } from '../src/core/doctor/index.js';
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

describe('env extra (undocumented) keys', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('reports keys in .env that the example does not document', async () => {
    await fs.writeFile(path.join(root, '.env.example'), 'API_KEY=\n', 'utf8');
    await fs.writeFile(
      path.join(root, '.env'),
      'API_KEY=secret\nSECRET_FLAG=1\nDEBUG_MODE=true\n',
      'utf8'
    );

    const env = await detectEnv(root);
    expect(env?.extraKeys).toEqual(['SECRET_FLAG', 'DEBUG_MODE']);
  });

  it('reports no extra keys without an example to compare against', async () => {
    await fs.writeFile(path.join(root, '.env'), 'ONLY_LOCAL=1\n', 'utf8');
    const env = await detectEnv(root);
    expect(env?.extraKeys).toEqual([]);
  });

  it('surfaces undocumented keys as a doctor info notice', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await fs.writeFile(path.join(root, '.env.example'), 'API_KEY=\n', 'utf8');
    await fs.writeFile(path.join(root, '.env'), 'API_KEY=x\nHIDDEN=1\n', 'utf8');

    const warnings = await runDoctor(root);
    const notice = warnings.find((warning) => warning.id === 'undocumented-env-keys');
    expect(notice?.severity).toBe('info');
    expect(notice?.message).toContain('HIDDEN');
  });
});
