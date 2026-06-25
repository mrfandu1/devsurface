# AGENTS.md

## Project

DevSurface is a TypeScript CLI tool. Run `npx devsurface` to launch a local dashboard
for any Node.js project.

## Setup

npm install
npm run build
npm test

## Test

npm test runs Vitest. All tests must pass before any PR is submitted.

## Lint

npm run lint
npm run format:check

## Build

npm run build:cli builds the CLI with tsup.
npm run build:web builds the web UI with Vite.
npm run build:action builds the committed GitHub Action bundle.

## Key Directories

src/cli/ contains CLI commands including serve and workspace.
src/core/ contains scanners, doctor checks, config, process runner, and hub code.
src/core/hub/ contains the WorkspaceRegistry and Hub runtime for multi-workspace mode.
src/server/ contains the Hono API server with workspace-scoped routes.
src/web/ contains the React dashboard with workspace switcher.
src/action/ contains the GitHub Action runtime and report formatting.
deploy/k3s/ contains Kubernetes manifests for local-cluster deployment.

## Architecture

DevSurface runs as a Hub: one server serving multiple project workspaces.
Each workspace gets its own ProcessManager and DockerComposeController.
Workspace state persists in ~/.devsurface/workspaces.json.

Running `npx devsurface` inside a project attaches to an existing hub if one
is running, or starts a new one. `devsurface serve` starts a foreground hub.

## Rules

- Never bind to 0.0.0.0 on bare metal. Always use 127.0.0.1.
  Exception: containers may set DEVSURFACE_HOST=0.0.0.0 when the host port
  mapping is 127.0.0.1:4567:4567.
- Never print .env values. Only show presence or absence.
- Always use cross-spawn instead of child_process.exec for Windows support.
- Always use path.join() for file paths, never string concatenation.
- Scanner functions return null when the target is not found. Do not throw.
- Each workspace must have its own ProcessManager. Never share process state.
