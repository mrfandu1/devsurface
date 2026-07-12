/**
 * A plain-English dictionary of developer jargon.
 *
 * Aimed at non-technical users who open a project and meet words like
 * "lockfile" or "environment variable" with no explanation. Definitions avoid
 * circular jargon: each one should make sense to someone who has never
 * programmed. Pure data — no network calls, no AI, no telemetry.
 */

export type GlossaryCategory =
  | 'basics'
  | 'running'
  | 'packages'
  | 'git'
  | 'web'
  | 'quality'
  | 'data'
  | 'docker'
  | 'security';

export const GLOSSARY_CATEGORY_LABELS: Record<GlossaryCategory, string> = {
  basics: 'The basics',
  running: 'Running the app',
  packages: 'Packages & installs',
  git: 'Git & versions',
  web: 'Web & servers',
  quality: 'Code quality',
  data: 'Databases & data',
  docker: 'Docker & containers',
  security: 'Secrets & safety'
};

export interface GlossaryEntry {
  /** The canonical term, capitalized for display. */
  term: string;
  /** Alternate spellings and close synonyms matched during lookup. */
  aliases?: string[];
  category: GlossaryCategory;
  /** One or two friendly sentences a non-programmer can follow. */
  definition: string;
}

export const GLOSSARY: GlossaryEntry[] = [
  // ── The basics ────────────────────────────────────────────────────────────
  {
    term: 'Repository',
    aliases: ['repo'],
    category: 'basics',
    definition:
      'The project folder plus its full change history. When people say "the repo" they just mean this project.'
  },
  {
    term: 'CLI',
    aliases: ['command line', 'terminal', 'shell', 'console'],
    category: 'basics',
    definition:
      'A window where you type commands instead of clicking buttons. "Terminal", "shell", and "command line" all mean roughly the same thing.'
  },
  {
    term: 'Script',
    aliases: ['npm script', 'package script'],
    category: 'basics',
    definition:
      'A saved shortcut for a longer command. Instead of typing the whole command, you run the script by its short name, like "dev" or "test".'
  },
  {
    term: 'package.json',
    category: 'basics',
    definition:
      'The project’s ID card. It lists the project’s name, its scripts (shortcuts), and the packages it depends on.'
  },
  {
    term: 'README',
    category: 'basics',
    definition:
      'The project’s welcome page — a text file explaining what the project is and how to use it. Always worth reading first.'
  },
  {
    term: 'Directory',
    aliases: ['folder', 'dir'],
    category: 'basics',
    definition: 'A folder on your computer. "Directory" is just the traditional word for it.'
  },
  {
    term: 'Path',
    aliases: ['file path'],
    category: 'basics',
    definition:
      'The address of a file or folder on your computer, like C:\\Projects\\my-app or /home/you/my-app.'
  },
  {
    term: 'Root',
    aliases: ['project root', 'repo root'],
    category: 'basics',
    definition:
      'The top-level folder of the project — the one that contains everything else, usually where package.json lives.'
  },
  {
    term: 'Source code',
    aliases: ['source', 'src'],
    category: 'basics',
    definition:
      'The human-written files that make up the program. The "src" folder is where most of it usually lives.'
  },
  {
    term: 'Framework',
    category: 'basics',
    definition:
      'A big reusable foundation the app is built on (like Next.js or Express), so developers don’t start from zero.'
  },
  {
    term: 'Library',
    aliases: ['package', 'module'],
    category: 'basics',
    definition:
      'Ready-made code written by someone else that this project reuses, like borrowing a toolbox instead of forging your own tools.'
  },
  {
    term: 'API',
    category: 'basics',
    definition:
      'A menu of things one program lets another program ask it to do — like a waiter carrying requests between your app and a kitchen.'
  },
  {
    term: 'Bug',
    category: 'basics',
    definition: 'A mistake in the code that makes the app behave incorrectly.'
  },
  {
    term: 'Log',
    aliases: ['logs', 'console output'],
    category: 'basics',
    definition:
      'The running commentary a program prints while it works. When something breaks, the logs usually say why.'
  },
  {
    term: 'IDE',
    aliases: ['editor', 'code editor', 'vs code', 'vscode'],
    category: 'basics',
    definition:
      'The app developers write code in — like Word, but for code. VS Code is the most common one.'
  },
  {
    term: 'Monorepo',
    category: 'basics',
    definition:
      'One repository that holds several related projects (packages) side by side instead of giving each its own repo.'
  },
  {
    term: 'Open source',
    category: 'basics',
    definition:
      'Software whose code is public, so anyone can read it, learn from it, and (license permitting) reuse it.'
  },
  {
    term: 'License',
    category: 'basics',
    definition:
      'The legal note saying what others may do with the code — use it, change it, sell it, and so on. MIT is a very permissive common one.'
  },
  {
    term: 'Markdown',
    aliases: ['md'],
    category: 'basics',
    definition:
      'A simple way to format text with plain characters — # for headings, * for bullets. README files are usually written in it.'
  },
  {
    term: 'JSON',
    category: 'basics',
    definition:
      'A common text format for structured data, full of curly braces and quotes. Both easy for programs to read and (mostly) for humans.'
  },
  {
    term: 'YAML',
    aliases: ['yml'],
    category: 'basics',
    definition:
      'A text format for configuration files that uses indentation instead of braces. Docker Compose and CI files often use it.'
  },
  {
    term: 'TypeScript',
    aliases: ['ts'],
    category: 'basics',
    definition:
      'JavaScript with extra labels ("types") that let tools catch mistakes before the app even runs.'
  },
  {
    term: 'JavaScript',
    aliases: ['js'],
    category: 'basics',
    definition:
      'The programming language of the web. It runs in every browser, and via Node.js it also runs on servers and laptops.'
  },
  {
    term: 'Node.js',
    aliases: ['node', 'nodejs'],
    category: 'basics',
    definition:
      'The engine that runs JavaScript outside a web browser — on your computer or a server. Many projects need it installed first.'
  },

  // ── Running the app ───────────────────────────────────────────────────────
  {
    term: 'Dev server',
    aliases: ['development server', 'dev mode'],
    category: 'running',
    definition:
      'A private, local copy of the app that restarts and refreshes as the code changes. It is how developers preview work in progress.'
  },
  {
    term: 'Build',
    aliases: ['compile', 'bundle'],
    category: 'running',
    definition:
      'Turning human-written source code into the optimized files that actually ship. Like baking the ingredients into a finished cake.'
  },
  {
    term: 'Production',
    aliases: ['prod'],
    category: 'running',
    definition:
      'The real, live version of the app that actual users touch — as opposed to the development copy on your machine.'
  },
  {
    term: 'localhost',
    aliases: ['127.0.0.1'],
    category: 'running',
    definition:
      'Your own computer, viewed as a web address. http://localhost:3000 means "the app running on this machine at door number 3000".'
  },
  {
    term: 'Port',
    category: 'running',
    definition:
      'A numbered door on your computer that a program listens behind. Only one program can use a door at a time — hence "port already in use" errors.'
  },
  {
    term: 'Process',
    category: 'running',
    definition:
      'A program that is currently running. Stopping a process is just quitting that program.'
  },
  {
    term: 'Environment variable',
    aliases: ['env var', 'env variable'],
    category: 'running',
    definition:
      'A named setting the app reads when it starts, like DATABASE_URL. They live outside the code so each machine can use its own values.'
  },
  {
    term: '.env file',
    aliases: ['env file', 'dotenv', '.env'],
    category: 'running',
    definition:
      'A text file of KEY=value settings the app loads at startup. It often holds passwords, so it stays on your machine and out of git.'
  },
  {
    term: '.env.example',
    aliases: ['env example'],
    category: 'running',
    definition:
      'A safe template listing which settings the app needs, without the real values. You copy it to .env and fill in your own.'
  },
  {
    term: 'Hot reload',
    aliases: ['hmr', 'live reload', 'watch mode'],
    category: 'running',
    definition:
      'When the running app updates itself the moment you save a file, so you see changes without restarting anything.'
  },
  {
    term: 'Exit code',
    category: 'running',
    definition:
      'The number a program reports when it finishes. 0 means "all good"; anything else signals a problem.'
  },
  {
    term: 'Ctrl+C',
    aliases: ['sigint', 'kill'],
    category: 'running',
    definition: 'The keyboard shortcut that politely stops a program running in the terminal.'
  },
  {
    term: 'Daemon',
    aliases: ['background service', 'service'],
    category: 'running',
    definition:
      'A program that runs quietly in the background rather than in a window — Docker, for instance, runs as a daemon.'
  },

  // ── Packages & installs ───────────────────────────────────────────────────
  {
    term: 'Dependency',
    aliases: ['dependencies', 'deps'],
    category: 'packages',
    definition:
      'A package this project needs in order to work. "Installing dependencies" downloads all of them in one go.'
  },
  {
    term: 'node_modules',
    category: 'packages',
    definition:
      'The folder where downloaded packages live. It is huge, machine-generated, and safe to delete — an install brings it back.'
  },
  {
    term: 'npm',
    category: 'packages',
    definition:
      'The standard tool (and giant online library) for installing JavaScript packages. "npm install" fetches everything a project needs.'
  },
  {
    term: 'Package manager',
    aliases: ['pnpm', 'yarn', 'bun'],
    category: 'packages',
    definition:
      'The tool that downloads and organizes a project’s packages. npm, pnpm, yarn, and bun are different brands of the same idea — use the one the project expects.'
  },
  {
    term: 'Lockfile',
    aliases: ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'],
    category: 'packages',
    definition:
      'A receipt recording the exact version of every installed package, so everyone’s install comes out identical.'
  },
  {
    term: 'Semver',
    aliases: ['semantic versioning', 'version number'],
    category: 'packages',
    definition:
      'The 1.2.3 version scheme: the first number means big changes, the second new features, the third small fixes.'
  },
  {
    term: 'devDependency',
    aliases: ['dev dependencies'],
    category: 'packages',
    definition:
      'A package needed only while building or testing the project, not when the finished app runs.'
  },
  {
    term: 'Registry',
    aliases: ['npm registry'],
    category: 'packages',
    definition:
      'The online warehouse packages are downloaded from. For JavaScript, that is npmjs.com.'
  },
  {
    term: 'Global install',
    category: 'packages',
    definition:
      'Installing a tool for your whole computer (usable in any folder) instead of just inside one project.'
  },

  // ── Git & versions ────────────────────────────────────────────────────────
  {
    term: 'Git',
    category: 'git',
    definition:
      'The tool that tracks every change to the code, like an unlimited undo history shared by the whole team.'
  },
  {
    term: 'Commit',
    category: 'git',
    definition:
      'A saved snapshot of the project with a short note about what changed. The history is a chain of commits.'
  },
  {
    term: 'Branch',
    category: 'git',
    definition:
      'A separate line of work, like a parallel draft of the project. The main branch is the official copy; work happens on side branches.'
  },
  {
    term: 'Merge',
    category: 'git',
    definition: 'Combining the changes from one branch into another.'
  },
  {
    term: 'Merge conflict',
    aliases: ['conflict'],
    category: 'git',
    definition:
      'When two people changed the same lines differently and git needs a human to choose which version wins.'
  },
  {
    term: 'Push',
    category: 'git',
    definition: 'Uploading your commits to the shared online copy (like GitHub).'
  },
  {
    term: 'Pull',
    aliases: ['fetch'],
    category: 'git',
    definition: 'Downloading the latest commits others have pushed, so your copy is up to date.'
  },
  {
    term: 'Clone',
    category: 'git',
    definition: 'Downloading a full copy of a repository to your computer for the first time.'
  },
  {
    term: 'Pull request',
    aliases: ['pr', 'merge request'],
    category: 'git',
    definition:
      'A proposal to merge your branch, where teammates review the changes before they join the official copy.'
  },
  {
    term: 'GitHub',
    aliases: ['gitlab', 'bitbucket'],
    category: 'git',
    definition:
      'A website that hosts git repositories online so teams can share code, review changes, and track issues.'
  },
  {
    term: 'Upstream',
    aliases: ['remote', 'origin'],
    category: 'git',
    definition:
      'The shared online copy of the repository your local copy syncs with. "origin" is its default nickname.'
  },
  {
    term: 'Tag',
    aliases: ['release tag'],
    category: 'git',
    definition: 'A named bookmark on one commit, usually marking a release like v1.0.0.'
  },
  {
    term: '.gitignore',
    aliases: ['gitignore'],
    category: 'git',
    definition:
      'A list of files git should pretend not to see — build output, node_modules, and secret files like .env.'
  },
  {
    term: 'Dirty',
    aliases: ['uncommitted changes', 'working tree'],
    category: 'git',
    definition:
      'Having edits that are not saved into a commit yet. A "clean" project has no un-committed changes.'
  },

  // ── Web & servers ─────────────────────────────────────────────────────────
  {
    term: 'Frontend',
    aliases: ['front end', 'client'],
    category: 'web',
    definition:
      'The part of an app you see and click — everything that runs in the browser or on the screen.'
  },
  {
    term: 'Backend',
    aliases: ['back end', 'server side'],
    category: 'web',
    definition:
      'The behind-the-scenes part that stores data and applies the rules, usually running on a server.'
  },
  {
    term: 'Full stack',
    category: 'web',
    definition: 'Frontend and backend together — or a developer who works on both.'
  },
  {
    term: 'HTTP',
    aliases: ['https'],
    category: 'web',
    definition:
      'The language browsers and servers use to talk to each other. HTTPS is the same conversation, but encrypted.'
  },
  {
    term: 'URL',
    category: 'web',
    definition: 'A web address, like https://example.com/page.'
  },
  {
    term: 'Endpoint',
    aliases: ['route'],
    category: 'web',
    definition:
      'One specific address on a server that answers one kind of request, like /api/users returning the user list.'
  },
  {
    term: 'Request',
    aliases: ['response'],
    category: 'web',
    definition:
      'One message to a server ("please give me this page") and the answer that comes back is the response.'
  },
  {
    term: 'WebSocket',
    category: 'web',
    definition:
      'A phone line between browser and server that stays open, so updates arrive instantly instead of the page asking again and again.'
  },
  {
    term: 'CORS',
    category: 'web',
    definition:
      'A browser safety rule about which websites may talk to which servers. A "CORS error" means that permission is missing.'
  },
  {
    term: '404',
    aliases: ['not found'],
    category: 'web',
    definition: 'The server’s way of saying "there is nothing at that address".'
  },
  {
    term: '500',
    aliases: ['internal server error'],
    category: 'web',
    definition: 'The server’s way of saying "something broke on my side" — check the server logs.'
  },
  {
    term: 'Cache',
    category: 'web',
    definition:
      'A stash of saved results reused to avoid redoing slow work. When behavior seems stale, "clearing the cache" throws the stash away.'
  },
  {
    term: 'DNS',
    category: 'web',
    definition:
      'The internet’s phone book: it turns names like example.com into the numeric addresses computers actually dial.'
  },
  {
    term: 'Deploy',
    aliases: ['deployment', 'ship'],
    category: 'web',
    definition:
      'Publishing the app so real users can reach it — moving it from your machine to the live servers.'
  },

  // ── Code quality ──────────────────────────────────────────────────────────
  {
    term: 'Linter',
    aliases: ['lint', 'eslint'],
    category: 'quality',
    definition:
      'A tool that reads the code and flags sloppy or risky patterns — a spell-checker for code.'
  },
  {
    term: 'Formatter',
    aliases: ['prettier', 'format'],
    category: 'quality',
    definition:
      'A tool that tidies code layout (spaces, line breaks) automatically so everything looks consistent.'
  },
  {
    term: 'Unit test',
    aliases: ['test', 'tests', 'testing'],
    category: 'quality',
    definition:
      'A small automatic check that one piece of code still gives the right answer. Hundreds of them run in seconds.'
  },
  {
    term: 'E2E test',
    aliases: ['end-to-end test', 'integration test'],
    category: 'quality',
    definition:
      'An automatic test that drives the whole app like a real user — clicking buttons, filling forms — to prove the pieces work together.'
  },
  {
    term: 'Type checking',
    aliases: ['typecheck', 'type error'],
    category: 'quality',
    definition:
      'Letting TypeScript verify that data is used consistently — catching "you promised a number but passed text" before the app runs.'
  },
  {
    term: 'CI',
    aliases: ['continuous integration', 'pipeline', 'github actions'],
    category: 'quality',
    definition:
      'A robot that automatically builds and tests the project every time someone shares changes, catching breakage early.'
  },
  {
    term: 'Code coverage',
    aliases: ['coverage'],
    category: 'quality',
    definition: 'The percentage of the code that the automated tests actually exercise.'
  },
  {
    term: 'Refactor',
    category: 'quality',
    definition:
      'Reorganizing code to be cleaner without changing what it does — tidying the kitchen, not changing the menu.'
  },
  {
    term: 'Code review',
    aliases: ['review'],
    category: 'quality',
    definition: 'A teammate reading proposed changes to catch problems before they are merged.'
  },
  {
    term: 'Git hook',
    aliases: ['husky', 'pre-commit'],
    category: 'quality',
    definition:
      'A small check that runs automatically at git moments — for example, running the linter right before each commit.'
  },

  // ── Databases & data ──────────────────────────────────────────────────────
  {
    term: 'Database',
    aliases: ['db'],
    category: 'data',
    definition:
      'Where the app permanently stores its information — like a giant, very organized filing cabinet.'
  },
  {
    term: 'Migration',
    aliases: ['migrations', 'migrate'],
    category: 'data',
    definition:
      'A scripted change to the database’s structure (new tables, new columns) applied step by step, in order.'
  },
  {
    term: 'Seed',
    aliases: ['seeding', 'seed data'],
    category: 'data',
    definition:
      'Filling a fresh database with starter sample data so the app has something to show.'
  },
  {
    term: 'ORM',
    aliases: ['prisma', 'drizzle'],
    category: 'data',
    definition:
      'A translator that lets the code talk to the database in its own language instead of raw SQL. Prisma and Drizzle are popular ones.'
  },
  {
    term: 'SQL',
    aliases: ['postgres', 'postgresql', 'mysql', 'sqlite'],
    category: 'data',
    definition:
      'The classic language for asking databases questions. Postgres, MySQL, and SQLite are databases that speak it.'
  },
  {
    term: 'Schema',
    category: 'data',
    definition:
      'The blueprint of the database: which tables exist and what kind of information each column holds.'
  },
  {
    term: 'Redis',
    category: 'data',
    definition:
      'A very fast in-memory data store, usually used as a cache or message board between services.'
  },

  // ── Docker & containers ───────────────────────────────────────────────────
  {
    term: 'Docker',
    category: 'docker',
    definition:
      'A tool that runs software in sealed, pre-packaged boxes (containers) so it behaves the same on every computer.'
  },
  {
    term: 'Container',
    category: 'docker',
    definition:
      'One sealed box running a program with everything it needs inside. Starting a database in a container skips installing it "for real".'
  },
  {
    term: 'Image',
    aliases: ['docker image', 'base image'],
    category: 'docker',
    definition:
      'The frozen template a container is started from — like a recipe the running container is cooked from.'
  },
  {
    term: 'Docker Compose',
    aliases: ['compose', 'docker-compose'],
    category: 'docker',
    definition:
      'A file (and command) that starts several containers together with one command — the whole supporting cast at once.'
  },
  {
    term: 'Dockerfile',
    category: 'docker',
    definition: 'The recipe describing how to build this project’s own Docker image.'
  },
  {
    term: 'Volume',
    category: 'docker',
    definition:
      'A container’s external hard drive: data saved there survives when the container is deleted.'
  },
  {
    term: 'Dev container',
    aliases: ['devcontainer', 'codespaces'],
    category: 'docker',
    definition:
      'A ready-made development environment in a container, so a new machine can start coding without installing anything by hand.'
  },

  // ── Secrets & safety ──────────────────────────────────────────────────────
  {
    term: 'Secret',
    aliases: ['credential', 'api key', 'token'],
    category: 'security',
    definition:
      'A password-like value (API key, token) that must never be shared or committed to git. Treat every one like a house key.'
  },
  {
    term: 'API key',
    category: 'security',
    definition:
      'A long code that proves to a service who you are, like a personal entry badge. Anyone holding it can act as you — keep it private.'
  },
  {
    term: 'Rotate',
    aliases: ['rotate secrets', 'rotation'],
    category: 'security',
    definition:
      'Replacing a secret with a fresh one, done routinely or the moment a key might have leaked.'
  },
  {
    term: 'Hash',
    aliases: ['hashing'],
    category: 'security',
    definition:
      'A one-way scramble of data. Passwords are stored hashed so that even the database cannot reveal the original.'
  },
  {
    term: 'Encryption',
    aliases: ['encrypt', 'tls', 'ssl'],
    category: 'security',
    definition:
      'Locking data so only the intended reader can unlock it. The padlock icon in the browser means the connection is encrypted.'
  },
  {
    term: 'Vulnerability',
    aliases: ['cve', 'security advisory'],
    category: 'security',
    definition:
      'A known weakness in software that attackers could exploit. Updating dependencies is how most get fixed.'
  },
  {
    term: 'Sudo',
    aliases: ['administrator', 'admin rights', 'elevated'],
    category: 'security',
    definition:
      'Running a command with full administrator power. Only do it when you understand why the command needs it.'
  },
  {
    term: 'Localhost-only',
    aliases: ['loopback'],
    category: 'security',
    definition:
      'Reachable only from your own computer, not from the network. DevSurface’s dashboard works this way on purpose.'
  }
];

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[’']/g, '');
}

/** Find the single best entry for a term, matching names first, then aliases. */
export function lookupTerm(query: string): GlossaryEntry | null {
  const wanted = normalize(query);
  if (wanted.length === 0) {
    return null;
  }
  const byTerm = GLOSSARY.find((entry) => normalize(entry.term) === wanted);
  if (byTerm !== undefined) {
    return byTerm;
  }
  const byAlias = GLOSSARY.find((entry) =>
    (entry.aliases ?? []).some((alias) => normalize(alias) === wanted)
  );
  return byAlias ?? null;
}

/** All entries whose term, alias, or definition mentions the query. */
export function searchGlossary(query: string): GlossaryEntry[] {
  const wanted = normalize(query);
  if (wanted.length === 0) {
    return GLOSSARY;
  }
  return GLOSSARY.filter(
    (entry) =>
      normalize(entry.term).includes(wanted) ||
      (entry.aliases ?? []).some((alias) => normalize(alias).includes(wanted)) ||
      normalize(entry.definition).includes(wanted)
  );
}
