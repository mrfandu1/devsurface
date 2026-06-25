import { promises as fs } from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { runDoctor } from '../src/core/doctor/index.js';
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

describe('doctor', () => {
  it('reports core onboarding warnings', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'doctor-demo',
      scripts: {
        dev: 'node server.js'
      }
    });
    await fs.writeFile(path.join(root, '.env.example'), 'DATABASE_URL=\n', 'utf8');

    const warningIds = (await runDoctor(root)).map((warning) => warning.id);

    expect(warningIds).toContain('missing-node-modules');
    expect(warningIds).toContain('missing-env');
    expect(warningIds).toContain('missing-test-script');
    expect(warningIds).toContain('missing-build-script');
    expect(warningIds).toContain('missing-readme');
    expect(warningIds).not.toContain('missing-license');
  });

  it('does not require package.json for detected non-Node projects', async () => {
    const root = await tempProject();
    await fs.writeFile(path.join(root, 'pyproject.toml'), '[project]\nname = "api"\n', 'utf8');

    const warningIds = (await runDoctor(root)).map((warning) => warning.id);

    expect(warningIds).not.toContain('missing-package-json');
    expect(warningIds).not.toContain('missing-node-modules');
    expect(warningIds).not.toContain('missing-test-script');
    expect(warningIds).not.toContain('missing-build-script');
  });

  it('reports README script references that do not exist', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'readme-demo',
      scripts: {
        dev: 'node server.js',
        test: 'node -e "0"',
        build: 'node -e "0"'
      }
    });
    await mkdirp(path.join(root, 'node_modules', '.bin'));
    await fs.writeFile(path.join(root, 'README.md'), 'Run `npm run missing`.\n', 'utf8');
    await fs.writeFile(path.join(root, 'LICENSE'), 'MIT\n', 'utf8');

    const warnings = await runDoctor(root);
    expect(warnings.find((warning) => warning.id === 'readme-script-mismatch')?.message).toContain(
      'missing'
    );
  });

  it('reports bound configured ports', async () => {
    const server = net.createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;

    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'port-demo',
      scripts: {
        test: 'node -e "0"',
        build: 'node -e "0"'
      }
    });
    await writeJson(path.join(root, 'devsurface.config.json'), {
      ports: [port]
    });
    await mkdirp(path.join(root, 'node_modules', '.bin'));
    await fs.writeFile(path.join(root, 'README.md'), '# port demo\n', 'utf8');
    await fs.writeFile(path.join(root, 'LICENSE'), 'MIT\n', 'utf8');

    try {
      const warnings = await runDoctor(root);
      expect(warnings.map((warning) => warning.id)).toContain(`port-${port}-in-use`);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
