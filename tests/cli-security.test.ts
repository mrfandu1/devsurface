import { promises as fs } from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { doctorCommand } from '../src/cli/commands/doctor.js';
import { printScanResult } from '../src/cli/commands/scan.js';
import { scanProject } from '../src/core/scanner/index.js';
import { makeTempProject, removeTempProject, writeJson } from './testUtils.js';

const tempProjects: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempProjects.splice(0).map((project) => removeTempProject(project)));
});

async function tempProject(): Promise<string> {
  const project = await makeTempProject();
  tempProjects.push(project);
  return project;
}

function captureConsole(): string[] {
  const writes: string[] = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    writes.push(args.join(' '));
  });
  return writes;
}

describe('CLI security output', () => {
  it('neutralizes repository-controlled terminal sequences in scan output', async () => {
    const root = await tempProject();
    await writeJson(path.join(root, 'package.json'), {
      name: 'evil\u001B]2;owned-title\u0007\u001B[2Jafter',
      scripts: {
        'dev\u001B]8;;https://attacker.invalid\u0007click\u001B]8;;\u0007': 'vite'
      }
    });
    const writes = captureConsole();

    printScanResult(await scanProject(root));

    const output = writes.join('\n');
    expect(output).toContain('evilafter');
    expect(output).toContain('devclick');
    expect(output).not.toContain('\u001B]2;');
    expect(output).not.toContain('\u001B[2J');
    expect(output).not.toContain('\u001B]8;;');
  });

  it('neutralizes config-controlled terminal sequences in doctor output', async () => {
    const root = await tempProject();
    const badKey = 'bad\u001B]2;doctor-title\u0007\u001B[31m';
    await fs.writeFile(
      path.join(root, 'devsurface.config.json'),
      JSON.stringify({
        commands: {
          [badKey]: 123
        },
        groups: {
          [`grp${badKey}`]: 'not-array'
        }
      }),
      'utf8'
    );
    const writes = captureConsole();

    await doctorCommand(root);

    const output = writes.join('\n');
    expect(output).toContain('commands.bad must be a string.');
    expect(output).toContain('groups.grpbad must be an array of command names.');
    expect(output).not.toContain('doctor-title');
    expect(output).not.toContain('\u001B]2;');
  });
});
