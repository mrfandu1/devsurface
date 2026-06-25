import pc from 'picocolors';
import { startHubServer } from '../../server/index.js';
import { DEV_SURFACE_VERSION } from '../../version.js';

export async function serveCommand(options: {
  port?: number;
  openBrowser?: boolean;
}): Promise<void> {
  console.log(pc.bold(`DevSurface Hub v${DEV_SURFACE_VERSION}`));
  console.log('Starting hub server...\n');

  const server = await startHubServer({
    port: options.port,
    openBrowser: options.openBrowser
  });

  const summaries = await server.hub.listSummaries();
  if (summaries.length > 0) {
    console.log(`Registered workspaces: ${summaries.length}`);
    for (const ws of summaries) {
      console.log(`  ${pc.cyan(ws.name)} -> ${ws.path}`);
    }
  } else {
    console.log(
      'No workspaces registered yet. Use `devsurface workspace add` or `npx devsurface` inside a project.'
    );
  }

  console.log(`\nHub running at -> ${pc.cyan(server.url)}`);
}
