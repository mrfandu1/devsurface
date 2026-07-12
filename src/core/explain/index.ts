/**
 * Plain-English explanations of common package scripts and configured commands.
 *
 * Aimed at non-technical users who open a project, see a command like `vite` or
 * `tsc --noEmit`, and have no idea what it does or whether it is safe to click.
 * These are pure, deterministic heuristics — no network calls, no AI, no
 * telemetry. The goal is a single friendly sentence per command.
 */

interface NameIntent {
  /** Base script names (the part before any `:` or `/` namespacing). */
  keys: string[];
  explanation: string;
}

interface ToolIntent {
  test: RegExp;
  explanation: string;
}

/**
 * Conventional script-name intents, checked first because the name expresses
 * what the maintainer *meant* (clearer to a newcomer than the raw tool).
 */
const NAME_INTENTS: NameIntent[] = [
  {
    keys: ['dev', 'develop', 'serve', 'watch', 'start:dev'],
    explanation:
      'Starts the development server so you can preview the app in your browser while you work.'
  },
  { keys: ['start'], explanation: 'Starts the application.' },
  {
    keys: ['build', 'compile', 'bundle', 'dist'],
    explanation: 'Builds the app into optimized files ready for production.'
  },
  {
    keys: ['preview'],
    explanation: 'Runs the finished production build locally so you can preview it.'
  },
  {
    keys: ['test', 'tests', 'spec', 'unit'],
    explanation: 'Runs the automated tests to check the code still works.'
  },
  {
    keys: ['e2e', 'integration'],
    explanation: 'Runs end-to-end tests that drive the app like a real user.'
  },
  {
    keys: ['lint'],
    explanation: 'Checks the code for style problems and common mistakes.'
  },
  {
    keys: ['format', 'fmt', 'prettier'],
    explanation: 'Automatically reformats the code to a consistent style.'
  },
  {
    keys: ['typecheck', 'tsc', 'types'],
    explanation: 'Checks the code for type errors.'
  },
  {
    keys: ['migrate', 'migration', 'migrations'],
    explanation: 'Applies pending database changes (migrations).'
  },
  { keys: ['seed'], explanation: 'Fills the database with starter sample data.' },
  {
    keys: ['clean'],
    explanation: 'Deletes generated files and leftover build output.'
  },
  {
    keys: ['deploy', 'release', 'publish'],
    explanation: 'Publishes or deploys the project — double-check before running this one.'
  },
  {
    keys: ['install', 'setup', 'bootstrap'],
    explanation: 'Installs the tools and packages the project needs.'
  },
  {
    keys: ['storybook'],
    explanation: 'Starts Storybook to preview UI components on their own.'
  },
  { keys: ['docs'], explanation: 'Builds or serves the project documentation.' },
  {
    keys: ['coverage'],
    explanation: 'Runs the tests and reports how much of the code they cover.'
  },
  {
    keys: ['bench', 'benchmark'],
    explanation: 'Measures how fast parts of the code run.'
  },
  {
    keys: ['generate', 'gen', 'codegen'],
    explanation: 'Generates code or files the project needs from schemas or templates.'
  },
  {
    keys: ['analyze', 'analyse'],
    explanation: 'Analyzes the build output, usually to inspect bundle size.'
  },
  {
    keys: ['fix'],
    explanation: 'Automatically fixes the code problems that tools can fix on their own.'
  },
  {
    keys: ['reset'],
    explanation: 'Resets local state (often the database) back to a clean starting point.'
  },
  {
    keys: ['prepare'],
    explanation: 'Sets up project tooling — this usually runs automatically after install.'
  },
  {
    keys: ['db', 'database'],
    explanation: 'Works with the project database (migrations, seeds, or a console).'
  },
  {
    keys: ['smoke'],
    explanation: 'Runs a quick smoke test to confirm the basics still work.'
  },
  {
    keys: ['postinstall'],
    explanation: 'Runs automatically right after dependencies are installed.'
  },
  {
    keys: ['preview:prod', 'stage', 'staging'],
    explanation: 'Runs the app the way it will run in the staging/pre-release environment.'
  },
  {
    keys: ['validate'],
    explanation: 'Runs the project’s full set of quality checks in one go.'
  },
  {
    keys: ['audit'],
    explanation: 'Checks installed packages for known security problems.'
  },
  {
    keys: ['update', 'upgrade', 'bump'],
    explanation: 'Updates the project’s packages to newer versions.'
  },
  {
    keys: ['translate', 'i18n', 'intl', 'locales'],
    explanation: 'Works with the app’s translations (extracting or compiling language files).'
  },
  {
    keys: ['email', 'emails'],
    explanation: 'Builds or previews the app’s email templates.'
  },
  {
    keys: ['proxy'],
    explanation: 'Starts a local relay that forwards requests to another server.'
  },
  {
    keys: ['tunnel'],
    explanation: 'Opens a temporary public URL that forwards to your local app.'
  },
  {
    keys: ['mock', 'mocks', 'fixtures'],
    explanation: 'Starts or generates fake data/services so you can develop without the real ones.'
  },
  {
    keys: ['profile', 'profiling'],
    explanation: 'Runs the app while measuring where it spends its time.'
  },
  {
    keys: ['sitemap'],
    explanation: 'Generates the sitemap file search engines use to index the site.'
  },
  {
    keys: ['icons', 'sprites', 'assets', 'images'],
    explanation: 'Prepares images, icons, or other static assets the app uses.'
  },
  {
    keys: ['sync'],
    explanation: 'Synchronizes generated files or data with their source of truth.'
  },
  {
    keys: ['knip', 'unused', 'deadcode'],
    explanation: 'Finds unused files, exports, and dependencies that can be deleted.'
  },
  {
    keys: ['size'],
    explanation: 'Checks how large the built app is.'
  },
  {
    keys: ['changelog'],
    explanation: 'Generates or updates the changelog from recent changes.'
  },
  {
    keys: ['version'],
    explanation: 'Bumps the project’s version number as part of a release.'
  },
  {
    keys: ['login', 'auth'],
    explanation: 'Logs in to an external service the project publishes to or reads from.'
  },
  {
    keys: ['studio'],
    explanation: 'Opens a visual admin tool (often a database browser) in your browser.'
  }
];

