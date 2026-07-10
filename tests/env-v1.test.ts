import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectEnv, parseEnvDescriptions } from '../src/core/scanner/env.js';
import { makeTempProject, removeTempProject } from './testUtils.js';

describe('parseEnvDescriptions', () => {
  it('attaches contiguous comments above a key as its description', () => {
    const content = [
      '# The API key from the dashboard.',
      '# Keep it secret.',
      'API_KEY=',
      '',
      '# Unrelated block comment',
      '',
      'NO_DESCRIPTION=1',
      '# Port the server listens on',
      'PORT=3000'
    ].join('\n');

    expect(parseEnvDescriptions(content)).toEqual({
      API_KEY: 'The API key from the dashboard. Keep it secret.',
      PORT: 'Port the server listens on'
    });
  });
});

describe('env v1.0 additions', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('lists additional env files and exposes descriptions', async () => {
    await fs.writeFile(
      path.join(root, '.env.example'),
      '# Database connection string\nDB_URL=\n',
      'utf8'
    );
    await fs.writeFile(path.join(root, '.env.local'), 'X=1\n', 'utf8');
    await fs.writeFile(path.join(root, '.env.test'), 'X=1\n', 'utf8');

    const env = await detectEnv(root);
    expect(env?.additionalFiles).toEqual(['.env.local', '.env.test']);
    expect(env?.descriptions).toEqual({ DB_URL: 'Database connection string' });
  });
});
