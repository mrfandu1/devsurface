# DevSurface

[![DevSurface ready](docs/devsurface-badge.svg)](https://github.com/mrfandu1/devsurface)

Turn any Node.js repository into a local developer control panel.

DevSurface scans a project, starts a local dashboard, and shows the things contributors
usually need before a project will run: package scripts, environment files, ports,
Docker Compose, live command logs, and repo health warnings.

No config file is required.

```bash
npx devsurface
```

![DevSurface demo](docs/devsurface-demo.gif)

## Why DevSurface

Most repositories explain setup with a few commands, but real onboarding usually
means checking env files, ports, Docker, package managers, scripts, and stale README
instructions. DevSurface puts that project surface in one local browser view so a
new contributor can see what is missing before guessing in the terminal.

DevSurface is local-first:

- The server binds to `127.0.0.1`.
- No accounts, cloud sync, telemetry, or analytics.
- `.env` values are never displayed.
- Commands are shown before they run.

## How It Compares

| Tool                   | What it does                                         | Where DevSurface is different                                                                    |
| ---------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| runme.dev              | Runs commands embedded in annotated README markdown. | Requires maintainers to annotate commands. DevSurface scans the repo without README annotations. |
| VS Code Tasks          | Runs tasks from `.vscode/tasks.json`.                | VS Code only and manually configured. DevSurface runs from `npx` and opens in any browser.       |
| Makefile / Taskfile    | Provides terminal task runners.                      | Terminal only. DevSurface adds UI, auto-detection, ports, env checks, logs, and health warnings. |
| npm-run-all            | Runs multiple npm scripts from the terminal.         | Script orchestration only. DevSurface shows the whole local project surface.                     |
| `package.json` scripts | Standard Node.js script entry points.                | No UI, env checks, port checks, service detection, or repo health context.                       |

DevSurface is not trying to replace these tools. It sits above them as a local control
panel for contributors who need to understand how a project is meant to run.

## Quick Start

Run DevSurface from the root of any Node.js project:

```bash
cd my-node-project
npx devsurface
```

The dashboard opens at:

```text
http://127.0.0.1:4567
```

If a browser does not open automatically, copy the printed dashboard URL from the
terminal.

## Commands

| Command                   | Description                                                          |
| ------------------------- | -------------------------------------------------------------------- |
| `devsurface`              | Scan the current project, start the dashboard, and open the browser. |
| `devsurface scan`         | Print detected project information to the terminal.                  |
| `devsurface doctor`       | Print setup and repo health warnings.                                |
| `devsurface init`         | Create a starter `devsurface.config.json`.                           |
| `devsurface run <script>` | Run a package script and stream output.                              |

## What It Detects

| Area            | Detection                                                          |
| --------------- | ------------------------------------------------------------------ |
| Project         | `package.json`, project name, README, LICENSE                      |
| Package manager | npm, pnpm, yarn, bun from lock files                               |
| Scripts         | `package.json` scripts                                             |
| Environment     | `.env`, `.env.example`, missing and empty keys without values      |
| Ports           | Configured, inferred, and occupied ports using Node's `net` module |
| Docker          | Compose files, Docker daemon status, compose service names         |
| Git             | Repository presence and current branch                             |
| Framework       | Next.js, Vite, Express, Fastify, NestJS, Remix, Prisma             |

## Dashboard

The dashboard includes:

- **Project Overview**: project name, framework, package manager, branch, env, README,
  and license status.
- **Quick Actions**: compact direct actions for scripts, terminal, project folder,
  `package.json`, and dependency install.
- **Scripts**: every package script, plus grouped configured commands when present.
- **Environment**: `.env` and `.env.example` status, key presence, and copy-from-example.
- **Ports**: detected ports with availability and conflict warnings.
- **Services**: Docker Compose detection and service status.
- **Logs**: expandable per-command logs with timestamps, streams, and exit state.
- **Repo Health**: doctor warnings for common setup issues.

Quick Actions intentionally stay compact. Long script lists belong in the Scripts
page, where they have room to breathe.

## Optional Config

DevSurface works without configuration. Maintainers can add `devsurface.config.json`
when a project needs richer commands, groups, ports, env paths, or docs links.

```json
{
  "name": "My App",
  "description": "Full-stack SaaS starter",
  "commands": {
    "install": "pnpm install",
    "dev": "pnpm run dev",
    "build": "pnpm run build",
    "test": "pnpm test",
    "lint": "pnpm run lint"
  },
  "groups": {
    "Setup": ["install"],
    "Development": ["dev"],
    "Quality": ["test", "lint"],
    "Build": ["build"]
  },
  "ports": [3000, 5432, 6379],
  "env": {
    "example": ".env.example",
    "local": ".env"
  },
  "services": {
    "docker": true
  },
  "docs": "https://docs.example.dev"
}
```

Configured commands appear on the Scripts page. If `groups` is present, DevSurface
uses those group names. Commands not listed in a group still appear under
Configured Commands. The `docs` URL appears as a Project docs link.

## Badge

Maintainers can add this badge to a project README after checking that DevSurface
works for the repo:

```markdown
[![DevSurface ready](https://raw.githubusercontent.com/mrfandu1/devsurface/main/docs/devsurface-badge.svg)](https://github.com/mrfandu1/devsurface)
```

## Safety

DevSurface is designed for local development.

- The dashboard server is restricted to `127.0.0.1`.
- Mutating API routes require dashboard intent headers.
- `.env` values are never returned by scanners, API routes, CLI output, or UI panels.
- Dashboard command runs show the exact command string first.
- Destructive-looking configured commands, such as `rm -rf`, `docker volume rm`,
  database drops, and `git clean -fd`, are visibly marked before execution.
- Child processes started by DevSurface are cleaned up when the dashboard exits.

## Examples

This repository includes two sample projects:

```bash
cd examples/node-basic
node ../../dist/cli/index.js

cd examples/nextjs-app
node ../../dist/cli/index.js
```

The Next.js example is used for the README demo: it has six scripts, `.env.example`,
Docker Compose, and a port conflict scenario.

## Development

```bash
npm install
npm run build
npm test
```

Useful commands:

| Command                | Description                               |
| ---------------------- | ----------------------------------------- |
| `npm run dev`          | Run the local DevSurface CLI from source. |
| `npm run build:web`    | Build the React dashboard with Vite.      |
| `npm run build:cli`    | Build the CLI with tsup.                  |
| `npm run typecheck`    | Run TypeScript without emitting files.    |
| `npm run lint`         | Run ESLint.                               |
| `npm run format:check` | Check Prettier formatting.                |

Before opening a pull request, run:

```bash
npm run format:check
npm run typecheck
npm run lint
npm test
npm run build
```

## Publishing

The npm package is allowlisted through `package.json#files`. The package includes the
built CLI, built web UI, README, demo GIF, license, and changelog. Private notes,
tests, examples, and development-only files are excluded from npm publishes.

Check package contents before publishing:

```bash
npm pack --dry-run
```

## License

MIT. See [LICENSE](LICENSE).
