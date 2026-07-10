import { explainScript } from '../explain/index.js';
import type { DoctorWarning, OnboardingPlan, ScanResult } from '../types.js';

/** Keep table cells on one line and stop content from breaking the table. */
function cell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function code(value: string): string {
  return `\`${value.replace(/`/g, "'")}\``;
}

function severityIcon(severity: DoctorWarning['severity']): string {
  if (severity === 'error') {
    return '🔴';
  }
  return severity === 'warning' ? '🟡' : 'ℹ️';
}

function overviewSection(scan: ScanResult): string {
  const rows: Array<[string, string]> = [];
  rows.push(['Framework', scan.framework?.type ?? 'not detected']);
  rows.push([
    'Languages',
    scan.language.detected.length > 0 ? scan.language.detected.join(', ') : 'unknown'
  ]);
  rows.push(['Package manager', scan.packageManager ?? 'unknown']);

  if (scan.git !== null) {
    const details: string[] = [];
    if (typeof scan.git.dirtyFiles === 'number' && scan.git.dirtyFiles > 0) {
      details.push(`${scan.git.dirtyFiles} changed file${scan.git.dirtyFiles === 1 ? '' : 's'}`);
    }
    if (typeof scan.git.ahead === 'number' && scan.git.ahead > 0) {
      details.push(`${scan.git.ahead} ahead`);
    }
    if (typeof scan.git.behind === 'number' && scan.git.behind > 0) {
      details.push(`${scan.git.behind} behind`);
    }
    const suffix = details.length > 0 ? ` (${details.join(', ')})` : '';
    rows.push(['Branch', `${scan.git.branch ?? 'detached'}${suffix}`]);
  }

  if (scan.monorepo !== null) {
    rows.push([
      'Monorepo',
      `${scan.monorepo.tools.join(', ')} — ${scan.monorepo.packageCount} package${scan.monorepo.packageCount === 1 ? '' : 's'}`
    ]);
  }
  if (scan.dependencies !== null) {
    rows.push([
      'Dependencies',
      `${scan.dependencies.runtimeCount} runtime + ${scan.dependencies.devCount} dev`
    ]);
  }
  rows.push(['README', scan.readme.exists ? 'found' : 'missing']);
  rows.push(['LICENSE', scan.license.exists ? 'found' : 'missing']);

  const table = rows.map(([label, value]) => `| ${cell(label)} | ${cell(value)} |`).join('\n');
  return `## Overview\n\n| | |\n| --- | --- |\n${table}`;
}

function toolchainSection(scan: ScanResult): string {
  const rows: Array<[string, string | null | undefined]> = [
    ['Test runner', scan.toolchain.testRunner],
    ['E2E runner', scan.toolchain.e2eRunner],
    ['Linter', scan.toolchain.linter],
    ['Formatter', scan.toolchain.formatter],
    ['Bundler', scan.toolchain.bundler],
    ['ORM', scan.toolchain.orm],
    ['Styling', scan.toolchain.styling],
    ['CI', scan.toolchain.ci],
    ['TypeScript', scan.toolchain.typescript],
    ['Git hooks', scan.toolchain.gitHooks]
  ];
  const present = rows.filter((row): row is [string, string] => row[1] != null);
  if (present.length === 0) {
    return '';
  }
  const table = present.map(([label, tool]) => `| ${cell(label)} | ${cell(tool)} |`).join('\n');
  return `## Toolchain\n\n| Role | Tool |\n| --- | --- |\n${table}`;
}

function factsSection(scan: ScanResult): string {
  const rows: Array<[string, string]> = [];
  if (scan.licenseType != null) {
    rows.push(['License', scan.licenseType]);
  }
  if (typeof scan.git?.commitCount === 'number') {
    rows.push(['Commits', String(scan.git.commitCount)]);
  }
  if (scan.git?.latestTag != null) {
    rows.push(['Latest tag', scan.git.latestTag]);
  }
  if (scan.changelog?.exists === true) {
    rows.push(['Changelog', scan.changelog.latestVersion ?? 'present']);
  }
  if (scan.community?.contributing === true) {
    rows.push(['Contributing guide', 'yes']);
  }
  if (typeof scan.testFileCount === 'number' && scan.testFileCount > 0) {
    rows.push(['Test files', String(scan.testFileCount)]);
  }
  if (rows.length === 0) {
    return '';
  }
  const table = rows.map(([label, value]) => `| ${cell(label)} | ${cell(value)} |`).join('\n');
  return `## Project facts\n\n| | |\n| --- | --- |\n${table}`;
}

