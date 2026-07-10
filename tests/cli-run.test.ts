import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ScanResult } from '../src/core/types.js';

const runPackageScriptToTerminal = vi.fn();
const runConfiguredCommandToTerminal = vi.fn();
const scanProject = vi.fn();

vi.mock('../src/core/process/runner.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/process/runner.js')>();
  return {
    ...actual,
    runPackageScriptToTerminal,
    runConfiguredCommandToTerminal
  };
});

vi.mock('../src/core/scanner/index.js', () => ({
  scanProject
}));

const { runCommand } = await import('../src/cli/commands/run.js');

function scan(overrides: Partial<ScanResult>): ScanResult {
  return {
    root: '/project',
    projectName: 'project',
    packageJson: null,
    packageManager: null,
    language: {
      primary: null,
      detected: [],
      files: []
    },
    scripts: {},
    env: null,
    docker: null,
    git: null,
    framework: null,
    presets: [],
    presetCommands: {},
    presetGroups: {},
    ports: [],
    readme: {
      path: null,
      exists: false
    },
    license: {
      path: null,
      exists: false
    },
    monorepo: null,
    dependencies: null,
    toolchain: {
      testRunner: null,
      linter: null,
      formatter: null,
      bundler: null,
      orm: null,
      styling: null,
      ci: null
    },
    nodeRequirement: null,
    readmeCommands: [],
    config: null,
    ...overrides
  };
}

describe('run command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.exitCode = undefined;
  });

  it('runs package scripts first when names overlap with presets', async () => {
    scanProject.mockResolvedValue(
      scan({
        packageManager: 'npm',
        scripts: {
          test: 'vitest'
        },
        presetCommands: {
          test: 'go test ./...'
        }
      })
    );
    runPackageScriptToTerminal.mockResolvedValue(0);

    await runCommand('test', '/project');

    expect(runPackageScriptToTerminal).toHaveBeenCalledWith({
      cwd: '/project',
      packageManager: 'npm',
      script: 'test'
    });
    expect(runConfiguredCommandToTerminal).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
  });

  it('runs configured commands from devsurface.config.json', async () => {
    scanProject.mockResolvedValue(
      scan({
        config: {
          path: '/project/devsurface.config.json',
          warnings: [],
          config: {
            commands: {
              probe: 'node scripts/probe.js'
            }
          }
        }
      })
    );
    runConfiguredCommandToTerminal.mockResolvedValue(0);

    await runCommand('probe', '/project');

    expect(runConfiguredCommandToTerminal).toHaveBeenCalledWith({
      cwd: '/project',
      command: 'node scripts/probe.js'
    });
    expect(process.exitCode).toBe(0);
  });

  it('runs detected preset commands for non-Node projects', async () => {
    scanProject.mockResolvedValue(
      scan({
        language: {
          primary: 'go',
          detected: ['go'],
          files: ['/project/go.mod']
        },
        presetCommands: {
          'go:test': 'go test ./...'
        }
      })
    );
    runConfiguredCommandToTerminal.mockResolvedValue(0);

    await runCommand('go:test', '/project');

    expect(runConfiguredCommandToTerminal).toHaveBeenCalledWith({
      cwd: '/project',
      command: 'go test ./...'
    });
    expect(process.exitCode).toBe(0);
  });

  it('sanitizes dangerous command names before printing them', async () => {
    const writes: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((message: unknown) => {
      writes.push(String(message));
    });
    const badName = 'wipe\u001B]2;owned\u0007\u001B[31m';
    scanProject.mockResolvedValue(
      scan({
        config: {
          path: '/project/devsurface.config.json',
          warnings: [],
          config: {
            commands: {
              [badName]: 'docker volume rm data'
            }
          }
        }
      })
    );

    await runCommand(badName, '/project');

    const output = writes.join('\n');
    expect(output).toContain('Refusing to run dangerous command "wipe".');
    expect(output).not.toContain('\u001B]2;');
    expect(output).not.toContain('owned');
    expect(process.exitCode).toBe(1);
  });
});
