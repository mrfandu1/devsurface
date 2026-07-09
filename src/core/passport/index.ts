/**
 * Project Passport: a single, self-contained HTML page that explains a
 * repository to anyone — what it is, what it needs, and exactly how to run it.
 *
 * The passport is meant to be shared: emailed to a new contributor, dropped in
 * a chat for a non-technical teammate, or committed as living onboarding docs.
 * It renders offline in any browser with no external assets and no DevSurface
 * installed. The only JavaScript inside is a few lines for copy buttons.
 *
 * Everything is generated from local scan data. Environment key NAMES may be
 * listed; environment VALUES are never read, stored, or rendered.
 */

import { explainScript } from '../explain/index.js';
import { getPackageInstallCommand, getPackageRunCommand } from '../process/runner.js';
import type { DoctorWarning, OnboardingPlan, OnboardingStep, ScanResult } from '../types.js';

export interface PassportOptions {
  scan: ScanResult;
  warnings: DoctorWarning[];
  plan: OnboardingPlan;
  version: string;
  /** Injectable for deterministic tests. Defaults to now. */
  generatedAt?: Date;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const LANGUAGE_LABELS: Record<string, string> = {
  node: 'JavaScript / TypeScript',
  python: 'Python',
  go: 'Go',
  java: 'Java'
};

/**
 * Friendly one-line roles for well-known packages, so the tech stack section
 * can say what each major dependency is *for* instead of just naming it.
 */
const STACK_ROLES: Array<{ names: string[]; role: string }> = [
  { names: ['next'], role: 'Web framework' },
  { names: ['react', 'react-dom'], role: 'User interface library' },
  { names: ['vue'], role: 'User interface library' },
  { names: ['svelte'], role: 'User interface library' },
  { names: ['express'], role: 'Web server framework' },
  { names: ['fastify'], role: 'Web server framework' },
  { names: ['hono'], role: 'Web server framework' },
  { names: ['@nestjs/core'], role: 'Web server framework' },
  { names: ['@remix-run/react'], role: 'Web framework' },
  { names: ['prisma', '@prisma/client'], role: 'Database toolkit' },
  { names: ['mongoose'], role: 'MongoDB database layer' },
  { names: ['pg'], role: 'PostgreSQL database driver' },
  { names: ['redis', 'ioredis'], role: 'Redis cache client' },
  { names: ['typescript'], role: 'Typed JavaScript' },
  { names: ['vite'], role: 'Build tool and dev server' },
  { names: ['webpack'], role: 'Build tool' },
  { names: ['tailwindcss'], role: 'CSS styling framework' },
  { names: ['vitest', 'jest', 'mocha'], role: 'Test runner' },
  { names: ['playwright', '@playwright/test', 'cypress'], role: 'Browser testing' },
  { names: ['eslint'], role: 'Code quality checks' },
  { names: ['prettier'], role: 'Code formatting' },
  { names: ['commander', 'yargs'], role: 'Command-line framework' },
  { names: ['ws', 'socket.io'], role: 'Real-time connections' },
  { names: ['zod'], role: 'Data validation' },
  { names: ['axios'], role: 'HTTP requests' },
  { names: ['dotenv'], role: 'Loads .env settings' }
];

/** One friendly sentence saying what kind of project this is. */
function describeProject(scan: ScanResult): string {
  const configured = scan.config?.config.description;
  if (typeof configured === 'string' && configured.trim().length > 0) {
    return configured.trim();
  }
  const packageDescription = scan.packageJson?.data.description;
  if (typeof packageDescription === 'string' && packageDescription.trim().length > 0) {
    return packageDescription.trim();
  }

  const parts: string[] = [];
  if (scan.framework !== null) {
    parts.push(`built with ${scan.framework.type}`);
  }
  const languages = scan.language.detected
    .map((language) => LANGUAGE_LABELS[language] ?? language)
    .join(', ');
  if (languages.length > 0) {
    parts.push(`written in ${languages}`);
  }
  if (scan.docker !== null && scan.docker.composeFiles.length > 0) {
    parts.push('with Docker services');
  }
  if (parts.length === 0) {
    return 'A software project.';
  }
  return `A software project ${parts.join(', ')}.`;
}

/** Pick the command that starts the app, mirroring the onboarding heuristic. */
function startCommand(scan: ScanResult): string | null {
  if (scan.scripts.dev !== undefined) {
    return getPackageRunCommand(scan.packageManager, 'dev').displayCommand;
  }
  if (scan.scripts.start !== undefined) {
    return getPackageRunCommand(scan.packageManager, 'start').displayCommand;
  }
  const configured = { ...scan.presetCommands, ...(scan.config?.config.commands ?? {}) };
  for (const name of ['dev', 'start', 'serve']) {
    if (configured[name] !== undefined) {
      return configured[name];
    }
  }
  return null;
}

/**
 * The exact copy-paste command for a step, when one can be derived. Non-techies
 * should never have to guess what to type.
 */
function commandForStep(step: OnboardingStep, scan: ScanResult): string | null {
  const action = step.action;
  if (action === undefined) {
    return null;
  }
  if (action.kind === 'install') {
    return getPackageInstallCommand(scan.packageManager).displayCommand;
  }
  if (action.kind === 'env-copy') {
    return 'cp .env.example .env';
  }
  if (action.kind === 'run-script' && action.target !== undefined) {
    return getPackageRunCommand(scan.packageManager, action.target).displayCommand;
  }
  if (action.kind === 'run-command' && action.target !== undefined) {
    const configured = { ...scan.presetCommands, ...(scan.config?.config.commands ?? {}) };
    return configured[action.target] ?? null;
  }
  if (action.kind === 'docker') {
    return 'docker compose up -d';
  }
  return null;
}

function statusBadge(status: OnboardingStep['status']): string {
  if (status === 'done') {
    return '<span class="badge badge-done">Done</span>';
  }
  if (status === 'todo') {
    return '<span class="badge badge-todo">To do</span>';
  }
  return '<span class="badge badge-manual">Needs you</span>';
}

function severityBadge(severity: DoctorWarning['severity']): string {
  if (severity === 'error') {
    return '<span class="badge badge-error">Error</span>';
  }
  if (severity === 'warning') {
    return '<span class="badge badge-todo">Warning</span>';
  }
  return '<span class="badge badge-manual">Info</span>';
}

function heroBadges(scan: ScanResult): string {
  const badges: string[] = [];
  if (scan.framework !== null) {
    badges.push(scan.framework.type);
  }
  for (const language of scan.language.detected) {
    badges.push(LANGUAGE_LABELS[language] ?? language);
  }
  if (scan.packageManager !== null) {
    badges.push(scan.packageManager);
  }
  if (scan.git?.branch != null) {
    badges.push(`branch: ${scan.git.branch}`);
  }
  return badges
    .map((badge) => `<span class="badge badge-hero">${escapeHtml(badge)}</span>`)
    .join('\n          ');
}

/** A command row with a copy button. */
function commandRow(command: string, note: string): string {
  const escaped = escapeHtml(command);
  return `      <div class="recipe-row">
        <div class="recipe-note">${escapeHtml(note)}</div>
        <div class="recipe-command">
          <code>${escaped}</code>
          <button type="button" class="copy" data-copy="${escaped}">Copy</button>
        </div>
      </div>`;
}

/**
 * The complete fresh-machine recipe. The passport is usually generated on a
 * machine where setup is already done but read on one where nothing is — so
 * this always shows the full recipe, independent of current step status.
 */
function quickStartSection(scan: ScanResult): string {
  const rows: string[] = [];
  if (scan.language.detected.includes('node') && scan.packageJson !== null) {
    rows.push(
      commandRow(
        getPackageInstallCommand(scan.packageManager).displayCommand,
        'Install the packages the project needs'
      )
    );
  }
  if (scan.env?.hasExample) {
    rows.push(
      commandRow('cp .env.example .env', 'Create your local settings file (Windows: use copy)')
    );
  }
  if (scan.docker !== null && scan.docker.composeFiles.length > 0) {
    rows.push(commandRow('docker compose up -d', 'Start the background services'));
  }
  const start = startCommand(scan);
  if (start !== null) {
    rows.push(commandRow(start, 'Start the app'));
  }
  if (rows.length === 0) {
    return '';
  }
  return `  <section id="quick-start">
    <h2>Quick start</h2>
    <p class="muted">On a fresh machine, run these in a terminal from the project folder, top to bottom.</p>
${rows.join('\n')}
  </section>`;
}

/** What has to be installed on the machine before the quick start works. */
function requirementsSection(scan: ScanResult): string {
  const requirements: Array<{ name: string; detail: string }> = [];
  if (scan.language.detected.includes('node')) {
    const nodeRange = scan.packageJson?.data.engines?.node;
    requirements.push({
      name: 'Node.js',
      detail:
        typeof nodeRange === 'string' && nodeRange.trim().length > 0
          ? `version ${nodeRange.trim()}`
          : 'any recent LTS version'
    });
    if (scan.packageManager !== null && scan.packageManager !== 'npm') {
      requirements.push({
        name: scan.packageManager,
        detail: 'the package manager this project uses'
      });
    }
  }
  if (scan.language.detected.includes('python')) {
    requirements.push({ name: 'Python', detail: 'a recent Python 3 version' });
  }
  if (scan.language.detected.includes('go')) {
    requirements.push({ name: 'Go', detail: 'a recent Go toolchain' });
  }
  if (scan.language.detected.includes('php')) {
    requirements.push({ name: 'PHP', detail: 'a recent PHP version with Composer' });
  }
  if (scan.language.detected.includes('ruby')) {
    requirements.push({ name: 'Ruby', detail: 'a recent Ruby version with Bundler' });
  }
  if (scan.language.detected.includes('rust')) {
    requirements.push({ name: 'Rust', detail: 'a recent Rust toolchain (rustup)' });
  }
  if (scan.language.detected.includes('java')) {
    requirements.push({ name: 'Java', detail: 'a JDK matching the build files' });
  }
  if (scan.docker !== null && scan.docker.composeFiles.length > 0) {
    requirements.push({
      name: 'Docker Desktop',
      detail: 'runs the background services — start it before the quick start'
    });
  }
  if (requirements.length === 0) {
    return '';
  }
  const items = requirements
    .map(
      (requirement) =>
        `      <li><strong>${escapeHtml(requirement.name)}</strong> — ${escapeHtml(requirement.detail)}</li>`
    )
    .join('\n');
  return `  <section id="requirements">
    <h2>What you need installed</h2>
    <ul class="plain-list">
${items}
    </ul>
  </section>`;
}

function stepsSection(plan: OnboardingPlan, scan: ScanResult): string {
  if (plan.steps.length === 0) {
    return '<p class="muted">Nothing special to set up. Open the project and start exploring.</p>';
  }
  const items = plan.steps
    .map((step) => {
      const command = commandForStep(step, scan);
      const commandHtml =
        command !== null && step.status !== 'done'
          ? `\n        <div class="recipe-command"><code>${escapeHtml(command)}</code><button type="button" class="copy" data-copy="${escapeHtml(command)}">Copy</button></div>`
          : '';
      return `      <li class="step step-${step.status}">
        <div class="step-heading">${statusBadge(step.status)}<strong>${escapeHtml(step.title)}</strong></div>
        <p>${escapeHtml(step.description)}</p>${commandHtml}
      </li>`;
    })
    .join('\n');
  return `<ol class="steps">\n${items}\n    </ol>`;
}

/** Well-known dependencies with friendly roles, plus a total count. */
function stackSection(scan: ScanResult): string {
  const data = scan.packageJson?.data;
  if (data === undefined || data === null) {
    return '';
  }
  const all = { ...data.dependencies, ...data.devDependencies };
  const names = Object.keys(all);
  if (names.length === 0) {
    return '';
  }
  const seenRoles = new Set<string>();
  const highlights: Array<{ name: string; role: string }> = [];
  for (const entry of STACK_ROLES) {
    const found = entry.names.find((name) => all[name] !== undefined);
    if (found !== undefined && !seenRoles.has(entry.role)) {
      seenRoles.add(entry.role);
      highlights.push({ name: found, role: entry.role });
    }
    if (highlights.length >= 8) {
      break;
    }
  }
  if (highlights.length === 0) {
    return '';
  }
  const remaining = names.length - highlights.length;
  const cells = highlights
    .map(
      (highlight) => `      <div class="stack-cell">
        <code>${escapeHtml(highlight.name)}</code>
        <span>${escapeHtml(highlight.role)}</span>
      </div>`
    )
    .join('\n');
  const more =
    remaining > 0
      ? `\n    <p class="muted">…plus ${remaining} more package${remaining === 1 ? '' : 's'} doing supporting work.</p>`
      : '';
  return `  <section id="stack">
    <h2>The tech stack, translated</h2>
    <div class="stack-grid">
${cells}
    </div>${more}
  </section>`;
}

function scriptsSection(scan: ScanResult): string {
  const entries = Object.entries(scan.scripts);
  if (entries.length === 0) {
    return '<p class="muted">No package scripts detected.</p>';
  }
  const rows = entries
    .map(
      ([name, command]) => `      <tr>
        <td><code>${escapeHtml(name)}</code></td>
        <td>${escapeHtml(explainScript(name, command))}</td>
        <td class="raw"><code>${escapeHtml(command)}</code></td>
      </tr>`
    )
    .join('\n');
  return `<table>
      <thead><tr><th>Command</th><th>What it does</th><th>Exactly what runs</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>`;
}

function envSection(scan: ScanResult): string {
  const env = scan.env;
  if (env === null || (!env.hasExample && !env.hasLocal)) {
    return '<p class="muted">This project does not use a .env settings file.</p>';
  }
  if (env.keys.length === 0 && env.exampleKeys.length === 0) {
    return '<p class="muted">Environment files exist but declare no keys.</p>';
  }
  const keys =
    env.keys.length > 0
      ? env.keys.map((key) => ({
          key: key.key,
          state: key.present ? (key.empty ? 'empty' : 'set') : 'missing'
        }))
      : env.exampleKeys.map((key) => ({ key, state: 'missing' as const }));
  const rows = keys
    .map((entry) => {
      const badge =
        entry.state === 'set'
          ? '<span class="badge badge-done">Set</span>'
          : entry.state === 'empty'
            ? '<span class="badge badge-todo">Empty</span>'
            : '<span class="badge badge-error">Missing</span>';
      return `      <tr><td><code>${escapeHtml(entry.key)}</code></td><td>${badge}</td></tr>`;
    })
    .join('\n');
  return `<p class="muted">Only key names are shown. Values never leave your machine.</p>
    <table>
      <thead><tr><th>Setting</th><th>Status</th></tr></thead>
      <tbody>
${rows}
      </tbody>
    </table>`;
}

function portsSection(scan: ScanResult): string {
  if (scan.ports.length === 0) {
    return '<p class="muted">No specific network ports detected.</p>';
  }
  const items = scan.ports
    .map((probe) => {
      const badge = probe.inUse
        ? '<span class="badge badge-todo">Busy right now</span>'
        : '<span class="badge badge-done">Free</span>';
      return `      <li><code>${probe.port}</code> ${badge}</li>`;
    })
    .join('\n');
  return `<p class="muted">The app expects these ports. “Busy” means another program is using it.</p>
    <ul class="plain-list">\n${items}\n    </ul>`;
}

function dockerSection(scan: ScanResult): string {
  const docker = scan.docker;
  if (docker === null || docker.composeFiles.length === 0) {
    return '';
  }
  const services =
    docker.services.length > 0
      ? `<ul class="plain-list">\n${docker.services
          .map((service) => `      <li><code>${escapeHtml(service.name)}</code></li>`)
          .join('\n')}\n    </ul>`
      : '<p class="muted">Service list is available when Docker is running.</p>';
  return `  <section id="services">
    <h2>Background services (Docker)</h2>
    <p class="muted">This project uses Docker to run helper services (like databases) in the background.</p>
    ${services}
  </section>`;
}

function healthSection(warnings: DoctorWarning[]): string {
  if (warnings.length === 0) {
    return '<p class="muted">No setup problems detected. Looking good.</p>';
  }
  const items = warnings
    .map(
      (warning) => `      <li>
        <div class="step-heading">${severityBadge(warning.severity)}<strong>${escapeHtml(warning.title)}</strong></div>
        <p>${escapeHtml(warning.message)}</p>
      </li>`
    )
    .join('\n');
  return `<ul class="steps">\n${items}\n    </ul>`;
}

/** Condition-aware "when it breaks" advice in plain language. */
function troubleshootingSection(scan: ScanResult): string {
  const tips: Array<{ symptom: string; fix: string }> = [];
  if (scan.language.detected.includes('node')) {
    const manager = scan.packageManager ?? 'npm';
    tips.push({
      symptom: `“command not found” when running ${manager}`,
      fix:
        manager === 'npm'
          ? 'Node.js is not installed (or not on your PATH). Install the LTS version from the official Node.js site, then reopen your terminal.'
          : `Install Node.js first, then install ${manager} (it is a separate tool). Reopen your terminal afterwards.`
    });
  }
  if (scan.ports.length > 0) {
    tips.push({
      symptom: 'The app says a port is already in use (EADDRINUSE)',
      fix: 'Another program is using that port — often an old copy of this same app. Close other dev servers or restart your computer, then try again.'
    });
  }
  if (scan.env?.hasExample) {
    tips.push({
      symptom: 'The app starts, then crashes or complains about missing configuration',
      fix: 'Open the .env file and fill in any empty values. The “Settings this project needs” list above shows which keys must be set.'
    });
  }
  if (scan.docker !== null && scan.docker.composeFiles.length > 0) {
    tips.push({
      symptom: 'Docker commands fail or hang',
      fix: 'Docker Desktop is probably not running. Start it, wait for the whale icon to settle, then run the command again.'
    });
  }
  tips.push({
    symptom: 'Something else is wrong',
    fix: 'Run “npx devsurface” in the project folder — it opens a live dashboard that checks your setup and pinpoints what is missing.'
  });
  const items = tips
    .map(
      (tip) => `      <li>
        <strong>${escapeHtml(tip.symptom)}</strong>
        <p>${escapeHtml(tip.fix)}</p>
      </li>`
    )
    .join('\n');
  return `  <section id="troubleshooting">
    <h2>If something goes wrong</h2>
    <ul class="steps">
${items}
    </ul>
  </section>`;
}

/** A tiny glossary so newcomers are never lost in the words. */
function glossarySection(scan: ScanResult): string {
  const terms: Array<[string, string]> = [
    [
      'Terminal',
      'The text window where you type commands. On Windows use PowerShell; on Mac use Terminal.'
    ],
    ['Command', 'A line of text you type into the terminal and run by pressing Enter.'],
    [
      'Dependency',
      'A ready-made package of code this project reuses instead of writing from scratch.'
    ],
    ['Port', 'A numbered door on your computer that a running app listens on, like 3000 or 8080.'],
    [
      'localhost',
      'Your own computer. http://localhost:3000 means “the app running on my machine, door 3000”.'
    ]
  ];
  if (scan.env !== null && (scan.env.hasExample || scan.env.hasLocal)) {
    terms.splice(3, 0, [
      '.env file',
      'A private settings file with keys and secret values. It stays on your machine and is never shared.'
    ]);
  }
  const cells = terms
    .map(
      ([term, definition]) => `      <div class="stack-cell">
        <strong>${escapeHtml(term)}</strong>
        <span>${escapeHtml(definition)}</span>
      </div>`
    )
    .join('\n');
  return `  <section id="glossary">
    <h2>Words you will meet</h2>
    <div class="stack-grid glossary-grid">
${cells}
    </div>
  </section>`;
}

/**
 * Anthropic-blog-inspired light theme: warm oat canvas, ivory cards, dark warm
 * ink, serif display headings, and a book-cloth coral accent.
 */
const PASSPORT_CSS = `
  :root {
    color-scheme: light;
    --bg: #F0EEE6; --card: #FAF9F5; --ink: #141413; --muted: #73706A;
    --line: #E3DFD3; --accent: #CC785C; --accent-deep: #B15D41;
    --done: #3D7A4E; --warn: #96690F; --bad: #B4392A;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 40px 18px 24px; background: var(--bg); color: var(--ink);
    font: 16px/1.62 "Styrene A", "Segoe UI", system-ui, -apple-system, sans-serif;
  }
  main { max-width: 880px; margin: 0 auto; }
  h1, h2 {
    font-family: "Tiempos Headline", Georgia, "Times New Roman", serif;
    font-weight: 500; letter-spacing: -0.01em;
  }
  h1 { margin: 6px 0 10px; font-size: 40px; line-height: 1.15; }
  h2 { margin: 0 0 14px; font-size: 24px; }
  p { margin: 6px 0; }
  .muted { color: var(--muted); }
  .kicker {
    margin: 0; color: var(--accent-deep); font-size: 13px; font-weight: 700;
    letter-spacing: 0.14em; text-transform: uppercase;
  }
  .lede { font-size: 18.5px; max-width: 60ch; }
  nav.toc { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 22px; }
  nav.toc a {
    color: var(--ink); text-decoration: none; font-size: 13px; font-weight: 600;
    border: 1px solid var(--line); border-radius: 999px; padding: 6px 14px; background: var(--card);
  }
  nav.toc a:hover { border-color: var(--accent); color: var(--accent-deep); }
  header.hero, section {
    background: var(--card); border: 1px solid var(--line); border-radius: 14px;
    padding: 28px 32px; margin-bottom: 20px;
  }
  .badges { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 8px; }
  .badge {
    display: inline-block; border-radius: 999px; padding: 2px 11px;
    font-size: 12.5px; font-weight: 600; border: 1px solid var(--line); background: var(--bg);
  }
  .badge-hero { color: var(--accent-deep); border-color: #E5C8BA; background: #F7EDE7; }
  .badge-done { color: var(--done); border-color: #C4D9C9; background: #EDF4EE; }
  .badge-todo { color: var(--warn); border-color: #E4D2A8; background: #F8F1DE; }
  .badge-manual { color: var(--accent-deep); border-color: #E5C8BA; background: #F7EDE7; }
  .badge-error { color: var(--bad); border-color: #E7C2BB; background: #F9ECE9; }
  .readiness { margin-top: 18px; }
  .readiness-track { height: 10px; border-radius: 999px; background: #E6E2D6; overflow: hidden; }
  .readiness-fill { height: 100%; border-radius: 999px; background: var(--accent); }
  ol.steps, ul.steps { margin: 0; padding: 0 0 0 2px; list-style: none; }
  .steps li { border-top: 1px solid var(--line); padding: 14px 2px; }
  .steps li:first-child { border-top: none; padding-top: 4px; }
  .step-heading { display: flex; align-items: center; gap: 10px; margin-bottom: 2px; }
  .recipe-row { border-top: 1px solid var(--line); padding: 12px 0; }
  .recipe-row:first-of-type { border-top: none; }
  .recipe-note { font-size: 14px; color: var(--muted); margin-bottom: 6px; }
  .recipe-command {
    display: flex; align-items: center; gap: 10px; padding: 10px 14px; margin-top: 8px;
    border-radius: 9px; background: #191817; color: #F5F1E8; overflow-x: auto;
  }
  .recipe-command code { flex: 1 1 auto; white-space: pre; }
  button.copy {
    flex: 0 0 auto; border: 1px solid #4A4742; border-radius: 6px; cursor: pointer;
    background: transparent; color: #D8D2C4; font-size: 12px; font-weight: 600; padding: 4px 10px;
  }
  button.copy:hover { border-color: var(--accent); color: #F5F1E8; }
  code { font: 13.5px/1.5 ui-monospace, Consolas, "Cascadia Mono", monospace; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 9px 10px; border-top: 1px solid var(--line); vertical-align: top; }
  thead th { border-top: none; font-size: 13px; color: var(--muted); font-weight: 600; }
  td.raw { overflow-wrap: anywhere; }
  ul.plain-list { margin: 8px 0 0; padding-left: 4px; list-style: none; }
  ul.plain-list li { padding: 5px 0; }
  .stack-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(230px, 1fr)); gap: 12px; }
  .stack-cell {
    border: 1px solid var(--line); border-radius: 10px; background: var(--bg);
    padding: 12px 14px; display: flex; flex-direction: column; gap: 4px;
  }
  .stack-cell span { color: var(--muted); font-size: 13.5px; }
  .glossary-grid { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
  footer { text-align: center; color: var(--muted); font-size: 13px; padding: 10px 0 26px; }
  @media print {
    body { background: #fff; padding: 0; }
    header.hero, section { border: none; padding: 12px 0; break-inside: avoid; }
    nav.toc, button.copy { display: none; }
  }
`;

const COPY_SCRIPT = `
  document.addEventListener('click', function (event) {
    var button = event.target.closest('button.copy');
    if (!button || !navigator.clipboard) return;
    navigator.clipboard.writeText(button.getAttribute('data-copy') || '').then(function () {
      var original = button.textContent;
      button.textContent = 'Copied!';
      setTimeout(function () { button.textContent = original; }, 1600);
    });
  });
`;

/**
 * Render the passport as a complete standalone HTML document. Pure and
 * deterministic apart from the timestamp, which tests can inject.
 */
export function renderPassportHtml(options: PassportOptions): string {
  const { scan, warnings, plan, version } = options;
  const generatedAt = options.generatedAt ?? new Date();
  const name = escapeHtml(scan.projectName);
  const generatedOn = generatedAt.toISOString().slice(0, 10);
  const quickStart = quickStartSection(scan);
  const requirements = requirementsSection(scan);
  const stack = stackSection(scan);
  const docker = dockerSection(scan);
  const readinessLabel = plan.ready
    ? 'Ready to run'
    : `${plan.readiness}% ready — ${escapeHtml(plan.summary)}`;

  const tocEntries: Array<[string, string]> = [];
  if (quickStart !== '') tocEntries.push(['#quick-start', 'Quick start']);
  if (requirements !== '') tocEntries.push(['#requirements', 'What you need']);
  tocEntries.push(['#setup', 'Setup steps']);
  if (stack !== '') tocEntries.push(['#stack', 'Tech stack']);
  tocEntries.push(['#commands', 'Commands']);
  tocEntries.push(['#settings', 'Settings']);
  tocEntries.push(['#troubleshooting', 'Troubleshooting']);
  tocEntries.push(['#glossary', 'Glossary']);
  const toc = tocEntries.map(([href, label]) => `    <a href="${href}">${label}</a>`).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${name} — Project Passport</title>
<style>${PASSPORT_CSS}</style>
</head>
<body>
<main>
  <header class="hero">
    <p class="kicker">Project Passport</p>
    <h1>${name}</h1>
    <p class="lede">${escapeHtml(describeProject(scan))}</p>
    <div class="badges">
          ${heroBadges(scan)}
    </div>
    <div class="readiness">
      <p class="muted">${readinessLabel}</p>
      <div class="readiness-track"><div class="readiness-fill" style="width:${plan.readiness}%"></div></div>
    </div>
  </header>

  <nav class="toc">
${toc}
  </nav>

${quickStart}
${requirements}
  <section id="setup">
    <h2>Setup, step by step</h2>
    <p class="muted">The detailed version of the quick start. Anything marked “Done” was already true when this passport was generated.</p>
    ${stepsSection(plan, scan)}
  </section>

${stack}
  <section id="commands">
    <h2>Every command, explained</h2>
    ${scriptsSection(scan)}
  </section>

  <section id="settings">
    <h2>Settings this project needs</h2>
    ${envSection(scan)}
  </section>

  <section id="ports">
    <h2>Network ports</h2>
    ${portsSection(scan)}
  </section>

${docker}
  <section id="health">
    <h2>Health check</h2>
    ${healthSection(warnings)}
  </section>

${troubleshootingSection(scan)}
${glossarySection(scan)}
  <footer>
    Generated by DevSurface v${escapeHtml(version)} on ${generatedOn} ·
    Everything was collected locally. No secrets, tokens, or .env values are included.
  </footer>
</main>
<script>${COPY_SCRIPT}</script>
</body>
</html>
`;
}
