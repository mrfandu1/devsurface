import { describe, expect, it } from 'vitest';
import { buildOnboardingPlan } from '../src/core/onboarding/index.js';
import { renderPassportHtml } from '../src/core/passport/index.js';
import type { DoctorWarning, ScanResult } from '../src/core/types.js';

function baseScan(overrides: Partial<ScanResult> = {}): ScanResult {
  return {
    root: '/tmp/project',
    projectName: 'project',
    packageJson: { path: '/tmp/project/package.json', data: { name: 'project' } },
    packageManager: 'npm',
    language: { primary: 'node', detected: ['node'], files: ['package.json'] },
    scripts: {},
    env: null,
    docker: null,
    git: null,
    framework: null,
    presets: [],
    presetCommands: {},
    presetGroups: {},
    ports: [],
    readme: { path: null, exists: false },
    license: { path: null, exists: false },
    config: null,
    ...overrides
  };
}

function render(scan: ScanResult, warnings: DoctorWarning[] = []): string {
  const plan = buildOnboardingPlan(scan, warnings);
  return renderPassportHtml({
    scan,
    warnings,
    plan,
    version: '0.0.0-test',
    generatedAt: new Date('2026-01-15T12:00:00Z')
  });
}

describe('renderPassportHtml', () => {
  it('produces a complete standalone document', () => {
    const html = render(baseScan());

    expect(html).toContain('<!doctype html>');
    expect(html).toContain('Project Passport');
    expect(html).toContain('2026-01-15');
    // Self-contained: no external references of any kind.
    expect(html).not.toMatch(/src="http/);
    expect(html).not.toMatch(/href="http/);
    expect(html).not.toContain('<script src');
    expect(html).not.toContain('@import');
  });

  it('always shows the full fresh-machine quick start recipe', () => {
    // Generated on a machine where setup is complete (no warnings) — the
    // recipe must still be present for whoever receives the passport.
    const html = render(
      baseScan({
        packageManager: 'npm',
        scripts: { dev: 'vite' },
        env: {
          examplePath: '/tmp/project/.env.example',
          localPath: '/tmp/project/.env',
          hasExample: true,
          hasLocal: true,
          exampleKeys: [],
          localKeys: [],
          missingKeys: [],
          emptyKeys: [],
          keys: []
        }
      })
    );

    expect(html).toContain('Quick start');
    expect(html).toContain('npm ci');
    expect(html).toContain('cp .env.example .env');
    expect(html).toContain('npm run dev');
    expect(html).toContain('data-copy=');
  });

  it('lists machine requirements including the Node version from engines', () => {
    const html = render(
      baseScan({
        packageManager: 'pnpm',
        packageJson: {
          path: '/tmp/project/package.json',
          data: { name: 'project', engines: { node: '>=20' } }
        }
      })
    );

    expect(html).toContain('What you need installed');
    expect(html).toContain('version &gt;=20');
    expect(html).toContain('pnpm');
  });

  it('translates well-known dependencies into friendly roles', () => {
    const html = render(
      baseScan({
        packageJson: {
          path: '/tmp/project/package.json',
          data: {
            name: 'project',
            dependencies: { react: '^18.0.0', express: '^4.0.0' },
            devDependencies: { vitest: '^2.0.0', extra: '1.0.0' }
          }
        }
      })
    );

    expect(html).toContain('The tech stack, translated');
    expect(html).toContain('User interface library');
    expect(html).toContain('Web server framework');
    expect(html).toContain('Test runner');
    expect(html).toContain('more package');
  });

  it('tailors troubleshooting to what the project actually uses', () => {
    const plain = render(baseScan());
    expect(plain).toContain('If something goes wrong');
    expect(plain).not.toContain('Docker Desktop is probably not running');

    const withDocker = render(
      baseScan({
        docker: {
          composeFiles: ['docker-compose.yml'],
          services: [],
          dockerRunning: true,
          daemonStatus: 'running',
          message: null
        }
      })
    );
    expect(withDocker).toContain('Docker Desktop is probably not running');
  });

  it('includes a glossary, with the .env entry only when the project uses one', () => {
    const plain = render(baseScan());
    expect(plain).toContain('Words you will meet');
    expect(plain).not.toContain('A private settings file');

    const withEnv = render(
      baseScan({
        env: {
          examplePath: '/tmp/project/.env.example',
          localPath: null,
          hasExample: true,
          hasLocal: false,
          exampleKeys: ['API_KEY'],
          localKeys: [],
          missingKeys: ['API_KEY'],
          emptyKeys: [],
          keys: []
        }
      })
    );
    expect(withEnv).toContain('A private settings file');
  });

  it('escapes HTML in project-controlled fields', () => {
    const html = render(
      baseScan({
        projectName: '<img src=x onerror=alert(1)>',
        scripts: { dev: 'vite "<script>"' }
      })
    );

    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('vite "<script>"');
  });

  it('shows the exact package-manager commands for setup steps', () => {
    const html = render(baseScan({ packageManager: 'pnpm', scripts: { dev: 'vite' } }), [
      { id: 'missing-node-modules', severity: 'warning', title: 'x', message: 'x' }
    ]);

    expect(html).toContain('pnpm install --frozen-lockfile');
    expect(html).toContain('pnpm run dev');
  });

  it('explains scripts in plain English alongside the raw command', () => {
    const html = render(baseScan({ scripts: { build: 'tsup src/index.ts' } }));

    expect(html).toContain('optimized files ready for production');
    expect(html).toContain('tsup src/index.ts');
  });

  it('lists env key names and statuses but never values', () => {
    const html = render(
      baseScan({
        env: {
          examplePath: '/tmp/project/.env.example',
          localPath: '/tmp/project/.env',
          hasExample: true,
          hasLocal: true,
          exampleKeys: ['API_KEY', 'DB_URL'],
          localKeys: ['API_KEY'],
          missingKeys: ['DB_URL'],
          emptyKeys: [],
          keys: [
            { key: 'API_KEY', present: true, empty: false },
            { key: 'DB_URL', present: false, empty: false }
          ]
        }
      })
    );

    expect(html).toContain('API_KEY');
    expect(html).toContain('DB_URL');
    expect(html).toContain('Missing');
    expect(html).toContain('Values never leave your machine');
  });

  it('reports port availability in plain language', () => {
    const html = render(
      baseScan({
        ports: [
          { port: 3000, inUse: true },
          { port: 5432, inUse: false }
        ]
      })
    );

    expect(html).toContain('3000');
    expect(html).toContain('Busy right now');
    expect(html).toContain('Free');
  });

  it('includes docker services only when compose files exist', () => {
    const withoutDocker = render(baseScan());
    expect(withoutDocker).not.toContain('Background services');

    const withDocker = render(
      baseScan({
        docker: {
          composeFiles: ['docker-compose.yml'],
          services: [
            { name: 'db', status: 'running', statusDetail: null, containerId: null },
            { name: 'cache', status: 'stopped', statusDetail: null, containerId: null }
          ],
          dockerRunning: true,
          daemonStatus: 'running',
          message: null
        }
      })
    );
    expect(withDocker).toContain('Background services');
    expect(withDocker).toContain('db');
    expect(withDocker).toContain('cache');
  });

  it('renders health warnings with severity badges', () => {
    const html = render(baseScan(), [
      { id: 'w1', severity: 'error', title: 'Broken thing', message: 'It broke.' }
    ]);

    expect(html).toContain('Broken thing');
    expect(html).toContain('badge-error');
  });

  it('celebrates a project with no warnings', () => {
    const html = render(baseScan());
    expect(html).toContain('No setup problems detected');
  });
});
