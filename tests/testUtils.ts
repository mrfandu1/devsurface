import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export async function makeTempProject(): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), 'devsurface-'));
}

export async function removeTempProject(root: string): Promise<void> {
  await fs.rm(root, { recursive: true, force: true });
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function mkdirp(filePath: string): Promise<void> {
  await fs.mkdir(filePath, { recursive: true });
}
