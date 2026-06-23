import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { upsertPullRequestComment } from '../src/action/github.js';
import { makeTempProject, removeTempProject } from './testUtils.js';

const tempProjects: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempProjects.splice(0).map((project) => removeTempProject(project)));
});

async function pullRequestEvent(): Promise<string> {
  const root = await makeTempProject();
  tempProjects.push(root);
  const eventPath = path.join(root, 'event.json');
  await fs.writeFile(eventPath, JSON.stringify({ pull_request: { number: 42 } }), 'utf8');
  return eventPath;
}

describe('GitHub pull request comments', () => {
  it('creates a comment when no DevSurface comment exists', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 201 }));

    const result = await upsertPullRequestComment(
      {
        token: 'token',
        repository: 'owner/repo',
        eventPath: await pullRequestEvent(),
        body: '<!-- devsurface-health-check -->\nreport'
      },
      fetchMock
    );

    expect(result).toBe('created');
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.github.com/repos/owner/repo/issues/42/comments',
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('updates the existing DevSurface comment', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ id: 99, body: '<!-- devsurface-health-check -->\nold' }]), {
          status: 200
        })
      )
      .mockResolvedValueOnce(new Response('{}', { status: 200 }));

    const result = await upsertPullRequestComment(
      {
        token: 'token',
        repository: 'owner/repo',
        eventPath: await pullRequestEvent(),
        body: '<!-- devsurface-health-check -->\nnew'
      },
      fetchMock
    );

    expect(result).toBe('updated');
    expect(fetchMock).toHaveBeenLastCalledWith(
      'https://api.github.com/repos/owner/repo/issues/comments/99',
      expect.objectContaining({ method: 'PATCH' })
    );
  });

  it('falls back cleanly when the token is read-only', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 403 }));

    await expect(
      upsertPullRequestComment(
        {
          token: 'token',
          repository: 'owner/repo',
          eventPath: await pullRequestEvent(),
          body: '<!-- devsurface-health-check -->\nreport'
        },
        fetchMock
      )
    ).resolves.toBe('forbidden');
  });
});
