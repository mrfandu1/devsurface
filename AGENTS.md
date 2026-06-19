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

## Key Directories

src/cli/ contains CLI commands.
src/core/ contains scanners, doctor checks, config, and process runner code.
src/server/ contains the Hono API server.
src/web/ contains the React dashboard.

## Rules

- Never bind to 0.0.0.0. Always use 127.0.0.1.
- Never print .env values. Only show presence or absence.
- Always use cross-spawn instead of child_process.exec for Windows support.
- Always use path.join() for file paths, never string concatenation.
- Scanner functions return null when the target is not found. Do not throw.
