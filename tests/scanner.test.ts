import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectEnv, parseEnvKeys } from '../src/core/scanner/env.js';
import { detectFramework } from '../src/core/scanner/framework.js';
import { detectGit } from '../src/core/scanner/git.js';
import { detectDocker } from '../src/core/scanner/docker.js';
import { detectPackageManager } from '../src/core/scanner/packageManager.js';
import { readPackageJson } from '../src/core/scanner/packageJson.js';
import { MAX_PORT_PROBES, detectPorts, inferPortsFromScripts } from '../src/core/scanner/ports.js';
import { scanProject } from '../src/core/scanner/index.js';
import { makeTempProject, mkdirp, removeTempProject, writeJson } from './testUtils.js';

const tempProjects: string[] = [];

afterEach(async () => {
  await Promise.all(tempProjects.splice(0).map((project) => removeTempProject(project)));
});

async function tempProject(): Promise<string> {
  const project = await makeTempProject();
  tempProjects.push(project);
  return project;
}

describe('scanner', () => {
  it('reads package.json without throwing when present or missing', async () => {
    const root = await tempProject();
    expect(await readPackageJson(root)).toBeNull();

    await writeJson(path.join(root, 'package.json'), {
      name: 'demo',
      scripts: {
        dev: 'vite --port 4444'
      }
    });

    const packageJson = await readPackageJson(root);
    expect(packageJson?.data.name).toBe('demo');
    expect(packageJson?.data.scripts?.dev).toBe('vite --port 4444');
  });

  it('ignores package.json symlinks that resolve outside the project root', async () => {
    const root = await tempProject();
    const outside = await tempProject();
    const outsidePackage = path.join(outside, 'package.json');
    await writeJson(outsidePackage, {
      name: 'outside-package',
      token: 'hidden'
    });
    await fs.symlink(outsidePackage, path.join(root, 'package.json'), 'file');

    expect(await readPackageJson(root)).toBeNull();
    const scan = await scanProject(root);
    expect(JSON.stringify(scan)).not.toContain('hidden');
  });

  it('detects package manager by lock file priority', async () => {
    const root = await tempProject();
    await fs.writeFile(path.join(root, 'package-lock.json'), '{}', 'utf8');
    await fs.writeFile(path.join(root, 'pnpm-lock.yaml'), 'lockfileVersion: 9', 'utf8');

    expect(await detectPackageManager(root)).toBe('pnpm');
  });

  it('ignores non-string package scripts instead of crashing scans', async () => {
    const root = await tempProject();
    await fs.writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        name: 'bad-scripts',
        scripts: {
          dev: 1,
          test: 'vitest'
        }
      }),
      'utf8'
    );

    const scan = await scanProject(root);
    expect(scan.scripts).toEqual({ test: 'vitest' });
  });

  it('parses env keys and never returns values', async () => {
    const parsed = parseEnvKeys(
      'DATABASE_URL=postgres://secret\nEMPTY=\nexport TOKEN=abc\n# COMMENT=1'
    );
    expect(parsed.keys).toEqual(['DATABASE_URL', 'EMPTY', 'TOKEN']);
    expect(parsed.emptyKeys).toEqual(['EMPTY']);

    const root = await tempProject();
    await fs.writeFile(path.join(root, '.env.example'), 'DATABASE_URL=\nSESSION_SECRET=\n', 'utf8');
    await fs.writeFile(
      path.join(root, '.env'),
      'DATABASE_URL=postgres://hidden\nSESSION_SECRET=\n',
      'utf8'
    );

    const env = await detectEnv(root);
    expect(env?.missingKeys).toEqual([]);
    expect(env?.emptyKeys).toEqual(['SESSION_SECRET']);
    expect(JSON.stringify(env)).not.toContain('postgres://hidden');
  });

  it('ignores configured env paths outside the project root', async () => {
    const root = await tempProject();
    const outside = await tempProject();
    const outsideExample = path.join(outside, 'outside.env.example');
    const outsideLocal = path.join(outside, 'outside.env');
    await fs.writeFile(outsideExample, 'OUTSIDE_SECRET=example\n', 'utf8');
    await fs.writeFile(outsideLocal, 'OUTSIDE_SECRET=local\n', 'utf8');

    const env = await detectEnv(root, {
      env: {
        example: path.relative(root, outsideExample),
        local: path.relative(root, outsideLocal)
      }
    });

    expect(env).toBeNull();
  });

  it('ignores env paths that resolve outside the project root through links', async () => {
    const root = await tempProject();
    const outside = await tempProject();
    await fs.writeFile(
      path.join(outside, 'outside.env.example'),
      'OUTSIDE_SECRET=example\n',
      'utf8'
    );
    await fs.symlink(outside, path.join(root, 'linked-env'), 'junction');

    const env = await detectEnv(root, {
      env: {
        example: path.join('linked-env', 'outside.env.example')
      }
    });

    expect(env).toBeNull();
  });

  it('detects frameworks from dependencies', () => {
    const framework = detectFramework({
      path: 'package.json',
      data: {
        dependencies: {
          next: '^15.0.0',
          express: '^4.0.0'
        }
      }
    });

    expect(framework?.type).toBe('Node.js / Next.js / Express');
  });

  it('adds framework preset commands and ports', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'preset-demo',
      dependencies: {
        next: '^15.0.0',
        prisma: '^6.0.0'
      }
    });

    const scan = await scanProject(root);

    expect(scan.presets.map((preset) => preset.name)).toEqual(
      expect.arrayContaining(['next', 'prisma'])
    );
    expect(scan.presetCommands['next:dev']).toBe('next dev');
    expect(scan.presetCommands['prisma:studio']).toBe('prisma studio');
    expect(scan.presetGroups['Next.js']).toContain('next:dev');
    expect(scan.ports.map((port) => port.port)).toEqual(expect.arrayContaining([3000, 5555]));
  });

  it('returns Docker Compose services with status objects', async () => {
    const root = await tempProject();
    const oldPath = process.env.PATH;
    await fs.writeFile(
      path.join(root, 'docker-compose.yml'),
      'services:\n  postgres:\n    image: postgres:16\n  redis:\n    image: redis:7\n',
      'utf8'
    );

    const docker = await (async () => {
      try {
        process.env.PATH = '';
        return await detectDocker(root);
      } finally {
        process.env.PATH = oldPath;
      }
    })();

    expect(docker?.composeFiles[0]).toContain('docker-compose.yml');
    expect(docker?.services.map((service) => service.name).sort()).toEqual(['postgres', 'redis']);
    expect(
      docker?.services.every(
        (service) => service.containerId === null || typeof service.containerId === 'string'
      )
    ).toBe(true);
  });

  if (process.platform === 'win32') {
    it('does not execute a repo-local docker.cmd during Docker detection', async () => {
      const root = await tempProject();
      const marker = path.join(root, 'docker-ran.txt');
      const oldPath = process.env.PATH;
      await fs.writeFile(
        path.join(root, 'docker-compose.yml'),
        'services:\n  postgres:\n    image: postgres:16\n',
        'utf8'
      );
      await fs.writeFile(
        path.join(root, 'docker.cmd'),
        `@echo off\r\necho ran>>"${marker}"\r\nif "%1"=="info" exit /b 0\r\nif "%1"=="compose" echo [{"Service":"postgres","State":"running","ID":"abc"}]\r\nexit /b 0\r\n`,
        'utf8'
      );

      try {
        process.env.PATH = root;
        await detectDocker(root);
      } finally {
        process.env.PATH = oldPath;
      }

      await expect(fs.access(marker)).rejects.toBeTruthy();
    });
  }

  it('detects git branch from .git HEAD', async () => {
    const root = await tempProject();
    await mkdirp(path.join(root, '.git'));
    await fs.writeFile(
      path.join(root, '.git', 'HEAD'),
      'ref: refs/heads/feature/devsurface\n',
      'utf8'
    );

    expect((await detectGit(root))?.branch).toBe('feature/devsurface');
  });

  it('ignores gitdir pointers outside the project root', async () => {
    const root = await tempProject();
    const outside = await tempProject();
    await fs.writeFile(path.join(outside, 'HEAD'), 'ref: refs/heads/outside\n', 'utf8');
    await fs.writeFile(path.join(root, '.git'), `gitdir: ${outside}\n`, 'utf8');

    expect(await detectGit(root)).toBeNull();
  });

  it('ignores gitdir pointers that resolve outside the project root through links', async () => {
    const root = await tempProject();
    const outside = await tempProject();
    await fs.writeFile(path.join(outside, 'HEAD'), 'ref: refs/heads/outside-link\n', 'utf8');
    await fs.symlink(outside, path.join(root, 'linked-git'), 'junction');
    await fs.writeFile(path.join(root, '.git'), 'gitdir: linked-git\n', 'utf8');

    expect(await detectGit(root)).toBeNull();
  });

  it('infers and probes ports using Node net', async () => {
    const inferred = inferPortsFromScripts({
      dev: 'vite --port 4444',
      api: 'cross-env PORT=5555 node server.js'
    });
    expect(inferred).toEqual([4444, 5555]);

    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;

    try {
      const probes = await detectPorts([port]);
      expect(probes?.[0]).toEqual({ port, inUse: true });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('limits the number of probed ports', async () => {
    const ports = Array.from({ length: MAX_PORT_PROBES + 20 }, (_, index) => 30000 + index);

    const probes = await detectPorts(ports);

    expect(probes).toHaveLength(MAX_PORT_PROBES);
    expect(probes?.map((probe) => probe.port)).toEqual(ports.slice(0, MAX_PORT_PROBES));
  });

  it('orchestrates a project scan', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'scan-demo',
      scripts: {
        dev: 'vite --port 4123',
        test: 'vitest',
        build: 'vite build'
      },
      devDependencies: {
        vite: '^6.0.0'
      }
    });
    await fs.writeFile(path.join(root, 'README.md'), '# scan demo\n', 'utf8');
    await fs.writeFile(path.join(root, 'LICENSE'), 'MIT\n', 'utf8');

    const scan = await scanProject(root);
    expect(scan.projectName).toBe('scan-demo');
    expect(scan.packageManager).toBe('npm');
    expect(scan.framework?.detected).toContain('Vite');
    expect(scan.ports.map((port) => port.port)).toContain(4123);
  });

  it('detects Python projects and framework commands without package.json', async () => {
    const root = await tempProject();
    await fs.writeFile(path.join(root, 'requirements.txt'), 'fastapi\nuvicorn\n', 'utf8');

    const scan = await scanProject(root);

    expect(scan.packageJson).toBeNull();
    expect(scan.packageManager).toBeNull();
    expect(scan.language.primary).toBe('python');
    expect(scan.presetCommands['python:dev']).toBe('uvicorn main:app --reload --host 127.0.0.1');
    expect(scan.ports.map((port) => port.port)).toContain(8000);
  });

  it('detects Go projects and adds Go commands', async () => {
    const root = await tempProject();
    await fs.writeFile(path.join(root, 'go.mod'), 'module example.com/demo\n', 'utf8');

    const scan = await scanProject(root);

    expect(scan.language.primary).toBe('go');
    expect(scan.presetCommands['go:run']).toBe('go run .');
    expect(scan.presetCommands['go:test']).toBe('go test ./...');
  });

  it('detects git hook tooling and adds hook commands', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), { name: 'hooks-demo', scripts: {} });
    await fs.writeFile(path.join(root, '.pre-commit-config.yaml'), 'repos: []\n', 'utf8');
    await fs.writeFile(path.join(root, 'lefthook.yml'), 'pre-commit:\n', 'utf8');

    const scan = await scanProject(root);

    expect(scan.presetCommands['pre-commit:run']).toBe('pre-commit run --all-files');
    expect(scan.presetCommands['lefthook:install']).toBe('lefthook install');
  });

  it('suggests a free port for busy ports', async () => {
    const root = await tempProject();
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const busyPort = (server.address() as net.AddressInfo).port;
    try {
      await writeJson(path.join(root, 'package.json'), {
        name: 'port-suggest-demo',
        scripts: { dev: `node server.js --port ${busyPort}` }
      });

      const scan = await scanProject(root);
      const probe = scan.ports.find((port) => port.port === busyPort);

      expect(probe?.inUse).toBe(true);
      expect(typeof probe?.suggestedFreePort).toBe('number');
      expect(probe?.suggestedFreePort).toBeGreaterThan(busyPort);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('detects Rust projects and adds Cargo commands', async () => {
    const root = await tempProject();
    await fs.writeFile(path.join(root, 'Cargo.toml'), '[package]\nname = "demo"\n', 'utf8');
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(path.join(root, 'src', 'main.rs'), 'fn main() {}\n', 'utf8');

    const scan = await scanProject(root);

    expect(scan.language.primary).toBe('rust');
    expect(scan.presetCommands['cargo:run']).toBe('cargo run');
    expect(scan.presetCommands['cargo:test']).toBe('cargo test');
  });

  it('omits cargo run for library-only Rust crates', async () => {
    const root = await tempProject();
    await fs.writeFile(path.join(root, 'Cargo.toml'), '[package]\nname = "demo-lib"\n', 'utf8');
    await fs.mkdir(path.join(root, 'src'));
    await fs.writeFile(path.join(root, 'src', 'lib.rs'), 'pub fn demo() {}\n', 'utf8');

    const scan = await scanProject(root);

    expect(scan.presetCommands['cargo:run']).toBeUndefined();
    expect(scan.presetCommands['cargo:build']).toBe('cargo build');
  });

  it('detects PHP composer projects and Ruby Gemfiles', async () => {
    const root = await tempProject();
    await fs.writeFile(
      path.join(root, 'composer.json'),
      JSON.stringify({ name: 'demo/app', scripts: { test: 'phpunit' } }),
      'utf8'
    );
    await fs.writeFile(
      path.join(root, 'Gemfile'),
      "source 'https://rubygems.org'\ngem 'rails'\n",
      'utf8'
    );

    const scan = await scanProject(root);

    expect(scan.language.detected).toEqual(expect.arrayContaining(['php', 'ruby']));
    expect(scan.presetCommands['composer:install']).toBe('composer install');
    expect(scan.presetCommands['composer:test']).toBe('composer run test');
    expect(scan.presetCommands['bundle:install']).toBe('bundle install');
    expect(scan.presetCommands['rails:server']).toBe('bundle exec rails server -b 127.0.0.1');
  });

  it('detects justfile recipes, Taskfile tasks, and deno tasks', async () => {
    const root = await tempProject();
    await fs.writeFile(
      path.join(root, 'justfile'),
      'set shell := ["bash"]\nbuild:\n\techo hi\n',
      'utf8'
    );
    await fs.writeFile(
      path.join(root, 'Taskfile.yml'),
      "version: '3'\ntasks:\n  deploy:\n    cmds:\n      - echo deploy\n",
      'utf8'
    );
    await fs.writeFile(
      path.join(root, 'deno.json'),
      JSON.stringify({ tasks: { dev: 'deno run main.ts' } }),
      'utf8'
    );

    const scan = await scanProject(root);

    expect(scan.presetCommands['just:build']).toBe('just build');
    expect(scan.presetCommands['just:set']).toBeUndefined();
    expect(scan.presetCommands['task:deploy']).toBe('task deploy');
    expect(scan.presetCommands['deno:dev']).toBe('deno task dev');
  });

  it('adds a docker build command when a Dockerfile exists', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), { name: 'My App!', scripts: {} });
    await fs.writeFile(path.join(root, 'Dockerfile'), 'FROM node:20\n', 'utf8');

    const scan = await scanProject(root);

    expect(scan.presetCommands['docker:build']).toBe('docker build -t my-app .');
  });

  it('detects Makefile targets and adds make commands', async () => {
    const root = await tempProject();
    await fs.writeFile(
      path.join(root, 'Makefile'),
      '.PHONY: build test\nVAR := 1\nbuild:\n\techo build\ntest: build\n\techo test\n%.o: %.c\n\techo pattern\n',
      'utf8'
    );

    const scan = await scanProject(root);

    expect(scan.presetCommands['make:build']).toBe('make build');
    expect(scan.presetCommands['make:test']).toBe('make test');
    expect(scan.presetCommands['make:%.o']).toBeUndefined();
    expect(scan.presetCommands['make:VAR']).toBeUndefined();
  });

  it('detects Java build files and adds build tool commands', async () => {
    const root = await tempProject();
    await fs.writeFile(path.join(root, 'pom.xml'), '<project />\n', 'utf8');
    await fs.writeFile(path.join(root, 'build.gradle'), 'plugins { id "java" }\n', 'utf8');

    const scan = await scanProject(root);

    expect(scan.language.primary).toBe('java');
    expect(scan.presetCommands['maven:test']).toBe('mvn test');
    expect(scan.presetCommands['gradle:build']).toBe('gradle build');
  });

  it('ignores README symlinks that resolve outside the project root', async () => {
    const root = await tempProject();
    const outside = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'readme-link-demo',
      scripts: {}
    });
    await fs.writeFile(path.join(outside, 'README.md'), '# outside readme\n', 'utf8');
    await fs.symlink(path.join(outside, 'README.md'), path.join(root, 'README.md'), 'file');

    const scan = await scanProject(root);
    expect(scan.readme.exists).toBe(false);
    expect(scan.readme.path).toBeNull();
  });
});
