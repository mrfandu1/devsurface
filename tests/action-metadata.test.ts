import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

interface ActionMetadata {
  inputs?: Record<string, { default?: string }>;
  outputs?: Record<string, unknown>;
  runs?: {
    using?: string;
    main?: string;
  };
}

describe('action metadata', () => {
  it('points to the committed Node.js action bundle', async () => {
    const root = process.cwd();
    const metadata = parse(
      await fs.readFile(path.join(root, 'action.yml'), 'utf8')
    ) as ActionMetadata;

    expect(metadata.runs).toEqual({
      using: 'node20',
      main: 'action/dist/index.js'
    });
    expect(metadata.inputs?.['fail-on']?.default).toBe('error');
    expect(metadata.inputs?.comment?.default).toBe('true');
    expect(Object.keys(metadata.outputs ?? {})).toEqual(
      expect.arrayContaining(['errors', 'warnings', 'info', 'outcome'])
    );
    await expect(fs.access(path.join(root, 'action', 'dist', 'index.js'))).resolves.toBeUndefined();
  });
});
