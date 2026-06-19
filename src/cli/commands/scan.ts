import pc from 'picocolors';
import type { ScanResult } from '../../core/types.js';
import { scanProject } from '../../core/scanner/index.js';

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(', ') : 'none';
}

export function printScanResult(scan: ScanResult): void {
  console.log(pc.bold(`Project:   ${scan.projectName}`));
  console.log(`Type:      ${scan.framework?.type ?? 'Unknown'}`);
  console.log(`Manager:   ${scan.packageManager ?? 'unknown'}`);
  console.log(`Scripts:   ${formatList(Object.keys(scan.scripts))}`);
  console.log(`Git:       ${scan.git?.branch ?? 'not detected'}`);
  console.log(`README:    ${scan.readme.exists ? 'found' : 'missing'}`);
  console.log(`LICENSE:   ${scan.license.exists ? 'found' : 'missing'}`);

  if (scan.env !== null) {
    console.log(`Env:       ${scan.env.hasLocal ? '.env found' : '.env missing'}`);
  }

  if (scan.ports.length > 0) {
    const ports = scan.ports.map((port) => `${port.port}${port.inUse ? ' in use' : ' free'}`);
    console.log(`Ports:     ${ports.join(', ')}`);
  }

  if (scan.docker !== null) {
    console.log(
      `Docker:    compose found (${formatList(scan.docker.services.map((service) => service.name))})`
    );
  }
}

export async function scanCommand(cwd = process.cwd()): Promise<void> {
  printScanResult(await scanProject(cwd));
}
