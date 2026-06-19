import { promises as fs } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { CONFIG_FILE_NAME, defaultConfig } from '../../core/config/defaults.js';

export async function initCommand(cwd = process.cwd()): Promise<void> {
  const configPath = path.join(cwd, CONFIG_FILE_NAME);

  try {
    await fs.access(configPath);
    console.log(pc.yellow(`${CONFIG_FILE_NAME} already exists.`));
    return;
  } catch {
    await fs.writeFile(configPath, `${JSON.stringify(defaultConfig, null, 2)}\n`, 'utf8');
    console.log(pc.green(`Created ${CONFIG_FILE_NAME}.`));
  }
}