function readmeCommandsSection(scan: ScanResult): string {
  if (scan.readmeCommands.length === 0) {
    return '';
  }
  const items = scan.readmeCommands.map((command) => `- ${cell(code(command))}`).join('\n');
  return `## README quick start\n\n${items}`;
}

function readinessSection(plan: OnboardingPlan): string {
  const steps = plan.steps
    .map((step) => {
      const box = step.status === 'done' ? '[x]' : '[ ]';
      return `- ${box} ${cell(step.title)} — ${cell(step.description)}`;
    })
    .join('\n');
  return `## Setup readiness — ${plan.readiness}%\n\n${plan.summary}\n\n${steps}`;
}

function scriptsSection(scan: ScanResult): string {
  const entries = Object.entries(scan.scripts);
  if (entries.length === 0) {
    return '';
  }
  const rows = entries
    .map(
      ([name, command]) =>
        `| ${cell(code(name))} | ${cell(explainScript(name, command))} | ${cell(code(command))} |`
    )
    .join('\n');
  return `## Scripts\n\n| Script | What it does | Command |\n| --- | --- | --- |\n${rows}`;
}

function environmentSection(scan: ScanResult): string {
  const env = scan.env;
  if (env === null || (!env.hasExample && !env.hasLocal)) {
    return '';
  }
  const keys =
    env.keys.length > 0
      ? env.keys
      : env.exampleKeys.map((key) => ({
          key,
          present: false,
          empty: false
        }));
  if (keys.length === 0) {
    return '';
  }
  const rows = keys
    .map((key) => {
      const status = key.present ? (key.empty ? 'empty' : 'set') : 'missing';
      return `| ${cell(code(key.key))} | ${status} |`;
    })
    .join('\n');
  return `## Environment\n\nKey names only — values are never included.\n\n| Key | Status |\n| --- | --- |\n${rows}`;
}

function portsSection(scan: ScanResult): string {
  if (scan.ports.length === 0) {
    return '';
  }
  const rows = scan.ports
    .map((probe) => `| ${probe.port} | ${probe.inUse ? 'in use' : 'free'} |`)
    .join('\n');
  return `## Ports\n\n| Port | Status |\n| --- | --- |\n${rows}`;
}

function dockerSection(scan: ScanResult): string {
  const docker = scan.docker;
  if (docker === null || docker.composeFiles.length === 0) {
    return '';
  }
  const services =
    docker.services.length > 0
      ? docker.services.map((service) => `- ${cell(code(service.name))}`).join('\n')
      : '_Service list is available when Docker is running._';
  return `## Docker services\n\n${services}`;
}

function healthSection(warnings: DoctorWarning[]): string {
  if (warnings.length === 0) {
    return '## Repo health\n\nNo setup problems detected.';
  }
  const items = warnings
    .map(
      (warning) =>
        `- ${severityIcon(warning.severity)} **${cell(warning.title)}** — ${cell(warning.message)}`
    )
    .join('\n');
  return `## Repo health\n\n${items}`;
}

/**
 * Render the full scan as a Markdown report suitable for READMEs, wikis, and
 * pull-request descriptions. Env values are never included.
 */
export function renderMarkdownReport(
  scan: ScanResult,
  warnings: DoctorWarning[],
  plan: OnboardingPlan
): string {
  const generatedOn = new Date().toISOString().slice(0, 10);
  const sections = [
    `# ${cell(scan.projectName)} — project surface`,
    `_Generated by [DevSurface](https://github.com/mrfandu1/devsurface) on ${generatedOn}._`,
    overviewSection(scan),
    readinessSection(plan),
    toolchainSection(scan),
    factsSection(scan),
    readmeCommandsSection(scan),
    scriptsSection(scan),
    environmentSection(scan),
    portsSection(scan),
    dockerSection(scan),
    healthSection(warnings)
  ];
  return `${sections.filter((section) => section.length > 0).join('\n\n')}\n`;
}
