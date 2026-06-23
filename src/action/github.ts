import { promises as fs } from 'node:fs';

const COMMENT_MARKER = '<!-- devsurface-health-check -->';

interface PullRequestEvent {
  pull_request?: {
    number?: number;
  };
}

interface GitHubComment {
  id: number;
  body?: string;
}

export interface CommentOptions {
  token: string;
  repository: string;
  eventPath: string;
  body: string;
}

export type CommentResult = 'created' | 'updated' | 'skipped' | 'forbidden';

export async function readPullRequestNumber(eventPath: string): Promise<number | null> {
  if (!eventPath) {
    return null;
  }
  try {
    const event = JSON.parse(await fs.readFile(eventPath, 'utf8')) as PullRequestEvent;
    return typeof event.pull_request?.number === 'number' ? event.pull_request.number : null;
  } catch {
    return null;
  }
}

async function githubRequest(
  url: string,
  token: string,
  init: RequestInit,
  fetchImpl: typeof fetch
): Promise<Response> {
  return await fetchImpl(url, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers
    }
  });
}

export async function upsertPullRequestComment(
  options: CommentOptions,
  fetchImpl: typeof fetch = fetch
): Promise<CommentResult> {
  if (!options.token || !options.repository || !options.eventPath) {
    return 'skipped';
  }
  const pullRequestNumber = await readPullRequestNumber(options.eventPath);
  if (pullRequestNumber === null) {
    return 'skipped';
  }

  const baseUrl = `https://api.github.com/repos/${options.repository}`;
  const listResponse = await githubRequest(
    `${baseUrl}/issues/${pullRequestNumber}/comments?per_page=100`,
    options.token,
    { method: 'GET' },
    fetchImpl
  );
  if (listResponse.status === 403) {
    return 'forbidden';
  }
  if (!listResponse.ok) {
    throw new Error(`GitHub comment lookup failed with status ${listResponse.status}.`);
  }
  const comments = (await listResponse.json()) as GitHubComment[];
  const existing = comments.find((comment) => comment.body?.includes(COMMENT_MARKER));
  const response =
    existing === undefined
      ? await githubRequest(
          `${baseUrl}/issues/${pullRequestNumber}/comments`,
          options.token,
          { method: 'POST', body: JSON.stringify({ body: options.body }) },
          fetchImpl
        )
      : await githubRequest(
          `${baseUrl}/issues/comments/${existing.id}`,
          options.token,
          { method: 'PATCH', body: JSON.stringify({ body: options.body }) },
          fetchImpl
        );

  if (response.status === 403) {
    return 'forbidden';
  }
  if (!response.ok) {
    throw new Error(`GitHub comment update failed with status ${response.status}.`);
  }
  return existing === undefined ? 'created' : 'updated';
}
