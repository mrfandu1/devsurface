import { spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  detectGit,
  parseAheadBehind,
  parseLastCommit,
  parsePorcelainStatus,
  parseRemoteUrl
} from '../src/core/scanner/git.js';
import { makeTempProject, mkdirp, removeTempProject } from './testUtils.js';

const gitAvailable = spawnSync('git', ['--version'], { shell: false }).status === 0;

function git(cwd: string, ...args: string[]): void {
  const result = spawnSync('git', args, { cwd, shell: false });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${result.stderr?.toString()}`);
  }
}

describe('git output parsing', () => {
  it('counts changed and untracked files from porcelain output', () => {
    expect(parsePorcelainStatus('')).toBe(0);
    expect(parsePorcelainStatus(' M src/a.ts\n?? new.txt\nA  staged.ts\n')).toBe(3);
  });

  it('parses ahead/behind counts (left is behind, right is ahead)', () => {
    expect(parseAheadBehind('2\t5')).toEqual({ behind: 2, ahead: 5 });
    expect(parseAheadBehind('0\t0')).toEqual({ behind: 0, ahead: 0 });
    expect(parseAheadBehind('nonsense')).toBeNull();
  });

  it('parses the last-commit format line', () => {
    const commit = parseLastCommit(
      'abc1234def\tJane Doe\t2026-07-01T10:00:00+02:00\tfix: solve the thing'
    );
    expect(commit).toEqual({
      hash: 'abc1234def',
      author: 'Jane Doe',
      date: '2026-07-01T10:00:00+02:00',
      subject: 'fix: solve the thing'
    });
    expect(parseLastCommit('not a hash\tX\tY\tZ')).toBeNull();
  });

  it('strips control characters from commit subjects', () => {
    const escape = String.fromCharCode(27);
    const commit = parseLastCommit(`abc1234	Eve	2026-01-01T00:00:00Z	bad${escape}[31mansi${escape}`);
    expect(commit?.subject).toBe('badansi');
  });

  it('extracts the origin URL and removes embedded credentials', () => {
    const config = [
      '[core]',
      '\tbare = false',
      '[remote "origin"]',
      '\turl = https://user:token123@github.com/acme/repo.git',
      '\tfetch = +refs/heads/*:refs/remotes/origin/*'
    ].join('\n');
    expect(parseRemoteUrl(config)).toBe('https://github.com/acme/repo.git');
    expect(parseRemoteUrl('[core]\n\tbare = false\n')).toBeNull();
  });

  it('keeps ssh-style remotes as-is', () => {
    const config = '[remote "origin"]\n\turl = git@github.com:acme/repo.git\n';
    expect(parseRemoteUrl(config)).toBe('git@github.com:acme/repo.git');
  });
});

describe('detectGit without the git CLI data', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('returns null when there is no .git directory', async () => {
    expect(await detectGit(root)).toBeNull();
  });

  it('reads the branch from a synthetic .git directory', async () => {
    await mkdirp(path.join(root, '.git'));
    await fs.writeFile(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/feature/x\n', 'utf8');
    const info = await detectGit(root);
    expect(info?.branch).toBe('feature/x');
    // No real repo behind it, so the CLI-derived fields stay null.
    expect(info?.dirtyFiles).toBeNull();
    expect(info?.lastCommit).toBeNull();
  });
});

describe.skipIf(!gitAvailable)('detectGit against a real repository', () => {
  let root: string;

  beforeEach(async () => {
    root = await makeTempProject();
    git(root, 'init');
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'Test User');
    await fs.writeFile(path.join(root, 'file.txt'), 'hello\n', 'utf8');
    git(root, 'add', '.');
    git(root, 'commit', '-m', 'initial commit');
  });

  afterEach(async () => {
    await removeTempProject(root);
  });

  it('reports a clean tree and the last commit', async () => {
    const info = await detectGit(root);
    expect(info?.dirtyFiles).toBe(0);
    expect(info?.lastCommit?.subject).toBe('initial commit');
    expect(info?.lastCommit?.author).toBe('Test User');
    // No upstream configured.
    expect(info?.ahead).toBeNull();
    expect(info?.behind).toBeNull();
    expect(info?.commitCount).toBe(1);
    // No tags yet.
    expect(info?.latestTag).toBeNull();
  });

  it('reports the latest reachable tag', async () => {
    git(root, 'tag', 'v1.2.3');
    const info = await detectGit(root);
    expect(info?.latestTag).toBe('v1.2.3');
  });

  it('counts changed and untracked files', async () => {
    await fs.writeFile(path.join(root, 'file.txt'), 'changed\n', 'utf8');
    await fs.writeFile(path.join(root, 'new.txt'), 'new\n', 'utf8');
    const info = await detectGit(root);
    expect(info?.dirtyFiles).toBe(2);
  });
});
