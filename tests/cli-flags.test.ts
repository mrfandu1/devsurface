import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';
import { promises as fs } from 'node:fs';
import { doctorCommand } from '../src/cli/commands/doctor.js';
import { envCheckCommand } from '../src/cli/commands/env.js';
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

describe('doctor --fail-on and env check exit codes', () => {
  let root: string;
  let logs: string[];

  beforeEach(async () => {
    root = await makeTempProject();
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((message: unknown) => {
      logs.push(String(message));
    });
    process.exitCode = undefined;
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
    await removeTempProject(root);
  });

  it('doctor exits nonzero at the configured severity threshold', async () => {
    // An empty directory is not a project — the doctor reports an error.
    await doctorCommand(root, { failOn: 'error' });
    expect(process.exitCode).toBe(1);

    process.exitCode = undefined;
    await doctorCommand(root, { failOn: 'never' });
    expect(process.exitCode).toBeUndefined();
  });

  it('doctor --json prints machine-readable warnings', async () => {
    await doctorCommand(root, { json: true });
    const parsed = JSON.parse(logs.join('\n')) as Array<{ id: string; severity: string }>;
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.some((warning) => warning.id === 'missing-package-json')).toBe(true);
  });

  it('env check exits nonzero when required keys are unset', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await fs.writeFile(path.join(root, '.env.example'), 'API_KEY=\n', 'utf8');
    await fs.writeFile(path.join(root, '.env'), 'OTHER=1\n', 'utf8');

    await envCheckCommand(root, { json: true });
    expect(process.exitCode).toBe(1);
    const parsed = JSON.parse(logs.join('\n')) as { ok: boolean; missingKeys: string[] };
    expect(parsed.ok).toBe(false);
    expect(parsed.missingKeys).toContain('API_KEY');
  });

  it('env check passes when every key is set', async () => {
    await writeJson(path.join(root, 'package.json'), { name: 'x' });
    await fs.writeFile(path.join(root, '.env.example'), 'API_KEY=\n', 'utf8');
    await fs.writeFile(path.join(root, '.env'), 'API_KEY=value\n', 'utf8');

    await envCheckCommand(root, { json: true });
    expect(process.exitCode).toBeUndefined();
  });
});
