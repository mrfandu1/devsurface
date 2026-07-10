import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { extractComposeEnvRefs } from '../src/core/docker/envRefs.js';
import { findSuspiciousExampleKeys, looksLikeRealSecret } from '../src/core/env/secrets.js';
import { inspectTsconfigStrictness } from '../src/core/scanner/tsconfig.js';
import { runDoctor } from '../src/core/doctor/index.js';
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

describe('looksLikeRealSecret', () => {
  it('flags long high-variety values', () => {
    expect(looksLikeRealSecret('sk-Live4fJd92mKq81LxTz7BwPn3')).toBe(true);
    expect(looksLikeRealSecret('AKIAIU5NN7QQFODN9T2X')).toBe(true);
  });

  it('leaves placeholders alone', () => {
    expect(looksLikeRealSecret('your-api-key-here-please')).toBe(false);
    expect(looksLikeRealSecret('CHANGEME_CHANGEME_CHANGEME')).toBe(false);
    expect(looksLikeRealSecret('<insert-your-token-here>')).toBe(false);
    expect(looksLikeRealSecret('xxxxxxxxxxxxxxxxxxxxxxxx')).toBe(false);
    expect(looksLikeRealSecret('postgres://localhost:5432/mydb')).toBe(false);
    expect(looksLikeRealSecret('short')).toBe(false);
    expect(looksLikeRealSecret('example-value-for-testing')).toBe(false);
  });
});

describe('findSuspiciousExampleKeys', () => {
  it('returns key names only, never values', () => {
    const content = [
      'SAFE_KEY=your-key-here',
      'LEAKED_TOKEN=ghp_A8dK2mQz91LxTbWn4RfYc7',
      '# COMMENT=ghp_this-is-in-a-comment-A8dK2mQz91'
    ].join('\n');
    const keys = findSuspiciousExampleKeys(content);
    expect(keys).toEqual(['LEAKED_TOKEN']);
  });
});

describe('extractComposeEnvRefs', () => {
  it('finds ${VAR} references and default-carrying variants', () => {
    const compose = [
      'services:',
      '  db:',
      '    image: postgres:${PG_VERSION:-16}',
      '    environment:',
      '      - PASSWORD=${DB_PASSWORD}',
      '      - USER=${DB_USER}'
    ].join('\n');
    const refs = extractComposeEnvRefs(compose);
    expect(refs).toContainEqual({ name: 'DB_PASSWORD', hasDefault: false });
    expect(refs).toContainEqual({ name: 'DB_USER', hasDefault: false });
    expect(refs).toContainEqual({ name: 'PG_VERSION', hasDefault: true });
  });

  it('prefers the no-default form when a var appears both ways', () => {
    const refs = extractComposeEnvRefs('a: ${X:-1}\nb: ${X}');
    expect(refs).toEqual([{ name: 'X', hasDefault: false }]);
  });
});

describe('inspectTsconfigStrictness', () => {
  it('reads explicit strict settings through comments and trailing commas', () => {
    expect(
      inspectTsconfigStrictness('{ /* c */ "compilerOptions": { "strict": true, } }').strict
    ).toBe(true);
    expect(inspectTsconfigStrictness('{ "compilerOptions": { "strict": false } }').strict).toBe(
      false
    );
  });

  it('does not judge configs that extend another or fail to parse', () => {
    expect(inspectTsconfigStrictness('{ "extends": "./base.json" }').strict).toBeNull();
    expect(inspectTsconfigStrictness('not json at all').strict).toBeNull();
  });

  it('treats a config without strict as non-strict', () => {
    expect(inspectTsconfigStrictness('{ "compilerOptions": { "target": "es2022" } }').strict).toBe(
      false
    );
  });
});

describe('doctor hygiene checks', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('errors when .env.example holds real-looking secrets', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await fs.writeFile(
      path.join(root, '.env.example'),
      'TOKEN=ghp_A8dK2mQz91LxTbWn4RfYc7\n',
      'utf8'
    );

    const warnings = await runDoctor(root);
    const alert = warnings.find((warning) => warning.id === 'secret-in-env-example');
    expect(alert?.severity).toBe('error');
    expect(alert?.message).toContain('TOKEN');
    expect(alert?.message).not.toContain('ghp_A8dK2mQz91LxTbWn4RfYc7');
  });

  it('warns when compose references env vars .env does not define', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await fs.writeFile(
      path.join(root, 'docker-compose.yml'),
      'services:\n  db:\n    image: postgres\n    environment:\n      - PASSWORD=${MISSING_SECRET_XYZ}\n',
      'utf8'
    );
    await fs.writeFile(path.join(root, '.env'), 'OTHER=1\n', 'utf8');

    const warnings = await runDoctor(root);
    const alert = warnings.find((warning) => warning.id === 'compose-env-missing');
    expect(alert?.message).toContain('MISSING_SECRET_XYZ');
  });

  it('notes when TypeScript strict mode is off', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await writeJson(path.join(root, 'tsconfig.json'), { compilerOptions: { target: 'es2022' } });

    const warnings = await runDoctor(root);
    expect(warnings.some((warning) => warning.id === 'tsconfig-strict-off')).toBe(true);
  });

  it('stays quiet about strict-enabled tsconfigs', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await writeJson(path.join(root, 'tsconfig.json'), { compilerOptions: { strict: true } });

    const warnings = await runDoctor(root);
    expect(warnings.some((warning) => warning.id === 'tsconfig-strict-off')).toBe(false);
  });
});
