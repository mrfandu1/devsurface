import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { scanSecrets, redactSecret } from '../src/core/secrets/index.js';
import { makeTempProject, mkdirp, removeTempProject } from './testUtils.js';

describe('scanSecrets', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('flags an AWS access key and redacts the value', async () => {
    await fs.writeFile(path.join(root, 'config.js'), 'const key = "AKIAIOSFODNN7EXAMPLE";\n');
    const report = await scanSecrets(root);
    expect(report.clean).toBe(false);
    const finding = report.findings[0];
    expect(finding.kind).toBe('AWS access key');
    expect(finding.severity).toBe('critical');
    expect(finding.preview).not.toContain('EXAMPLE');
    expect(finding.preview.endsWith('…')).toBe(true);
  });

  it('detects a private key block', async () => {
    await fs.writeFile(
      path.join(root, 'id_rsa'),
      '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----\n'
    );
    // A .pem-less file still gets scanned when extension is txt-like; use .txt.
    await fs.writeFile(path.join(root, 'key.txt'), '-----BEGIN OPENSSH PRIVATE KEY-----\nxyz\n');
    const report = await scanSecrets(root);
    expect(report.findings.some((f) => f.kind === 'Private key block')).toBe(true);
  });

  it('ignores values read from the environment and placeholders', async () => {
    await fs.writeFile(
      path.join(root, 'ok.ts'),
      [
        'const token = process.env.GITHUB_TOKEN;',
        'const example = "your-api-key-here";',
        'const key = "sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"; // example'
      ].join('\n')
    );
    const report = await scanSecrets(root);
    expect(report.clean).toBe(true);
  });

  it('never scans .env files (secrets belong there)', async () => {
    await fs.writeFile(path.join(root, '.env'), 'STRIPE=sk_live_abcdefghijklmnop1234\n');
    const report = await scanSecrets(root);
    expect(report.clean).toBe(true);
  });

  it('skips lockfiles', async () => {
    await mkdirp(root);
    await fs.writeFile(path.join(root, 'package-lock.json'), '{ "key": "AKIAIOSFODNN7EXAMPLE" }\n');
    const report = await scanSecrets(root);
    expect(report.clean).toBe(true);
  });
});

describe('redactSecret', () => {
  it('keeps only a short prefix', () => {
    expect(redactSecret('AKIAIOSFODNN7EXAMPLE')).toBe('AKIAIOSF…');
    expect(redactSecret('short')).toBe('…');
  });
});
