import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveActionRoot } from '../src/action/runtime.js';
import { makeTempProject, removeTempProject } from './testUtils.js';

const tempProjects: string[] = [];

afterEach(async () => {
  await Promise.all(tempProjects.splice(0).map((project) => removeTempProject(project)));
});

async function tempProject(): Promise<string> {
  const project = await makeTempProject();
  tempProjects.push(project);
  return project;
}

describe('Action path resolution', () => {
  it('returns the canonical path for a directory inside GITHUB_WORKSPACE', async () => {
    const workspace = await tempProject();
    const selected = path.join(workspace, 'selected');
    await fs.mkdir(selected);

    await expect(resolveActionRoot(workspace, 'selected')).resolves.toBe(
      await fs.realpath(selected)
    );
  });

  it('rejects a repository link that resolves outside GITHUB_WORKSPACE', async () => {
    const workspace = await tempProject();
    const outside = await tempProject();
    await fs.symlink(outside, path.join(workspace, 'selected'), 'junction');

    await expect(resolveActionRoot(workspace, 'selected')).rejects.toThrow(
      'path must resolve inside GITHUB_WORKSPACE.'
    );
  });

  it('rejects a direct lexical escape', async () => {
    const workspace = await tempProject();

    await expect(resolveActionRoot(workspace, '..')).rejects.toThrow(
      'path must resolve inside GITHUB_WORKSPACE.'
    );
  });
});
