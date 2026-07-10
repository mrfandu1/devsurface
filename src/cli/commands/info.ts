import os from 'node:os';
import path from 'node:path';
import pc from 'picocolors';
import { WorkspaceRegistry } from '../../core/hub/registry.js';
import { DEV_SURFACE_VERSION } from '../../version.js';

/** Print where DevSurface keeps its data and what it knows about this machine. */
export async function infoCommand(options: { json?: boolean } = {}): Promise<void> {
  const dataDir = process.env.DEVSURFACE_DATA_DIR ?? path.join(os.homedir(), '.devsurface');
  const registry = new WorkspaceRegistry();
  const workspaces = await registry.list();

  if (options.json === true) {
    console.log(
      JSON.stringify(
        {
          version: DEV_SURFACE_VERSION,
          node: process.version,
          platform: `${process.platform} ${process.arch}`,
          dataDir,
          registryPath: path.join(dataDir, 'workspaces.json'),
          historyDir: path.join(dataDir, 'history'),
          workspaceCount: workspaces.length
        },
        null,
        2
      )
    );
    return;
  }

  console.log(pc.bold(`DevSurface v${DEV_SURFACE_VERSION}`));
  console.log(`Node:        ${process.version} (${process.platform} ${process.arch})`);
  console.log(`Data dir:    ${dataDir}`);
  console.log(`  registry:  ${path.join(dataDir, 'workspaces.json')}`);
  console.log(`  history:   ${path.join(dataDir, 'history')}`);
  console.log(`Workspaces:  ${workspaces.length} registered`);
  console.log(pc.dim('\nEverything above stays on this machine. No telemetry, no accounts.'));
}
