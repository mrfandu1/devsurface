/**
 * A plain-English narrative summary of a scanned project.
 *
 * Turns the structured scan into the paragraph a friendly senior developer
 * would say out loud when handing the project over: what it is, what it is
 * built with, how to run it, and what to watch out for. Deterministic — the
 * same scan always produces the same words.
 */

import type { ScanResult } from '../types.js';

export interface FactSheetEntry {
  label: string;
  value: string;
}

function listNicely(items: string[]): string {
  if (items.length <= 1) {
    return items[0] ?? '';
  }
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function languageName(language: string): string {
  const names: Record<string, string> = {
    node: 'JavaScript/TypeScript',
    python: 'Python',
    go: 'Go',
    java: 'Java',
    rust: 'Rust',
    php: 'PHP',
    ruby: 'Ruby'
  };
  return names[language] ?? language;
}

function installCommand(scan: ScanResult): string {
  switch (scan.packageManager) {
    case 'pnpm':
      return 'pnpm install';
    case 'yarn':
      return 'yarn';
    case 'bun':
      return 'bun install';
    default:
      return 'npm install';
  }
}

/** The sentence(s) describing what the project is. */
function identitySentence(scan: ScanResult): string {
  // Trailing punctuation is stripped so the sentence we build stays clean.
  const description =
    (scan.config?.config.description ?? scan.packageJson?.data.description)
      ?.trim()
      .replace(/[.!]+$/, '') ?? null;
  const frameworks = (scan.framework?.detected ?? []).filter((label) => label !== 'Node.js');
  const language = scan.language.primary === null ? null : languageName(scan.language.primary);

  let sentence = `“${scan.projectName}”`;
  sentence +=
    description === null || description.length === 0
      ? ' is a software project'
      : ` is ${/^(a|an|the)\s/i.test(description) ? description : `a project described as: ${description}`}`;
  const builtWith: string[] = [];
  if (language !== null) {
    builtWith.push(language);
  }
  builtWith.push(...frameworks.slice(0, 3));
  if (builtWith.length > 0) {
    sentence += `. It is built with ${listNicely(builtWith)}`;
  }
  return `${sentence}.`;
}

/** The sentence describing how to start it. */
function howToRunSentence(scan: ScanResult): string | null {
  if ((scan.config?.config.launch?.length ?? 0) > 0) {
    return 'It has a one-command launch sequence: “devsurface up” starts everything in the right order.';
  }
  const dev = ['dev', 'start', 'serve'].find((name) => scan.scripts[name] !== undefined);
  if (dev !== undefined) {
    const pm = scan.packageManager ?? 'npm';
    const runner = pm === 'yarn' ? 'yarn' : pm === 'bun' ? 'bun run' : `${pm} run`;
    return `To see it running, install dependencies with “${installCommand(scan)}”, then start it with “${runner} ${dev}”.`;
  }
  if (Object.keys(scan.scripts).length > 0) {
    return `It defines ${Object.keys(scan.scripts).length} scripts, but no obvious “dev” or “start” one — check the README for how to run it.`;
  }
  return null;
}

/** The sentence describing what you need before it will run. */
function requirementsSentence(scan: ScanResult): string | null {
  const needs: string[] = [];
  if (scan.nodeRequirement != null) {
    needs.push(`Node.js ${scan.nodeRequirement}`);
  }
  if ((scan.docker?.composeFiles.length ?? 0) > 0) {
    needs.push('Docker (it runs supporting services in containers)');
  }
  if (scan.env?.hasExample === true) {
    needs.push(`a .env settings file (${scan.env.exampleKeys.length} keys, template provided)`);
  }
  if (needs.length === 0) {
    return null;
  }
  return `Before it will run you need ${listNicely(needs)}.`;
}

/** The sentence describing the safety nets. */
function qualitySentence(scan: ScanResult): string | null {
  const nets: string[] = [];
  if (scan.toolchain.testRunner !== null) {
    nets.push(`automated tests (${scan.toolchain.testRunner})`);
  }
  if (scan.toolchain.linter !== null) {
    nets.push(`a code checker (${scan.toolchain.linter})`);
  }
  if (scan.toolchain.formatter !== null) {
    nets.push(`an auto-formatter (${scan.toolchain.formatter})`);
  }
  if (scan.toolchain.ci !== null) {
    nets.push(`a CI robot (${scan.toolchain.ci}) that re-checks every shared change`);
  }
  if (nets.length === 0) {
    return null;
  }
  return `Quality-wise it has ${listNicely(nets)}.`;
}

/** The sentence describing size and activity. */
function shapeSentence(scan: ScanResult): string | null {
  const facts: string[] = [];
  if ((scan.monorepo?.packageCount ?? 0) > 1) {
    facts.push(`a monorepo of ${scan.monorepo?.packageCount} packages`);
  }
  const deps = scan.dependencies;
  if (deps !== null && deps !== undefined) {
    facts.push(`${deps.runtimeCount + deps.devCount} direct dependencies`);
  }
  const commits = scan.git?.commitCount;
  if (typeof commits === 'number' && commits > 0) {
    facts.push(`${commits} commits of history`);
  }
  if (facts.length === 0) {
    return null;
  }
  return `In shape it is ${listNicely(facts)}.`;
}

/**
 * The full plain-English paragraph. Every sentence is optional except the
 * identity one, so sparse projects still read naturally.
 */
export function buildPlainSummary(scan: ScanResult): string {
  const sentences = [
    identitySentence(scan),
    requirementsSentence(scan),
    howToRunSentence(scan),
    qualitySentence(scan),
    shapeSentence(scan)
  ].filter((sentence): sentence is string => sentence !== null);
  return sentences.join(' ');
}

/** Short label/value facts for at-a-glance display (dashboard and CLI). */
export function buildFactSheet(scan: ScanResult): FactSheetEntry[] {
  const facts: FactSheetEntry[] = [];
  facts.push({ label: 'Project', value: scan.projectName });
  if (scan.packageJson?.data.version !== undefined) {
    facts.push({ label: 'Version', value: scan.packageJson.data.version });
  }
  if (scan.language.primary !== null) {
    facts.push({ label: 'Language', value: languageName(scan.language.primary) });
  }
  const frameworks = (scan.framework?.detected ?? []).filter((label) => label !== 'Node.js');
  if (frameworks.length > 0) {
    facts.push({ label: 'Built with', value: frameworks.slice(0, 5).join(', ') });
  }
  if (scan.packageManager !== null) {
    facts.push({ label: 'Package manager', value: scan.packageManager });
  }
  facts.push({ label: 'Scripts', value: String(Object.keys(scan.scripts).length) });
  if (scan.env !== null) {
    facts.push({
      label: 'Settings (.env)',
      value: scan.env.hasLocal
        ? `present, ${scan.env.missingKeys.length} missing keys`
        : scan.env.hasExample
          ? 'not created yet (template exists)'
          : 'none'
    });
  }
  if ((scan.docker?.services.length ?? 0) > 0) {
    facts.push({
      label: 'Docker services',
      value: String(scan.docker?.services.length ?? 0)
    });
  }
  if (scan.git?.branch != null) {
    facts.push({ label: 'Git branch', value: scan.git.branch });
  }
  if (scan.nodeRequirement != null) {
    facts.push({ label: 'Needs Node', value: scan.nodeRequirement });
  }
  return facts;
}
