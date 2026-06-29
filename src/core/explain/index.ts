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
  { keys: ['docs'], explanation: 'Builds or serves the project documentation.' }
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
    test: /next\s+dev|vite|remix\s+dev|astro\s+dev/,
    explanation: 'Starts the development server so you can preview the app in your browser.'
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
