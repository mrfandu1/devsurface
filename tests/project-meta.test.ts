import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  countTestFiles,
  detectChangelog,
  detectCommunityFiles,
  detectLicenseType,
  detectVscodeExtensions,
  latestChangelogVersion
} from '../src/core/scanner/projectMeta.js';
import { makeTempProject, mkdirp, removeTempProject, writeJson } from './testUtils.js';

describe('detectLicenseType', () => {
  it('recognizes the common licenses by their distinctive text', () => {
    expect(detectLicenseType('MIT License\n\nCopyright (c) 2026')).toBe('MIT');
    expect(detectLicenseType('Permission is hereby granted, free of charge, to any person')).toBe(
      'MIT'
    );
    expect(detectLicenseType('Apache License\n Version 2.0, January 2004')).toBe('Apache-2.0');
    expect(detectLicenseType('GNU GENERAL PUBLIC LICENSE\n Version 3, 29 June 2007')).toBe(
      'GPL-3.0'
    );
    expect(detectLicenseType('ISC License\n\nCopyright')).toBe('ISC');
    expect(
      detectLicenseType('Redistribution and use in source and binary forms, with or without')
    ).toBe('BSD');
  });

  it('returns null for unknown license text', () => {
    expect(detectLicenseType('All rights reserved. Proprietary.')).toBeNull();
  });
});

describe('latestChangelogVersion', () => {
  it('reads the first version heading in common formats', () => {
    expect(latestChangelogVersion('# Changelog\n\n## 1.2.3\n\n- stuff')).toBe('1.2.3');
    expect(latestChangelogVersion('## [4.5.6] - 2026-01-01')).toBe('4.5.6');
    expect(latestChangelogVersion('## v2.0.0-beta.1')).toBe('2.0.0-beta.1');
    expect(latestChangelogVersion('just prose')).toBeNull();
  });
});

describe('project metadata detection', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('detects the changelog and its newest version', async () => {
    await fs.writeFile(path.join(root, 'CHANGELOG.md'), '# Changelog\n\n## 0.9.0\n', 'utf8');
    expect(await detectChangelog(root)).toEqual({ exists: true, latestVersion: '0.9.0' });
    expect(await detectChangelog(path.join(root, 'nowhere'))).toEqual({
      exists: false,
      latestVersion: null
    });
  });

  it('detects contributing and code-of-conduct files', async () => {
    await fs.writeFile(path.join(root, 'CONTRIBUTING.md'), 'please do', 'utf8');
    expect(await detectCommunityFiles(root)).toEqual({
      contributing: true,
      codeOfConduct: false
    });
  });

  it('reads recommended VS Code extensions, tolerating comments', async () => {
    await mkdirp(path.join(root, '.vscode'));
    await fs.writeFile(
      path.join(root, '.vscode', 'extensions.json'),
      '{\n  // team picks\n  "recommendations": ["dbaeumer.vscode-eslint", "esbenp.prettier-vscode", 123]\n}',
      'utf8'
    );
    expect(await detectVscodeExtensions(root)).toEqual([
      'dbaeumer.vscode-eslint',
      'esbenp.prettier-vscode'
    ]);
  });

  it('counts test files while skipping generated directories', async () => {
    await mkdirp(path.join(root, 'src'));
    await mkdirp(path.join(root, 'node_modules', 'x'));
    await fs.writeFile(path.join(root, 'src', 'a.test.ts'), '', 'utf8');
    await fs.writeFile(path.join(root, 'src', 'b.spec.tsx'), '', 'utf8');
    await fs.writeFile(path.join(root, 'src', 'main.ts'), '', 'utf8');
    await fs.writeFile(path.join(root, 'node_modules', 'x', 'c.test.js'), '', 'utf8');
    await writeJson(path.join(root, 'package.json'), { name: 'x' });

    expect(await countTestFiles(root)).toBe(2);
  });
});
