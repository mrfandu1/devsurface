<!-- markdownlint-disable MD033 MD041 -->

<a id="readme-top"></a>

<div align="center">

<h1>DevSurface</h1>

<p><strong>Turn any Node.js repository into a local developer control panel.</strong></p>

<p>
  <a href="#quick-start">Quick Start</a>
  &nbsp;&middot;&nbsp;
  <a href="#commands">Commands</a>
  &nbsp;&middot;&nbsp;
  <a href="#dashboard">Dashboard</a>
  &nbsp;&middot;&nbsp;
  <a href="https://github.com/mrfandu1/devsurface/issues">Report an issue</a>
</p>

<p>
  <a href="https://github.com/mrfandu1/devsurface">
    <img alt="DevSurface ready" src="docs/devsurface-badge.svg">
  </a>
  <a href="LICENSE">
    <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-informational">
  </a>
  <img alt="Built with TypeScript" src="https://img.shields.io/badge/Built%20with-TypeScript-3178c6">
</p>

</div>

DevSurface scans a project, starts a local dashboard, and shows the things contributors
usually need before a project will run: package scripts, environment files, ports,
Docker Compose, live command logs, and repo health warnings.

No config file is required.

```bash
npx devsurface
```

With Bun:

```bash
bunx devsurface
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

Or, if you use Bun:

```bash
cd my-node-project
bunx devsurface
```

The dashboard opens at:

```text
http://127.0.0.1:4567
```

If a browser does not open automatically, copy the printed dashboard URL from the
terminal.

## Commands

Run DevSurface without installing it globally:

| Runtime | Command           |
| ------- | ----------------- |
| npm     | `npx devsurface`  |
| Bun     | `bunx devsurface` |

| Command                   | Description                                                          |
| ------------------------- | -------------------------------------------------------------------- |
| `devsurface`              | Scan the current project, start the dashboard, and open the browser. |
| `devsurface scan`         | Print detected project information to the terminal.                  |
| `devsurface doctor`       | Print setup and repo health warnings.                                |
| `devsurface init`         | Create a starter `devsurface.config.json`.                           |
| `devsurface run <script>` | Run a package script and stream output.                              |

## GitHub Action

DevSurface can check repository onboarding health on every pull request without
installing dependencies or running project scripts.

```yaml
name: DevSurface

on:
  pull_request:
  push:
    branches: [main]

permissions:
  contents: read
  pull-requests: write

jobs:
  health:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: mrfandu1/devsurface@v0
        with:
          fail-on: error
```

The action always emits workflow annotations and a Markdown job summary. On pull
requests it also creates or updates one DevSurface comment when the workflow token
has `pull-requests: write`. Fork pull requests normally receive a read-only token;
in that case the action keeps the annotations and summary and skips the comment.

Inputs:

| Input          | Default | Description                                                     |
| -------------- | ------- | --------------------------------------------------------------- |
| `path`         | `.`     | Repository-relative directory to check.                         |
| `fail-on`      | `error` | Fail on `error`, `warning`, or never fail with `never`.         |
| `comment`      | `true`  | Create or update a pull request comment when permissions allow. |
| `github-token` | token   | Token used only for pull request comments.                      |

The repository checks are intentionally static. They do not install dependencies,
run package scripts, inspect local ports, require a real `.env`, or contact Docker.

## What It Detects

| Area            | Detection                                                          |
| --------------- | ------------------------------------------------------------------ |
| Project         | `package.json`, project name, README, LICENSE                      |
| Package manager | npm, pnpm, yarn, bun from lock files                               |
| Scripts         | `package.json` scripts                                             |
| Environment     | `.env`, `.env.example`, missing and empty keys without values      |
| Ports           | Configured, inferred, and occupied ports using Node's `net` module |
| Docker          | Compose files, daemon status, service state, controls, and logs    |
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
- **Services**: Docker Compose daemon state, per-service status, start/stop controls,
  and the latest 200 log lines for each service.
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
- Docker service start and stop actions show the exact Compose command before running.
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

## Contributing

Contributions of every kind are welcome: code, documentation, bug reports,
examples, and reviews. Start with [CONTRIBUTING.md](CONTRIBUTING.md) for the
development workflow.

## License

DevSurface is released under the MIT License. See [LICENSE](LICENSE) for the full
text. Copyright (c) 2026 DevSurface contributors.

## Contact and community

- GitHub Issues: report bugs and request features through
  [GitHub Issues](https://github.com/mrfandu1/devsurface/issues).
- Security: report vulnerabilities through [SECURITY.md](SECURITY.md).

[(back to top)](#readme-top)
