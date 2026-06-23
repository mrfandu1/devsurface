import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DockerComposeController,
  type DockerCommandResult,
  type DockerCommandRunner
} from '../src/core/docker/compose.js';
import { makeTempProject, removeTempProject } from './testUtils.js';

const tempProjects: string[] = [];

afterEach(async () => {
  await Promise.all(tempProjects.splice(0).map((project) => removeTempProject(project)));
});

async function composeProject(): Promise<string> {
  const root = await makeTempProject();
  tempProjects.push(root);
  await fs.writeFile(
    path.join(root, 'compose.yml'),
    ['services:', '  api:', '    image: node:22', '  postgres:', '    image: postgres:16', ''].join(
      '\n'
    ),
    'utf8'
  );
  return root;
}

function result(overrides: Partial<DockerCommandResult> = {}): DockerCommandResult {
  return {
    code: 0,
    stdout: '',
    stderr: '',
    error: null,
    ...overrides
  };
}

describe('Docker Compose controller', () => {
  it('maps running, stopped, and failed Compose services', async () => {
    const root = await composeProject();
    const runner: DockerCommandRunner = async (_root, args) => {
      if (args[0] === 'info') {
        return result();
      }

      return result({
        stdout: JSON.stringify([
          {
            Service: 'api',
            State: 'running',
            Status: 'Up 5 seconds',
            ID: 'api-container'
          },
          {
            Service: 'postgres',
            State: 'exited',
            Status: 'Exited (1)',
            ID: 'db-container'
          }
        ])
      });
    };

    const docker = await new DockerComposeController(root, { runner }).inspect();

    expect(docker?.daemonStatus).toBe('running');
    expect(docker?.services).toEqual([
      {
        name: 'api',
        status: 'running',
        statusDetail: 'Up 5 seconds',
        containerId: 'api-container'
      },
      {
        name: 'postgres',
        status: 'error',
        statusDetail: 'Exited (1)',
        containerId: 'db-container'
      }
    ]);
  });

  it('explains when Docker Desktop is not responding on Windows', async () => {
    const root = await composeProject();
    const runner: DockerCommandRunner = async () =>
      result({
        code: 1,
        stderr:
          'error during connect: this error may indicate that the docker daemon is not running'
      });

    const docker = await new DockerComposeController(root, {
      runner,
      platform: 'win32'
    }).inspect();

    expect(docker?.dockerRunning).toBe(false);
    expect(docker?.daemonStatus).toBe('stopped');
    expect(docker?.message).toContain('Start Docker Desktop');
    expect(docker?.services.every((service) => service.status === 'unknown')).toBe(true);
  });

  it('runs start and stop against an allow-listed service without a shell', async () => {
    const root = await composeProject();
    const calls: string[][] = [];
    const runner: DockerCommandRunner = async (_root, args) => {
      calls.push(args);
      if (args[0] === 'info') {
        return result();
      }
      if (args.includes('ps')) {
        return result();
      }
      return result({ stdout: 'done\n' });
    };
    const controller = new DockerComposeController(root, { runner });

    await controller.start('api');
    await controller.stop('api');

    expect(calls).toContainEqual([
      'compose',
      '-f',
      path.join(root, 'compose.yml'),
      '--project-directory',
      root,
      'up',
      '-d',
      '--',
      'api'
    ]);
    expect(calls).toContainEqual([
      'compose',
      '-f',
      path.join(root, 'compose.yml'),
      '--project-directory',
      root,
      'stop',
      '--',
      'api'
    ]);
  });

  it('keeps option-shaped service names as Compose operands', async () => {
    const root = await composeProject();
    await fs.writeFile(
      path.join(root, 'compose.yml'),
      [
        'services:',
        '  "--remove-orphans":',
        '    image: node:22',
        '  "-t0":',
        '    image: node:22',
        '  "-t":',
        '    image: node:22',
        ''
      ].join('\n'),
      'utf8'
    );
    const calls: string[][] = [];
    const runner: DockerCommandRunner = async (_root, args) => {
      calls.push(args);
      return result({ stdout: 'done\n' });
    };
    const controller = new DockerComposeController(root, { runner });

    await controller.start('--remove-orphans');
    await controller.stop('-t0');
    await controller.logs('-t');

    expect(calls.filter((args) => args[0] !== 'info')).toEqual([
      [
        'compose',
        '-f',
        path.join(root, 'compose.yml'),
        '--project-directory',
        root,
        'up',
        '-d',
        '--',
        '--remove-orphans'
      ],
      [
        'compose',
        '-f',
        path.join(root, 'compose.yml'),
        '--project-directory',
        root,
        'stop',
        '--',
        '-t0'
      ],
      [
        'compose',
        '-f',
        path.join(root, 'compose.yml'),
        '--project-directory',
        root,
        'logs',
        '--no-color',
        '--tail',
        '200',
        '--',
        '-t'
      ]
    ]);
  });

  it('rejects service names not declared by Compose', async () => {
    const root = await composeProject();
    const calls: string[][] = [];
    const runner: DockerCommandRunner = async (_root, args) => {
      calls.push(args);
      return result();
    };
    const controller = new DockerComposeController(root, { runner });

    await expect(controller.start('api; rm -rf .')).rejects.toMatchObject({
      code: 'service-not-found'
    });
    expect(calls).toEqual([]);
  });

  it('returns bounded, uncolored service logs', async () => {
    const root = await composeProject();
    const calls: string[][] = [];
    const runner: DockerCommandRunner = async (_root, args) => {
      calls.push(args);
      if (args[0] === 'info') {
        return result();
      }
      return result({ stdout: `${'x'.repeat(300_000)}\nlatest\n` });
    };
    const controller = new DockerComposeController(root, { runner });

    const logs = await controller.logs('postgres');

    expect(calls[1]).toEqual([
      'compose',
      '-f',
      path.join(root, 'compose.yml'),
      '--project-directory',
      root,
      'logs',
      '--no-color',
      '--tail',
      '200',
      '--',
      'postgres'
    ]);
    expect(logs.logs.length).toBeLessThanOrEqual(200_000);
    expect(logs.logs).toContain('latest');
  });

  it('reports Docker availability before requesting logs', async () => {
    const root = await composeProject();
    const runner: DockerCommandRunner = async () => result({ code: null, error: 'not-found' });
    const controller = new DockerComposeController(root, { runner });

    await expect(controller.logs('postgres')).rejects.toMatchObject({
      code: 'docker-not-installed'
    });
  });

  it('ignores compose file symlinks that resolve outside the project root', async () => {
    const root = await makeTempProject();
    tempProjects.push(root);
    const outside = await makeTempProject();
    tempProjects.push(outside);
    await fs.writeFile(
      path.join(outside, 'compose.yml'),
      ['services:', '  api:', '    image: node:22', ''].join('\n'),
      'utf8'
    );
    await fs.symlink(path.join(outside, 'compose.yml'), path.join(root, 'compose.yml'), 'file');

    const runner: DockerCommandRunner = async () => {
      throw new Error('runner should not be called when no compose files are trusted');
    };

    expect(await new DockerComposeController(root, { runner }).inspect()).toBeNull();
  });

  it('strips malicious ANSI sequences from Docker failure messages', async () => {
    const root = await composeProject();
    const ESC = '\u001B';
    const runner: DockerCommandRunner = async (_root, args) => {
      if (args[0] === 'info') {
        return result();
      }
      return result({
        code: 1,
        stderr: `${ESC}[2J${ESC}[31mcontainer-evil`
      });
    };

    const docker = await new DockerComposeController(root, { runner }).inspect();

    expect(docker?.message).toContain('container-evil');
    expect(docker?.message).not.toContain(ESC);
    expect(docker?.services.every((service) => service.status === 'error')).toBe(true);
  });

  it('propagates Docker daemon timeouts as unknown on Linux', async () => {
    const root = await composeProject();
    const runner: DockerCommandRunner = async (_root, args) => {
      if (args[0] === 'info') {
        return result({ code: null, error: 'timeout' });
      }
      return result();
    };

    const docker = await new DockerComposeController(root, {
      runner,
      platform: 'linux'
    }).inspect();

    expect(docker?.daemonStatus).toBe('unknown');
    expect(docker?.dockerRunning).toBe(false);
  });

  it('returns error service statuses when compose ps fails without throwing', async () => {
    const root = await composeProject();
    const runner: DockerCommandRunner = async (_root, args) => {
      if (args[0] === 'info') {
        return result();
      }
      return result({ code: 1, stderr: 'permission denied' });
    };

    const docker = await new DockerComposeController(root, { runner }).inspect();

    expect(docker?.dockerRunning).toBe(true);
    expect(docker?.services).toEqual([
      { name: 'api', status: 'error', statusDetail: null, containerId: null },
      { name: 'postgres', status: 'error', statusDetail: null, containerId: null }
    ]);
    expect(docker?.message).toContain('status check failed');
  });

  it('reports not-installed when Docker CLI is missing but compose files exist', async () => {
    const root = await composeProject();
    const runner: DockerCommandRunner = async () => result({ code: null, error: 'not-found' });

    const docker = await new DockerComposeController(root, { runner }).inspect();

    expect(docker?.daemonStatus).toBe('not-installed');
    expect(docker?.dockerRunning).toBe(false);
    expect(docker?.composeFiles).toHaveLength(1);
    expect(docker?.services.every((service) => service.status === 'unknown')).toBe(true);
    expect(docker?.message).toContain('Docker CLI was not found');
  });

  it('maps compose ps rows through exit code and state parsing edge cases', async () => {
    const root = await makeTempProject();
    tempProjects.push(root);
    await fs.writeFile(
      path.join(root, 'compose.yml'),
      [
        'services:',
        '  empty-exit:',
        '    image: node:22',
        '  no-status:',
        '    image: node:22',
        '  string-code:',
        '    image: node:22',
        '  dead-svc:',
        '    image: node:22',
        '  restarting-svc:',
        '    image: node:22',
        '  paused-svc:',
        '    image: node:22',
        '  created-svc:',
        '    image: node:22',
        '  status-code:',
        '    image: node:22',
        ''
      ].join('\n'),
      'utf8'
    );
    const runner: DockerCommandRunner = async (_root, args) => {
      if (args[0] === 'info') {
        return result();
      }
      return result({
        stdout: JSON.stringify([
          { Service: 'empty-exit', State: 'exited', ExitCode: '' },
          { Service: 'no-status', State: 'running' },
          { Service: 'string-code', State: 'exited', ExitCode: '2' },
          { Service: 'dead-svc', State: 'dead' },
          { Service: 'restarting-svc', State: 'restarting' },
          { Service: 'paused-svc', State: 'paused' },
          { Service: 'created-svc', State: 'created' },
          { Service: 'status-code', State: 'exited', Status: 'Exited (7)' }
        ])
      });
    };

    const docker = await new DockerComposeController(root, { runner }).inspect();
    const byName = Object.fromEntries(
      docker!.services.map((service) => [service.name, service.status])
    );

    expect(byName['empty-exit']).toBe('stopped');
    expect(byName['no-status']).toBe('running');
    expect(byName['string-code']).toBe('error');
    expect(byName['dead-svc']).toBe('error');
    expect(byName['restarting-svc']).toBe('error');
    expect(byName['paused-svc']).toBe('error');
    expect(byName['created-svc']).toBe('stopped');
    expect(byName['status-code']).toBe('error');
  });

  it('returns empty logs when docker produces no output', async () => {
    const root = await composeProject();
    const runner: DockerCommandRunner = async (_root, args) => {
      if (args[0] === 'info') {
        return result();
      }
      return result({ stdout: '', stderr: '' });
    };

    const logs = await new DockerComposeController(root, { runner }).logs('api');

    expect(logs.logs).toBe('');
  });

  it('keeps log output exactly at the command output limit', async () => {
    const root = await composeProject();
    const limit = 200_000;
    const exact = 'a'.repeat(limit);
    const runner: DockerCommandRunner = async (_root, args) => {
      if (args[0] === 'info') {
        return result();
      }
      return result({ stdout: exact });
    };

    const logs = await new DockerComposeController(root, { runner }).logs('api');

    expect(logs.logs.length).toBe(limit);
    expect(logs.logs).toBe(exact);
  });

  it('truncates log output over the limit to the trailing window', async () => {
    const root = await composeProject();
    const limit = 200_000;
    const over = `head-marker${'a'.repeat(limit)}tail-marker`;
    const runner: DockerCommandRunner = async (_root, args) => {
      if (args[0] === 'info') {
        return result();
      }
      return result({ stdout: over });
    };

    const logs = await new DockerComposeController(root, { runner }).logs('api');

    expect(logs.logs.length).toBe(limit);
    expect(logs.logs.endsWith('tail-marker')).toBe(true);
    expect(logs.logs.startsWith('head-marker')).toBe(false);
  });

  it('surfaces Docker daemon stderr on Linux when the engine is stopped', async () => {
    const root = await composeProject();
    const runner: DockerCommandRunner = async (_root, args) => {
      if (args[0] === 'info') {
        return result({
          code: 1,
          stderr: 'Cannot connect to the Docker daemon at unix:///var/run/docker.sock'
        });
      }
      return result();
    };

    const docker = await new DockerComposeController(root, {
      runner,
      platform: 'linux'
    }).inspect();

    expect(docker?.daemonStatus).toBe('stopped');
    expect(docker?.dockerRunning).toBe(false);
    expect(docker?.message).toContain('Cannot connect to the Docker daemon');
    expect(docker?.message).toContain('daemon is not responding');
  });
});
