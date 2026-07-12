/**
 * Plain-English translations of common error output.
 *
 * When a script fails, its raw output is intimidating for newcomers. These
 * heuristics match well-known error signatures and translate them into a
 * short explanation plus one concrete next step. Pure pattern matching — no
 * network calls, no AI, and the original output is never altered.
 */

export interface FriendlyError {
  id: string;
  /** Short plain-English headline of what went wrong. */
  title: string;
  /** One or two sentences a non-programmer can follow. */
  explanation: string;
  /** The single most useful next step. */
  suggestion: string;
}

interface ErrorSignature extends FriendlyError {
  test: RegExp;
}

/** Ordered most-specific first; the first match wins. */
const ERROR_SIGNATURES: ErrorSignature[] = [
  {
    id: 'port-in-use',
    test: /EADDRINUSE|address already in use|port .{0,20}(is )?(already )?in use/i,
    title: 'The port is already taken',
    explanation:
      'Another program is already using the network port this app wants, like two people trying to use the same parking spot.',
    suggestion:
      'Stop the other program (the Ports page shows what it is), or start this app on a different port.'
  },
  {
    id: 'module-not-found',
    test: /Cannot find module|ERR_MODULE_NOT_FOUND|MODULE_NOT_FOUND|Cannot find package/i,
    title: 'A needed package is missing',
    explanation:
      'The app tried to use a package that is not installed on this machine — usually because dependencies were never installed or a new one was added recently.',
    suggestion: 'Run the install command (for example "npm install") and try again.'
  },
  {
    id: 'command-not-found',
    test: /command not found|is not recognized as an internal or external command|'[^']+' is not recognized|ENOENT.*spawn/i,
    title: 'A required tool is not installed',
    explanation:
      'The script called a program that this computer does not have (or cannot find). It may need installing, or dependencies may be missing.',
    suggestion:
      'Install the project dependencies first; if the message names a tool like git or docker, install that tool.'
  },
  {
    id: 'network-unreachable',
    test: /ENOTFOUND|EAI_AGAIN|ETIMEDOUT|ECONNRESET|getaddrinfo|network request failed/i,
    title: 'The internet connection failed',
    explanation:
      'Something tried to reach a server on the internet and could not — the network may be down, slow, or blocked by a proxy or VPN.',
    suggestion: 'Check your internet connection (and any VPN or proxy), then run the command again.'
  },
  {
    id: 'connection-refused',
    test: /ECONNREFUSED/i,
    title: 'A service the app needs is not running',
    explanation:
      'The app knocked on the door of another service (often a database) and nobody answered. That service probably is not started yet.',
    suggestion:
      'Start the supporting services first — if the project has Docker services, start those, then retry.'
  },
  {
    id: 'permission-denied',
    test: /EACCES|permission denied|Access is denied/i,
    title: 'Permission was denied',
    explanation:
      'The program was not allowed to read or write a file or folder. A previous command may have created files as a different user, or the folder is protected.',
    suggestion:
      'Close programs that may hold the file open, and avoid running installs as administrator/sudo — mixed ownership causes this.'
  },
  {
    id: 'file-locked-eperm',
    test: /EPERM|operation not permitted/i,
    title: 'A file is locked or protected',
    explanation:
      'Windows often blocks changes to files that another program (editor, antivirus, a running dev server) currently holds open.',
    suggestion:
      'Stop running dev servers and retry; if it persists, close your editor and try once more.'
  },
  {
    id: 'out-of-memory',
    test: /JavaScript heap out of memory|ENOMEM|Allocation failed - process out of memory/i,
    title: 'The program ran out of memory',
    explanation: 'The task needed more memory (RAM) than it was allowed to use.',
    suggestion:
      'Close other heavy programs and retry. If it keeps happening, ask a teammate whether the project needs a larger memory limit.'
  },
  {
    id: 'disk-full',
    test: /ENOSPC|no space left on device/i,
    title: 'The disk is full (or a watcher limit was hit)',
    explanation:
      'Either the hard drive has no free space, or (on Linux) the system hit its limit for watching files.',
    suggestion: 'Free up disk space, or search "increase inotify watches" if the disk is not full.'
  },
  {
    id: 'too-many-files',
    test: /EMFILE|too many open files/i,
    title: 'Too many files are open at once',
    explanation: 'The system hit its limit for how many files one program may hold open.',
    suggestion: 'Close other programs and retry; restarting the computer also clears it.'
  },
  {
    id: 'env-missing',
    test: /missing (required )?environment variable|env(ironment)? variable .{0,40}(is )?(not set|missing|undefined|required)/i,
    title: 'A required setting is missing',
    explanation:
      'The app needs an environment variable (a named setting, usually from the .env file) that is not filled in yet.',
    suggestion:
      'Open the Environment page, find the missing key, and give it a value — the error message usually names the key.'
  },
  {
    id: 'docker-not-running',
    test: /Cannot connect to the Docker daemon|docker daemon is not running|error during connect.*docker/i,
    title: 'Docker is not running',
    explanation:
      'The command needs Docker, but the Docker app is not started (or not installed) on this computer.',
    suggestion: 'Start Docker Desktop, wait for it to say "running", then try again.'
  },
  {
    id: 'not-a-git-repo',
    test: /not a git repository/i,
    title: 'This folder is not a git repository',
    explanation: 'A git command ran in a folder that git does not track.',
    suggestion: 'Make sure you are in the project folder, or run "git init" to start tracking it.'
  },
  {
    id: 'merge-conflict',
    test: /CONFLICT \(|Automatic merge failed|fix conflicts and then commit/i,
    title: 'Git found conflicting changes',
    explanation:
      'Two sets of changes touched the same lines, and git needs a human to choose which version to keep.',
    suggestion:
      'Open the conflicted files in your editor (it highlights the choices) — or ask a teammate to help resolve them.'
  },
  {
    id: 'node-version',
    test: /Unsupported engine|requires? Node(\.js)? (version )?[v>=^~\d]|The engine "node" is incompatible/i,
    title: 'Your Node.js version does not match',
    explanation:
      'This project expects a different version of Node.js than the one installed here, so tools refuse to run.',
    suggestion:
      'Install the Node version the message asks for (a version manager like nvm or fnm makes switching easy).'
  },
  {
    id: 'npm-404',
    test: /npm ERR! 404|E404/i,
    title: 'A package could not be found online',
    explanation:
      'The package registry says a requested package (or version) does not exist — often a typo, a private package, or a wrong registry.',
    suggestion:
      'Check the package name for typos; if the project uses private packages, you may need to log in first.'
  },
  {
    id: 'npm-eresolve',
    test: /ERESOLVE|unable to resolve dependency tree|peer dep/i,
    title: 'Packages disagree about versions',
    explanation:
      'Two packages this project uses each demand a different version of the same third package, and npm cannot satisfy both.',
    suggestion:
      'Try the install again with "npm install --legacy-peer-deps", and mention it to a teammate — the project may need a version fix.'
  },
  {
    id: 'auth-required',
    test: /401 Unauthorized|E401|authentication required|need auth|ENEEDAUTH/i,
    title: 'You need to log in first',
    explanation: 'A registry or service refused the request because it does not know who you are.',
    suggestion: 'Log in first (for npm registries: "npm login"), then retry the command.'
  },
  {
    id: 'ssl-cert',
    test: /self.signed certificate|UNABLE_TO_VERIFY_LEAF_SIGNATURE|CERT_HAS_EXPIRED/i,
    title: 'A secure connection could not be verified',
    explanation:
      'The security certificate of a server could not be trusted — common on corporate networks that inspect traffic.',
    suggestion:
      'If you are on a company network or VPN, ask IT for the proxy certificate setup; do not disable certificate checks.'
  },
  {
    id: 'typescript-errors',
    test: /error TS\d{3,5}:/,
    title: 'TypeScript found code problems',
    explanation:
      'The type checker found places where the code makes promises it does not keep. The app is protected from running with these mistakes.',
    suggestion:
      'Each "error TS…" line names a file and line number — that is exactly where to look (or who to ask).'
  },
  {
    id: 'syntax-error',
    test: /SyntaxError: |Unexpected token|Parse error|Parsing error/i,
    title: 'There is a typo-level mistake in the code',
    explanation:
      'A file contains something the language itself cannot read — like a sentence missing its closing bracket.',
    suggestion:
      'The message names the file and position of the problem; the fix is usually one character.'
  },
  {
    id: 'test-failures',
    test: /Tests?:\s+\d+ failed|\d+ failing|FAIL\s+\S+\.(test|spec)\./i,
    title: 'Some automated tests failed',
    explanation:
      'The test run finished, but some checks did not pass — the code behaves differently than the tests expect.',
    suggestion:
      'Scroll to the first "FAIL" in the output; the lines under it describe exactly which expectation broke.'
  },
  {
    id: 'lint-problems',
    test: /\d+ problems? \(\d+ errors?|✖ \d+ problems?/i,
    title: 'The code-style checker found issues',
    explanation:
      'The linter flagged style problems or risky patterns. The app itself may be fine — these are cleanliness rules.',
    suggestion:
      'Many projects can fix these automatically — try the "lint" script with "--fix", or the "fix" script.'
  },
  {
    id: 'prisma-migrate',
    test: /P1001|P1017|Can't reach database server/i,
    title: 'The database cannot be reached',
    explanation:
      'A database tool tried to connect and found nothing listening — the database is probably not running, or the connection setting points to the wrong place.',
    suggestion:
      'Start the database (often via Docker services), and check the database URL in your .env file.'
  },
  {
    id: 'python-missing',
    test: /python(3)? was not found|No module named/i,
    title: 'Python (or a Python package) is missing',
    explanation:
      'The command needs Python or one of its packages, and this machine does not have it set up.',
    suggestion:
      'Install Python from python.org, then install the project’s Python packages (often "pip install -r requirements.txt").'
  }
];

/**
 * Translate raw process output into a friendly explanation, or null when the
 * output matches nothing we recognize (never guess).
 */
export function explainErrorOutput(output: string): FriendlyError | null {
  if (output.trim().length === 0) {
    return null;
  }
  for (const signature of ERROR_SIGNATURES) {
    if (signature.test.test(output)) {
      const { id, title, explanation, suggestion } = signature;
      return { id, title, explanation, suggestion };
    }
  }
  return null;
}

/** The number of distinct error signatures this module recognizes. */
export const FRIENDLY_ERROR_COUNT = ERROR_SIGNATURES.length;
