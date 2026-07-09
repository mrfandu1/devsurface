# Changelog

## 0.9.0

- Added Rust project support: `Cargo.toml` is detected as a project language and
  adds Cargo commands (`cargo run`, `cargo build`, `cargo test`, `cargo check`)
  to the command list. The passport requirements section now lists the Rust
  toolchain for Rust projects.
- Added Makefile target detection: top-level targets in `Makefile`, `makefile`,
  or `GNUmakefile` (up to 20, skipping pattern rules and variable assignments)
  appear as runnable `make <target>` commands in a Makefile group.
- Added PHP support: `composer.json` is detected as a project language and adds
  `composer install` plus each composer script as a runnable command; Laravel
  projects with an `artisan` file also get `php artisan serve` on port 8000.
- Added Ruby support: a `Gemfile` is detected as a project language and adds
  `bundle install`; Rails projects get `rails server` / `rails db:migrate`
  (port 3000) and RSpec projects get `bundle exec rspec`.
- Added Justfile recipe detection: recipes in `justfile`, `Justfile`, or
  `.justfile` appear as runnable `just <recipe>` commands.
- Added Taskfile detection: tasks in `Taskfile.yml`/`Taskfile.yaml` (go-task)
  appear as runnable `task <name>` commands.
- Added Deno task detection: tasks in `deno.json`/`deno.jsonc` appear as
  runnable `deno task <name>` commands.
- Added Dockerfile detection: a root `Dockerfile` adds a
  `docker build -t <project> .` command even without a compose file.
- Added doctor check: warns when the running Node major version differs from
  the version pinned in `.nvmrc` or `.node-version`.
- Added doctor check: warns when multiple package-manager lockfiles coexist
  (npm/yarn/pnpm/bun), which causes dependency drift.
- Added doctor check: errors when a local `.env` exists in a git repo but
  `.gitignore` does not cover it, since secrets could be committed.
- Added doctor check: info notice when no CI configuration (GitHub Actions,
  GitLab CI, CircleCI, Azure Pipelines, Jenkins) is found in a git repo.
- Added `devsurface ports`: a quick terminal view of every project port, who is
  using busy ones, and a free alternative to try.
- Added `devsurface scan --json`: prints the full scan result as JSON for
  scripts and CI (the update notice is suppressed so output stays parseable).
- Busy ports now carry a suggested free port. The Ports views in the dashboard
  and the doctor warning show "in use by X — try 5174" instead of just "in use".
- Added git hook tooling detection: `.pre-commit-config.yaml` and
  `lefthook.yml` add install/run commands to the dashboard command list.
- Added doctor check: warns when package.json's `packageManager` field
  disagrees with the lockfile that is actually committed.
- Added doctor notice: points out when the project ships a dev container as a
  one-click setup path.
- `cargo run` is now only offered when the crate has a runnable binary
  (`src/main.rs` or a `[[bin]]` section), so library-only crates and virtual
  workspaces no longer show a command that would fail.

## 0.8.0

- Added Project Passport: `devsurface passport` generates a single self-contained
  HTML onboarding report that explains the project in plain English — what it is,
  how to run it step by step with exact commands, every script explained, env key
  names (never values), ports, Docker services, and health warnings. It opens
  offline in any browser and is safe to share.
- Added `GET /api/workspaces/:id/passport` (and `/api/passport` alias) serving the
  passport from the dashboard, plus a Passport quick action in the overview.
- Added port owner detection: busy ports now show which process is squatting on
  them ("in use by node.exe (PID 1234)") in the Ports view and inspector, using
  netstat/tasklist on Windows and lsof elsewhere. Lookups are best-effort and
  never block or fail a scan.
- Added write-only env quick-fill: missing or empty .env keys get a password
  input in the Environment view. Values are written straight to .env
  (created with owner-only permissions when missing) and are never displayed,
  logged, or returned by any API. New `POST /api/workspaces/:id/env/set` route
  behind the standard mutation guard.
- Added a Ctrl+K / Cmd+K command palette: fuzzy-search views, package scripts
  (with plain-English explanations), quick actions, and workspaces, then run
  the selection from the keyboard.
- Fixed `devsurface serve -p <port>` (and other subcommand `-p` flags) being
  silently swallowed by the root `--port` option, which made the hub always
  bind the default port 4567.

## 0.7.1

- Added structured `setupGuide` steps in `devsurface.config.json`: each step can be a plain string or an object with `title`, `description`, and a `command` or `script` key that turns it into a one-click action button in the Onboarding tab.
- Updated `devsurface init` to generate a richer config with grouped commands (First-time setup, Daily development, Before committing) and actionable setup steps.
- Added plain-English explanations for every package script in the dashboard, so non-technical users can see what a command like `vite` or `tsc --noEmit` actually does before running it.

## 0.6.0

- Added guided onboarding with a setup readiness score (0–100%) computed from scan and doctor results.
- Added `devsurface onboard` CLI command that prints a colored checklist of setup steps with done/todo/manual status.
- Added `/api/onboarding` endpoint (and `/api/workspaces/:id/onboarding` for hub mode) returning the full onboarding plan.
- Added Onboarding tab in the dashboard with progress bar, per-step actions (install deps, copy `.env`, run scripts, open docs), and a compact banner on the overview when the project is not yet ready.
- Added `setupGuide` (or `setup_guide`) field in `devsurface.config.json` for maintainers to embed ordered setup instructions (max 24 steps, 200 chars each).
- Added Python, Go, and Java language support to the onboarding plan; install step is skipped for non-Node projects.
- Hardened hub workspace registry file permissions to `0o600`.
- Added a startup warning when `DEVSURFACE_WORKSPACE_ROOTS` is unset in container mode.
- Shifted keyboard shortcuts: 2=Onboarding, 3=Scripts, 8=Logs (previously 7).

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
