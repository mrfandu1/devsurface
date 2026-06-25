# Changelog

## 0.5.0

- Added framework presets for Next.js, Vite, Express, Fastify, NestJS, Remix, and Prisma.
- Added detected preset commands and ports to the dashboard and command API.
- Added Python project detection for `requirements.txt`, `pyproject.toml`, and `Pipfile`, including FastAPI/Uvicorn, Flask, and Django commands.
- Added Go project detection from `go.mod`, with run, build, and test commands.
- Added Java project detection from Maven and Gradle build files, with build and test commands.
- Updated doctor checks so detected Python, Go, and Java projects are not treated as broken Node.js projects.

## 0.4.0

- Added multi-workspace Hub mode: one DevSurface instance serves multiple project
  directories. Run `npx devsurface` in any project to attach it to a running hub.
- Added `devsurface serve` command for running the hub as a persistent background
  server, Docker container, or k3s pod.
- Added `devsurface workspace add|list|remove` commands for managing registered
  workspaces from the CLI.
- Added workspace switcher and Hub overview page in the dashboard for comparing
  projects at a glance.
- Added workspace-scoped API routes under `/api/workspaces/:id/*` with backward-
  compatible aliases for single-project setups.
- Added workspace-scoped WebSocket connections via `?workspace=<id>` query parameter.
- Added Dockerfile, docker-compose.hub.yml, and deploy/k3s/ Kubernetes manifests
  for containerized and local-cluster deployments.
- Added `DEVSURFACE_HOST`, `DEVSURFACE_CONTAINER`, `DEVSURFACE_DATA_DIR`,
  `DEVSURFACE_WORKSPACES`, and `DEVSURFACE_WORKSPACE_ROOTS` environment variables
  for container and workspace-root configuration.
- Kept per-project `devsurface.config.json` unchanged; existing single-project
  workflows auto-register on first run.
- Added workspace-root configuration for deployments that should only register
  projects from mounted directories.

## 0.3.0

- Added the reusable `mrfandu1/devsurface@v0` GitHub Action.
- Added static repository checks for onboarding documentation, scripts, configuration,
  environment setup, and declared ports.
- Added workflow annotations, job summaries, optional update-in-place pull request
  comments, and configurable failure thresholds.
- Added safe fallback behavior when fork pull requests have read-only tokens.
- Added Docker Compose service status with running, stopped, error, and unavailable states.
- Added dashboard controls to start and stop individual Compose services.
- Added bounded per-service Docker Compose logs in the Services view.
- Added Docker Desktop guidance when the engine is not responding on macOS or Windows.
- Reduced consumer-installed dependencies by bundling the browser opener and keeping
  React build-only.

## 0.2.0

- Added retained process logs through `GET /api/logs` so the dashboard can recover session output without relying only on WebSocket state.
- Added dashboard keyboard shortcuts for refresh, section navigation, settings, sidebar collapse, and drawer close.
- Added exit-code-aware process status labels in the dashboard.
- Kept dashboard settings in memory to avoid browser storage.
- Documented `bunx devsurface` as a no-install launch command.

## 0.1.0

- Initial DevSurface MVP scaffold.
- Added project scanner, doctor checks, CLI commands, local API server, dashboard, examples, and CI.
- Added grouped `devsurface.config.json` commands on the Scripts page.
- Added dashboard actions for dependency install, opening the project folder, opening `package.json`, opening a terminal, copying `.env.example`, and retained command logs.
- Added completed/failed script status display after commands exit.
