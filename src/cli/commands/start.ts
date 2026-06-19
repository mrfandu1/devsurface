import pc from 'picocolors';
import { runDoctor } from '../../core/doctor/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { startDevSurfaceServer } from '../../server/index.js';
import { printScanResult } from './scan.js';

export async function startCommand(options: {
  cwd?: string;
  port?: number;
  openBrowser?: boolean;
}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  console.log(pc.bold(`DevSurface v0.2.0`));
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

  const server = await startDevSurfaceServer({
    projectRoot: cwd,
    port: options.port,
    openBrowser: options.openBrowser
  });

  console.log(`\nDashboard running at -> ${pc.cyan(server.url)}`);
}
