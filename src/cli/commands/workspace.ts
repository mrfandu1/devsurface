import path from 'node:path';
import pc from 'picocolors';
import { WorkspaceRegistry } from '../../core/hub/registry.js';

export async function workspaceAddCommand(dirPath?: string): Promise<void> {
  const registry = new WorkspaceRegistry();
  const target = path.resolve(dirPath ?? process.cwd());
  const entry = await registry.add(target);
  console.log(`Added workspace ${pc.cyan(entry.name)} (${entry.id}) -> ${entry.path}`);
}

export async function workspaceListCommand(): Promise<void> {
  const registry = new WorkspaceRegistry();
  const entries = await registry.list();

  if (entries.length === 0) {
    console.log(
      'No workspaces registered. Run `devsurface workspace add` or `npx devsurface` inside a project.'
    );
    return;
  }

  console.log(`${entries.length} workspace${entries.length === 1 ? '' : 's'}:\n`);
  for (const entry of entries) {
    console.log(`  ${pc.cyan(entry.name)} (${entry.id})`);
    console.log(`    ${entry.path}`);
  }
}

export async function workspaceRemoveCommand(id: string): Promise<void> {
  const registry = new WorkspaceRegistry();
  const removed = await registry.remove(id);
  if (removed) {
    console.log(`Removed workspace ${pc.cyan(id)}.`);
  } else {
    console.error(`Workspace "${id}" not found.`);
    process.exitCode = 1;
  }
}
