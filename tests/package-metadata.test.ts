import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEV_SURFACE_VERSION } from '../src/version.js';

interface PackageMetadata {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

describe('package metadata', () => {
  it('keeps the displayed version aligned with package.json', async () => {
    const metadata = JSON.parse(
      await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8')
    ) as PackageMetadata & { version?: string };

    expect(DEV_SURFACE_VERSION).toBe(metadata.version);
  });

  it('keeps bundled and browser-only packages out of consumer installs', async () => {
    const metadata = JSON.parse(
      await fs.readFile(path.join(process.cwd(), 'package.json'), 'utf8')
    ) as PackageMetadata;

    expect(metadata.dependencies).not.toHaveProperty('open');
    expect(metadata.dependencies).not.toHaveProperty('react');
    expect(metadata.dependencies).not.toHaveProperty('react-dom');

    expect(metadata.devDependencies).toHaveProperty('open');
    expect(metadata.devDependencies).toHaveProperty('react');
    expect(metadata.devDependencies).toHaveProperty('react-dom');
  });
});
