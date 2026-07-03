import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyEnvValue,
  isValidEnvKey,
  isValidEnvValue,
  setEnvValue
} from '../src/core/env/write.js';

describe('isValidEnvKey', () => {
  it('accepts conventional keys and rejects everything else', () => {
    expect(isValidEnvKey('API_KEY')).toBe(true);
    expect(isValidEnvKey('_private')).toBe(true);
    expect(isValidEnvKey('lower_case2')).toBe(true);
    expect(isValidEnvKey('1BAD')).toBe(false);
    expect(isValidEnvKey('BAD KEY')).toBe(false);
    expect(isValidEnvKey('BAD=KEY')).toBe(false);
    expect(isValidEnvKey('')).toBe(false);
  });
});

describe('isValidEnvValue', () => {
  it('rejects newlines and control characters so a value cannot add keys', () => {
    expect(isValidEnvValue('plain-value')).toBe(true);
    expect(isValidEnvValue('with spaces and #hash')).toBe(true);
    expect(isValidEnvValue('two\nlines')).toBe(false);
    expect(isValidEnvValue('null' + String.fromCharCode(0) + 'byte')).toBe(false);
    expect(isValidEnvValue('x'.repeat(5000))).toBe(false);
  });
});

describe('applyEnvValue', () => {
  it('replaces an existing key in place and keeps surrounding lines', () => {
    const content = '# comment\nAPI_KEY=old\nDB_URL=postgres://x\n';
    const result = applyEnvValue(content, 'API_KEY', 'new-value');

    expect(result.action).toBe('updated');
    expect(result.content).toContain('# comment');
    expect(result.content).toContain('API_KEY=new-value');
    expect(result.content).toContain('DB_URL=postgres://x');
    expect(result.content).not.toContain('old');
  });

  it('appends a missing key with a trailing newline', () => {
    const result = applyEnvValue('EXISTING=1', 'NEW_KEY', 'abc');

    expect(result.action).toBe('added');
    expect(result.content).toBe('EXISTING=1\nNEW_KEY=abc\n');
  });

  it('quotes values containing spaces or comment characters', () => {
    const result = applyEnvValue('', 'MESSAGE', 'hello world # not a comment');
    expect(result.content).toBe('MESSAGE="hello world # not a comment"\n');
  });

  it('matches export-prefixed lines and empty assignments', () => {
    const exported = applyEnvValue('export TOKEN=old\n', 'TOKEN', 'fresh');
    expect(exported.action).toBe('updated');
    expect(exported.content).toContain('TOKEN=fresh');

    const empty = applyEnvValue('EMPTY=\n', 'EMPTY', 'filled');
    expect(empty.action).toBe('updated');
    expect(empty.content).toContain('EMPTY=filled');
  });

  it('does not treat a key that is a prefix of another as a match', () => {
    const result = applyEnvValue('API_KEY_SECONDARY=keep\n', 'API_KEY', 'value');
    expect(result.action).toBe('added');
    expect(result.content).toContain('API_KEY_SECONDARY=keep');
    expect(result.content).toContain('API_KEY=value');
  });
});

describe('setEnvValue', () => {
  let workDirectory: string | null = null;

  afterEach(async () => {
    if (workDirectory !== null) {
      await rm(workDirectory, { recursive: true, force: true });
      workDirectory = null;
    }
  });

  it('creates .env when missing and updates it in place afterwards', async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'devsurface-env-'));

    const created = await setEnvValue({
      root: workDirectory,
      localPath: null,
      key: 'API_KEY',
      value: 'secret-1'
    });
    expect(created).toEqual({ ok: true, action: 'added' });

    const updated = await setEnvValue({
      root: workDirectory,
      localPath: path.join(workDirectory, '.env'),
      key: 'API_KEY',
      value: 'secret-2'
    });
    expect(updated).toEqual({ ok: true, action: 'updated' });

    const content = await readFile(path.join(workDirectory, '.env'), 'utf8');
    expect(content).toContain('API_KEY=secret-2');
    expect(content).not.toContain('secret-1');
  });

  it('refuses keys, values, and paths that are unsafe', async () => {
    workDirectory = await mkdtemp(path.join(tmpdir(), 'devsurface-env-'));
    await writeFile(path.join(workDirectory, '.env'), 'A=1\n', 'utf8');

    const badKey = await setEnvValue({
      root: workDirectory,
      localPath: null,
      key: 'BAD KEY',
      value: 'x'
    });
    expect(badKey.ok).toBe(false);

    const badValue = await setEnvValue({
      root: workDirectory,
      localPath: null,
      key: 'GOOD_KEY',
      value: 'line1\nline2'
    });
    expect(badValue.ok).toBe(false);

    const outside = await setEnvValue({
      root: workDirectory,
      localPath: path.join(workDirectory, '..', 'escape.env'),
      key: 'GOOD_KEY',
      value: 'x'
    });
    expect(outside.ok).toBe(false);
  });
});
