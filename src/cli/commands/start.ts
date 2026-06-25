import pc from 'picocolors';
import open from 'open';
import { runDoctor } from '../../core/doctor/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { startHubServer } from '../../server/index.js';
import { DEV_SURFACE_VERSION } from '../../version.js';
import { isHubRunning, registerWorkspaceRemotely, dashboardUrl } from '../hub/client.js';
import { printScanResult } from './scan.js';

export async function startCommand(options: {
  cwd?: string;
  port?: number;
  openBrowser?: boolean;
}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const port = options.port ?? 4567;

  console.log(pc.bold(`DevSurface v${DEV_SURFACE_VERSION}`));
  console.log('Scanning project...\n');

  const scan = await scanProject(cwd);
  printScanResult(scan);

  const warnings = await runDoctor(cwd, scan);
  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const item of warnings) {
      const marker = item.severity === 'error' ? pc.red('!') : pc.yellow('!');
      console.log(`  ${marker} ${item.title}`);
    }
  }

  if (await isHubRunning(port)) {
    console.log('\nHub already running. Registering workspace...');
    const registered = await registerWorkspaceRemotely(cwd, port);
    if (registered) {
      const url = dashboardUrl(registered.id, port);
      console.log(`Workspace ${pc.cyan(registered.name)} attached.`);
      console.log(`Dashboard -> ${pc.cyan(url)}`);
      if (options.openBrowser !== false) {
        await open(url);
      }
      return;
    }
    console.log('Could not register with running hub. Starting a new instance...');
  }

  const server = await startHubServer({
    port,
    openBrowser: options.openBrowser,
    initialWorkspace: cwd
  });

  console.log(`\nDashboard running at -> ${pc.cyan(server.url)}`);
}