/**
 * Tool-based fallback, checked against the raw command when the script name is
 * not a known convention. More specific patterns come first.
 */
const TOOL_INTENTS: ToolIntent[] = [
  {
    test: /nodemon|ts-node-dev/,
    explanation: 'Runs the app and restarts it automatically whenever you change a file.'
  },
  {
    test: /vite\s+build|webpack|rollup|esbuild|\btsup\b|\bparcel\b/,
    explanation: 'Builds the app into optimized files ready for production.'
  },
  {
    test: /next\s+dev|vite|remix\s+dev|astro\s+dev|nuxt\s+dev|ng\s+serve|gatsby\s+develop|expo\s+start/,
    explanation: 'Starts the development server so you can preview the app in your browser.'
  },
  {
    test: /turbo\s+run|\bturbo\b|\bnx\s|lerna\s+run/,
    explanation: 'Runs a task across every package in this monorepo.'
  },
  {
    test: /concurrently|npm-run-all|\brun-p\b|\brun-s\b/,
    explanation: 'Runs several of the project’s scripts together in one go.'
  },
  {
    test: /wrangler\s+(deploy|publish)|vercel(\s+deploy)?$|netlify\s+deploy|firebase\s+deploy|gh-pages/,
    explanation: 'Deploys the project — double-check before running this one.'
  },
  {
    test: /changeset/,
    explanation: 'Manages version bumps and release notes for the next release.'
  },
  {
    test: /husky|lint-staged/,
    explanation: 'Sets up or runs git hooks that check code before each commit.'
  },
  {
    test: /rimraf|del-cli|\brm\s+-rf\b/,
    explanation: 'Deletes generated files and leftover build output.'
  },
  {
    test: /electron-builder|electron-packager|electron-forge/,
    explanation: 'Packages the desktop app into an installer for distribution.'
  },
  {
    test: /\belectron\b/,
    explanation: 'Starts the desktop (Electron) version of the app.'
  },
  {
    test: /tauri\s+dev/,
    explanation: 'Starts the desktop (Tauri) version of the app for development.'
  },
  {
    test: /tauri\s+build/,
    explanation: 'Builds the desktop (Tauri) app into an installable program.'
  },
  {
    test: /drizzle-kit/,
    explanation: 'Manages the database schema and migrations with Drizzle.'
  },
  {
    test: /\bstorybook\b/,
    explanation: 'Starts Storybook to preview UI components on their own.'
  },
  {
    test: /node\s+--watch|tsx\s+watch/,
    explanation: 'Runs the app and restarts it automatically whenever you change a file.'
  },
  {
    test: /\bknip\b|\bdepcheck\b/,
    explanation: 'Finds unused files, exports, and dependencies that can be deleted.'
  },
  {
    test: /\bmadge\b|dependency-cruiser|\bdepcruise\b/,
    explanation: 'Analyzes the dependency graph, usually to find circular imports.'
  },
  {
    test: /size-limit|bundlesize/,
    explanation: 'Checks that the built bundle stays under its size budget.'
  },
  {
    test: /semantic-release/,
    explanation: 'Publishes a release automatically based on commit messages.'
  },
  {
    test: /commitlint/,
    explanation: 'Checks that commit messages follow the project’s convention.'
  },
  {
    test: /playwright|cypress/,
    explanation: 'Runs end-to-end tests that drive the app like a real user.'
  },
  {
    test: /vitest|\bjest\b|mocha|\bava\b|pytest|\bgo\s+test\b/,
    explanation: 'Runs the automated tests to check the code works.'
  },
  {
    test: /eslint|biome\s+lint|ruff|flake8/,
    explanation: 'Checks the code for style problems and common mistakes.'
  },
  {
    test: /prettier|biome\s+format|black\b/,
    explanation: 'Reformats the code to a consistent style.'
  },
  { test: /tsc\b/, explanation: 'Compiles and type-checks the TypeScript code.' },
  { test: /prisma/, explanation: 'Manages the database schema and data with Prisma.' },
  {
    test: /docker[-\s]compose|\bdocker\b/,
    explanation: 'Starts or manages the project’s Docker containers.'
  },
  { test: /\bgo\s+run\b/, explanation: 'Runs the Go program.' },
  { test: /\bgo\s+build\b/, explanation: 'Builds the Go program into an executable.' },
  {
    test: /uvicorn|flask\s+run|manage\.py\s+runserver/,
    explanation: 'Starts the development server so you can preview the app in your browser.'
  },
  {
    test: /wrangler\s+dev|netlify\s+dev|vercel\s+dev|firebase\s+(serve|emulators)/,
    explanation: 'Runs a local imitation of the cloud platform so you can test without deploying.'
  },
  {
    test: /\bserverless\b|\bsls\s|\bsam\s+(local|build|deploy)|\bcdk\s/,
    explanation: 'Works with the project’s cloud infrastructure definition.'
  },
  {
    test: /terraform|pulumi/,
    explanation:
      'Manages cloud infrastructure from configuration files — changes real resources, so read before running.'
  },
  {
    test: /\bansible\b|\bpacker\b/,
    explanation:
      'Automates server setup and machine images — usually for operations, not day-to-day coding.'
  },
  {
    test: /kubectl|\bhelm\b|skaffold|minikube|\bk9s\b/,
    explanation: 'Manages apps running on a Kubernetes cluster.'
  },
  {
    test: /graphql-codegen|apollo\s+codegen/,
    explanation: 'Generates typed code from the GraphQL schema so queries stay in sync.'
  },
  {
    test: /openapi|swagger/,
    explanation: 'Generates or serves the API documentation/spec.'
  },
  {
    test: /typedoc|jsdoc|api-extractor/,
    explanation: 'Generates reference documentation from comments in the code.'
  },
  {
    test: /license-checker|licensee/,
    explanation: 'Checks the licenses of installed packages for compliance.'
  },
  {
    test: /npm-check-updates|\bncu\b|taze|renovate/,
    explanation: 'Finds newer versions of the project’s packages.'
  },
  {
    test: /npm\s+audit|pnpm\s+audit|yarn\s+audit|\bsnyk\b|\bosv-scanner\b/,
    explanation: 'Checks installed packages for known security problems.'
  },
  {
    test: /stylelint/,
    explanation: 'Checks the stylesheets (CSS) for mistakes and style problems.'
  },
  {
    test: /markdownlint|\bremark\b|\bvale\b/,
    explanation: 'Checks the documentation files for style and formatting problems.'
  },
  {
    test: /cspell|codespell|typos/,
    explanation: 'Spell-checks the code and documentation.'
  },
  {
    test: /\btsc\s+--watch|\btsc\s+-w\b/,
    explanation: 'Keeps the TypeScript checker running, re-checking every time you save.'
  },
  {
    test: /\bpm2\b/,
    explanation: 'Runs the app under a process manager that keeps it alive in the background.'
  },
  {
    test: /json-server|\bmsw\b|mockoon/,
    explanation: 'Starts a fake API server so you can develop the frontend without a real backend.'
  },
  {
    test: /lighthouse|web-vitals|pagespeed/,
    explanation: 'Measures how fast and accessible the site is.'
  },
  {
    test: /\bmaildev\b|mailhog|\bethereal\b/,
    explanation: 'Starts a local inbox that catches the emails the app sends during development.'
  },
  {
    test: /\bngrok\b|cloudflared|localtunnel/,
    explanation: 'Opens a temporary public URL that forwards to your local app.'
  },
  {
    test: /sanity\s+(dev|start)|contentful|payload\s+dev/,
    explanation: 'Starts the content-management (CMS) part of the project.'
  },
  {
    test: /supabase\s+(start|db)/,
    explanation: 'Runs the local Supabase stack (database and auth) for development.'
  },
  {
    test: /\bdeno\s+(run|task)|\bbun\s+run/,
    explanation: 'Runs the app with an alternative JavaScript runtime.'
  },
  {
    test: /cargo\s+run/,
    explanation: 'Runs the Rust program.'
  },
  {
    test: /cargo\s+(build|check)/,
    explanation: 'Builds or checks the Rust program.'
  },
  {
    test: /\bmvn\b|gradle/,
    explanation: 'Builds or runs the Java project with its build tool.'
  },
  {
    test: /dotnet\s+(run|watch)/,
    explanation: 'Runs the .NET app.'
  },
  {
    test: /\bpip\s+install|poetry\s+install|\buv\s+(sync|pip)/,
    explanation: 'Installs the Python packages the project needs.'
  },
  {
    test: /celery/,
    explanation: 'Starts the background job worker that processes queued tasks.'
  }
];

/**
 * Return a one-sentence, plain-English description of what running `name`
 * (whose underlying command is `command`) will do. Always returns a string.
 */
export function explainScript(name: string, command = ''): string {
  const baseName = name.toLowerCase().split(/[:/]/)[0];
  const intent = NAME_INTENTS.find((entry) => entry.keys.includes(baseName));
  if (intent !== undefined) {
    return intent.explanation;
  }

  const lowerCommand = command.toLowerCase();
  const tool = TOOL_INTENTS.find((entry) => entry.test.test(lowerCommand));
  if (tool !== undefined) {
    return tool.explanation;
  }

  return `Runs the project’s “${name}” command.`;
}
