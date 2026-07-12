/**
 * Contextual, plain-English tips generated from the project scan.
 *
 * Unlike doctor warnings (which report problems), tips teach: they point out
 * things a newcomer would not know to look for, in friendly language. Rules
 * are deterministic functions of the scan — no network calls, no AI.
 */

import type { ScanResult } from '../types.js';

export type TipKind = 'do-this' | 'good-to-know' | 'shortcut';

export interface Tip {
  id: string;
  kind: TipKind;
  /** The tip itself, one or two friendly sentences. */
  text: string;
  /** Optional exact command the tip refers to. */
  command?: string;
}

interface TipRule {
  id: string;
  kind: TipKind;
  build: (scan: ScanResult) => { text: string; command?: string } | null;
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

function runCommand(scan: ScanResult, script: string): string {
  switch (scan.packageManager) {
    case 'pnpm':
      return `pnpm ${script}`;
    case 'yarn':
      return `yarn ${script}`;
    case 'bun':
      return `bun run ${script}`;
    default:
      return `npm run ${script}`;
  }
}

const TIP_RULES: TipRule[] = [
  {
    id: 'dev-script',
    kind: 'do-this',
    build: (scan) => {
      const dev = ['dev', 'start', 'serve'].find((name) => scan.scripts[name] !== undefined);
      if (dev === undefined) return null;
      return {
        text: `To see the app running, the "${dev}" script is the usual starting point. Leave it running while you explore — press Ctrl+C in its window to stop it.`,
        command: runCommand(scan, dev)
      };
    }
  },
  {
    id: 'env-copy-first',
    kind: 'do-this',
    build: (scan) => {
      if (scan.env?.hasExample !== true || scan.env.hasLocal) return null;
      return {
        text: 'This project keeps its settings in a .env file, and yours does not exist yet. Copy the example file first — the app usually refuses to start without it.'
      };
    }
  },
  {
    id: 'env-values-hidden',
    kind: 'good-to-know',
    build: (scan) => {
      if (scan.env?.hasLocal !== true) return null;
      return {
        text: 'DevSurface never shows the values inside your .env file, only which keys exist. Sharing your screen is safe.'
      };
    }
  },
  {
    id: 'docker-before-dev',
    kind: 'do-this',
    build: (scan) => {
      if ((scan.docker?.services.length ?? 0) === 0) return null;
      return {
        text: 'This project uses Docker for its supporting services (like a database). Start those before the dev script, or the app may fail to connect.'
      };
    }
  },
  {
    id: 'docker-daemon-off',
    kind: 'do-this',
    build: (scan) => {
      if (scan.docker?.daemonStatus !== 'stopped') return null;
      return {
        text: 'Docker is installed but not running. Open Docker Desktop and wait for it to say "running" before starting services.'
      };
    }
  },
  {
    id: 'monorepo-navigation',
    kind: 'good-to-know',
    build: (scan) => {
      if ((scan.monorepo?.packageCount ?? 0) < 2) return null;
      return {
        text: `This is a monorepo: ${scan.monorepo?.packageCount} smaller packages live inside one repository. Commands run at the top level usually fan out to all of them.`
      };
    }
  },
  {
    id: 'test-script',
    kind: 'shortcut',
    build: (scan) => {
      if (scan.scripts.test === undefined) return null;
      return {
        text: 'After changing anything, running the tests tells you immediately whether you broke something. Green means safe.',
        command: runCommand(scan, 'test')
      };
    }
  },
  {
    id: 'format-script',
    kind: 'shortcut',
    build: (scan) => {
      const fmt = ['format', 'fmt'].find((name) => scan.scripts[name] !== undefined);
      if (fmt === undefined) return null;
      return {
        text: 'Never worry about code layout — this project has an auto-formatter that tidies files for you.',
        command: runCommand(scan, fmt)
      };
    }
  },
  {
    id: 'lint-fix',
    kind: 'shortcut',
    build: (scan) => {
      if (scan.scripts.lint === undefined) return null;
      return {
        text: 'The "lint" script is a spell-checker for code. Run it before sharing changes; many of its complaints can be fixed automatically.',
        command: runCommand(scan, 'lint')
      };
    }
  },
  {
    id: 'node-version-pin',
    kind: 'good-to-know',
    build: (scan) => {
      if (scan.nodeRequirement == null) return null;
      return {
        text: `This project asks for Node.js ${scan.nodeRequirement}. If tools misbehave, a wrong Node version is the first thing to check.`
      };
    }
  },
  {
    id: 'package-manager-loyalty',
    kind: 'good-to-know',
    build: (scan) => {
      if (scan.packageManager === null || scan.packageManager === 'npm') return null;
      return {
        text: `This project uses ${scan.packageManager}, not npm. Mixing package managers corrupts installs — always use ${installCommand(scan)}.`
      };
    }
  },
  {
    id: 'readme-first',
    kind: 'do-this',
    build: (scan) => {
      if (!scan.readme.exists) return null;
      return {
        text: 'The README is the project’s own welcome guide. Five minutes there answers most "how do I…" questions.'
      };
    }
  },
  {
    id: 'git-branch-safety',
    kind: 'good-to-know',
    build: (scan) => {
      const branch = scan.git?.branch;
      const defaultBranch = scan.git?.defaultBranch;
      if (branch == null || (defaultBranch != null && branch !== defaultBranch)) return null;
      return {
        text: `You are on the "${branch}" branch — the official copy. Experiments are safer on a side branch: "git checkout -b my-branch" makes one instantly.`
      };
    }
  },
  {
    id: 'git-dirty',
    kind: 'good-to-know',
    build: (scan) => {
      const dirty = scan.git?.dirtyFiles;
      if (typeof dirty !== 'number' || dirty === 0) return null;
      return {
        text: `${dirty} file${dirty === 1 ? ' has' : 's have'} unsaved (un-committed) changes right now. Committing is like hitting save — nothing is permanent until then.`
      };
    }
  },
  {
    id: 'git-behind',
    kind: 'do-this',
    build: (scan) => {
      const behind = scan.git?.behind;
      if (typeof behind !== 'number' || behind <= 0) return null;
      return {
        text: `Teammates published ${behind} newer change${behind === 1 ? '' : 's'} that you do not have yet. "git pull" catches you up before you start editing.`,
        command: 'git pull'
      };
    }
  },
  {
    id: 'ports-in-use',
    kind: 'do-this',
    build: (scan) => {
      const busy = scan.ports.filter((probe) => probe.inUse);
      if (busy.length === 0) return null;
      return {
        text: `Port ${busy[0].port} is already taken by another program, so the app may refuse to start. The Ports page shows what is using it and can free it.`
      };
    }
  },
  {
    id: 'storybook-preview',
    kind: 'shortcut',
    build: (scan) => {
      if (scan.scripts.storybook === undefined) return null;
      return {
        text: 'This project has Storybook: a gallery that shows UI pieces one at a time, without running the whole app. Great for a safe first look.',
        command: runCommand(scan, 'storybook')
      };
    }
  },
  {
    id: 'docs-configured',
    kind: 'shortcut',
    build: (scan) => {
      if (scan.config?.config.docs === undefined) return null;
      return {
        text: 'This project links its own documentation from the dashboard — look for the docs link on the Overview page.'
      };
    }
  },
  {
    id: 'vscode-extensions',
    kind: 'good-to-know',
    build: (scan) => {
      const count = scan.vscodeExtensions?.length ?? 0;
      if (count === 0) return null;
      return {
        text: `The project recommends ${count} VS Code extension${count === 1 ? '' : 's'}. VS Code offers to install them when you open the folder — say yes for the intended experience.`
      };
    }
  },
  {
    id: 'ci-safety-net',
    kind: 'good-to-know',
    build: (scan) => {
      if (scan.toolchain.ci === null) return null;
      return {
        text: `${scan.toolchain.ci} automatically re-checks every shared change. Even if you miss something locally, the robot catches it — that is your safety net.`
      };
    }
  },
  {
    id: 'typescript-here',
    kind: 'good-to-know',
    build: (scan) => {
      if (scan.toolchain.typescript == null) return null;
      return {
        text: 'This codebase is TypeScript: the red squiggles in your editor are the type checker protecting you, not judging you. Hover them for an explanation.'
      };
    }
  },
  {
    id: 'e2e-runner',
    kind: 'good-to-know',
    build: (scan) => {
      if (scan.toolchain.e2eRunner == null) return null;
      return {
        text: `${scan.toolchain.e2eRunner} tests drive the app like a real user clicking around. They are slower than unit tests, so they usually run separately.`
      };
    }
  },
  {
    id: 'orm-migrations',
    kind: 'good-to-know',
    build: (scan) => {
      if (scan.toolchain.orm === null) return null;
      const migrate = Object.keys(scan.scripts).find((name) => name.includes('migrate'));
      return {
        text: `${scan.toolchain.orm} manages the database. If the app complains about missing tables, a pending migration is the usual cause${migrate === undefined ? '.' : ` — the "${migrate}" script applies them.`}`
      };
    }
  },
  {
    id: 'launch-sequence',
    kind: 'shortcut',
    build: (scan) => {
      if ((scan.config?.config.launch?.length ?? 0) === 0) return null;
      return {
        text: 'This project defines a launch sequence: one command starts everything in the right order.',
        command: 'devsurface up'
      };
    }
  },
  {
    id: 'setup-guide',
    kind: 'do-this',
    build: (scan) => {
      if ((scan.config?.config.setupGuide?.length ?? 0) === 0) return null;
      return {
        text: 'The maintainers wrote a step-by-step setup guide for this project — the Onboarding page walks you through it with buttons for each step.'
      };
    }
  }
];

/** Evergreen tips shown when few contextual rules fire; safe for any project. */
const EVERGREEN_TIPS: Tip[] = [
  {
    id: 'evergreen-ctrl-c',
    kind: 'good-to-know',
    text: 'Ctrl+C in a terminal politely stops the program running there. It does not delete anything — you can always start it again.'
  },
  {
    id: 'evergreen-error-reading',
    kind: 'good-to-know',
    text: 'When a command fails, the useful part of the error is usually the FIRST error line, not the last. Scroll up before panicking.'
  },
  {
    id: 'evergreen-restart',
    kind: 'shortcut',
    text: 'A surprising number of "it stopped working" problems are fixed by stopping the dev server and starting it again.'
  },
  {
    id: 'evergreen-node-modules',
    kind: 'good-to-know',
    text: 'The node_modules folder is machine-generated and safe to delete. Reinstalling dependencies rebuilds it — a classic fix for weird install problems.'
  },
  {
    id: 'evergreen-copy-errors',
    kind: 'shortcut',
    text: 'Pasting the exact error message into a search engine (or an AI assistant) solves most everyday problems — every developer does this daily.'
  },
  {
    id: 'evergreen-small-commits',
    kind: 'good-to-know',
    text: 'Commit small and often. Each commit is a save point you can return to, so frequent saves make mistakes cheap.'
  }
];

/** How many evergreen tips are appended after contextual ones. */
const EVERGREEN_FILL = 3;

/** Build the ordered tip list for a scanned project (do-this first). */
export function buildTips(scan: ScanResult): Tip[] {
  const tips: Tip[] = [];
  for (const rule of TIP_RULES) {
    const result = rule.build(scan);
    if (result !== null) {
      tips.push({ id: rule.id, kind: rule.kind, ...result });
    }
  }
  const order: Record<TipKind, number> = { 'do-this': 0, shortcut: 1, 'good-to-know': 2 };
  tips.sort((left, right) => order[left.kind] - order[right.kind]);
  return [...tips, ...EVERGREEN_TIPS.slice(0, EVERGREEN_FILL)];
}

export const TIP_RULE_COUNT = TIP_RULES.length + EVERGREEN_TIPS.length;
