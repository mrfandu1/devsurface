import pc from 'picocolors';
import type { ScanResult } from '../../core/types.js';
import { runDoctor } from '../../core/doctor/index.js';
import { buildOnboardingPlan } from '../../core/onboarding/index.js';
import { renderMarkdownReport } from '../../core/report/markdown.js';
import { scanProject } from '../../core/scanner/index.js';
import { safeTerminalList, safeTerminalText } from '../terminal.js';

function formatList(values: string[]): string {
  return safeTerminalList(values);
}

export function printScanResult(scan: ScanResult): void {
  console.log(pc.bold(`Project:   ${safeTerminalText(scan.projectName)}`));
  console.log(`Language:  ${formatList(scan.language.detected) || 'unknown'}`);
  console.log(`Type:      ${safeTerminalText(scan.framework?.type ?? 'Unknown')}`);
  console.log(`Manager:   ${safeTerminalText(scan.packageManager ?? 'unknown')}`);
  console.log(`Scripts:   ${formatList(Object.keys(scan.scripts))}`);
  console.log(`Presets:   ${formatList(scan.presets.map((preset) => preset.label)) || 'none'}`);
  if (scan.git === null) {
    console.log('Git:       not detected');
  } else {
    const details: string[] = [];
    if (typeof scan.git.dirtyFiles === 'number' && scan.git.dirtyFiles > 0) {
      details.push(`${scan.git.dirtyFiles} changed`);
    }
    if (typeof scan.git.ahead === 'number' && scan.git.ahead > 0) {
      details.push(`${scan.git.ahead} ahead`);
    }
    if (typeof scan.git.behind === 'number' && scan.git.behind > 0) {
      details.push(`${scan.git.behind} behind`);
    }
    const suffix = details.length > 0 ? ` (${details.join(', ')})` : '';
    console.log(`Git:       ${safeTerminalText(`${scan.git.branch ?? 'detached'}${suffix}`)}`);
  }

  if (scan.monorepo !== null) {
    console.log(
      `Monorepo:  ${formatList(scan.monorepo.tools)} — ${scan.monorepo.packageCount} package${scan.monorepo.packageCount === 1 ? '' : 's'}`
    );
  }

  const tools = [
    scan.toolchain.testRunner,
    scan.toolchain.linter,
    scan.toolchain.bundler,
    scan.toolchain.orm,
    scan.toolchain.ci
  ].filter((tool): tool is string => tool !== null);
  if (tools.length > 0) {
    console.log(`Tools:     ${formatList([...new Set(tools)])}`);
  }

  if (scan.nodeRequirement !== null) {
    console.log(`Node req:  ${safeTerminalText(scan.nodeRequirement)}`);
  }

  if (scan.dependencies !== null) {
    console.log(
      `Deps:      ${scan.dependencies.runtimeCount} runtime + ${scan.dependencies.devCount} dev${scan.dependencies.lockfileStale ? pc.yellow(' (lockfile may be stale)') : ''}`
    );
  }

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

export async function scanCommand(
  cwd = process.cwd(),
  options: { json?: boolean; markdown?: boolean; summary?: boolean } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  if (options.json === true) {
    console.log(JSON.stringify(scan, null, 2));
    return;
  }
  if (options.markdown === true) {
    const warnings = await runDoctor(cwd, scan);
    const plan = buildOnboardingPlan(scan, warnings);
    console.log(renderMarkdownReport(scan, warnings, plan));
    return;
  }
  if (options.summary === true) {
    const warnings = await runDoctor(cwd, scan);
    const plan = buildOnboardingPlan(scan, warnings);
    const parts = [
      safeTerminalText(scan.projectName),
      scan.framework?.type ?? scan.language.detected.join('+') ?? 'unknown',
      scan.packageManager ?? 'no manager',
      scan.git?.branch != null ? safeTerminalText(scan.git.branch) : 'no git',
      `${Object.keys(scan.scripts).length} scripts`,
      `${warnings.length} warnings`,
      `${plan.readiness}% ready`
    ];
    console.log(parts.join(' · '));
    return;
  }
  printScanResult(scan);
}
