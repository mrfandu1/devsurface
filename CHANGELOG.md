# Changelog

## 1.0.0

DevSurface 1.0: the dashboard becomes live, launchable, and persistent.

- **A real-time WebSocket layer**: the server watches scan-relevant files
  (package.json, .env, compose files, tsconfig, …) per workspace, then
  rescans server-side and pushes the full result — scan, health, and
  onboarding — so dashboards update instantly with zero extra HTTP requests.
  Finished runs stream into Recent Runs live (`run-recorded`), registry
  changes broadcast to every client (`workspaces-changed`), and Docker
  start/stop actions push the refreshed service state. The client
  auto-reconnects with exponential backoff (immediately when the tab regains
  focus), the server heartbeats and drops dead connections, and toasts
  announce file changes, connection loss, and recovery.
- **Launch sequences**: a `launch` array in devsurface.config.json (validated,
  with a doctor check for unknown entries) or a detected default (Compose
  services → dev/start script). Run it with the new **`devsurface up`** command
  (`--dry-run` to preview), the dashboard's Launch quick action, the command
  palette, and it appears in the passport quick start. `devsurface init` now
  generates a real config from detection — commands, ports, env, services, and
  the launch sequence prefilled (`--force` to regenerate).
- **Process control**: Restart button on running scripts, a Stop All button and
  palette action backed by a new `stop-all` endpoint, and SIGTERM cleanup so
  containers stop child processes cleanly.
- **Logs, properly**: ANSI colors render (SGR parser, no HTML pass-through),
  error/warning lines are tinted, auto-scroll with a "jump to latest" button,
  wrap and timestamp toggles, a per-script filter dropdown, per-process copy
  buttons and durations, and a client-side "clear view".
- **Toast notifications** for live events and actions, **persistent dashboard
  settings and sidebar state** across reloads, **recently-used-first command
  palette**, nav badges for remaining onboarding steps and busy ports,
  clickable homepage link and new Provides-CLI / Module-System overview cells,
  a workspace search filter on the hub screen, env-file extras
  (.env.local/.env.development/…) listed, and env key descriptions harvested
  from example-file comments (shown in the dashboard and passport).
- **More detection**: e2e runner (Playwright/Cypress/…) separate from the unit
  runner, git default branch, package bin commands, ESM/CommonJS module type,
  homepage/repository URL, monorepo member script counts, and eight more
  frameworks (Qwik, Preact, Lit, Ember, Eleventy, VitePress, Strapi, Payload)
  with default ports. Script explanations learned knip/depcheck, madge,
  size-limit, semantic-release, commitlint, and db/smoke/postinstall names.
- **Twelve more doctor checks**: npm placeholder test script, .nvmrc vs
  engines.node conflicts, obsolete Compose `version:` key, scripts calling
  tools missing from devDependencies, orphaned prettier/eslint configs,
  launch entries that match nothing, duplicate config ports, empty
  .env.example, npm-invalid package names, READMEs without a title, license
  field vs LICENSE file mismatches, and test files with no test script.
  Unknown devsurface.config.json keys now warn too.
- **CLI**: `devsurface up`, `devsurface upgrade` (explicit registry check),
  `verify --json/--bail`, `explain` "did you mean" suggestions,
  `passport -o -` (stdout), `badge --label`, `history --script/--clear`,
  `workspace list --json`, `info --json`.
- **API**: `GET /api/workspaces/:id/report.md` (Markdown report over HTTP,
  also in the palette), `GET /api/workspaces/:id/badge.svg` (live readiness
  badge), `POST /api/workspaces/:id/stop-all`.
- **Reports**: the Markdown report gained toolchain, project-facts, and README
  quick-start sections; the passport gained env descriptions, the launch
  command, and recommended VS Code extensions.

## 0.13.0

- Deeper project intelligence: license type detection from LICENSE text (MIT,
  Apache-2.0, GPL, BSD, ISC, MPL, …), TypeScript version, git-hook manager
  (Husky/lefthook/pre-commit), total commit count and latest reachable tag,
  pinned package-manager version, CHANGELOG presence + newest entry,
  CONTRIBUTING/CODE_OF_CONDUCT detection, recommended VS Code extensions, and
  a bounded test-file count. Compose files now contribute their published
  host ports to port probing, and the root Dockerfile's base image is read.
- Eight more doctor checks: missing description/license fields, CHANGELOG
  behind package.json, node_modules missing from .gitignore, unpinned
  Dockerfile base image, scripts pointing at files that do not exist,
  packages duplicated across dependencies and devDependencies, wildcard
  ("\*"/"latest") versions, and very short READMEs.
- CLI: `devsurface run` with no argument opens an interactive script picker;
  `verify --only/--skip`; `passport --open`; `badge --score`;
  `history --clear`; `scan --summary` (one-line status for prompts);
  `devsurface status` (pings the local hub: version, uptime, workspaces);
  `ports --json`.
- API: `GET /api/workspaces/:id/ports/common` scans the ports dev tools
  usually claim (3000, 5173, 8080, 5432, …) and identifies the owners;
  `/api/hub/status` now reports uptime and workspace count.
- Dashboard: the browser tab shows the project name and a status-dot favicon
  (green running / red failed); "refreshed Xs ago" ticker; last-run info per
  script; a Logs jump button on running scripts; pause/resume for the log
  stream with clickable stdout/stderr/system count chips; "copy unset keys as
  template" in Environment; a "copy all setup commands" button and a
  ready-to-run hero on Onboarding; a "What else is running?" common-ports
  scanner in Ports; Docker service start/stop entries and "copy project
  path" in the command palette; commit/tag, license-type, and test-file
  Overview cells; collapsible configured-command groups; compose port badges
  per service; and "(missing)" markers in the workspace switcher.
- Passport: hero badges for commit count, latest tag, and license; a "Good to
  know" section with a plain-English explanation of the license and pointers
  to CONTRIBUTING, the code of conduct, and the CHANGELOG.

## 0.12.0

- Added toolchain detection: the test runner, linter, formatter, bundler, ORM,
  styling system, and CI provider are identified and shown on the Overview, in
  `devsurface scan`, and in a new "everyday tools" passport section.
- Added a unified Node requirement (engines.node, `.nvmrc`, or
  `.node-version`) shown on the Overview and in `devsurface scan`.
- Added README quick-start extraction: setup commands found in fenced shell
  blocks appear as onboarding steps ("From the README quick start") when the
  project has no maintainer-authored setup guide.
- Added security/hygiene doctor checks: real-looking secrets committed in
  `.env.example` (error, key names only), Compose `${VARS}` that no local env
  defines (warning), TypeScript strict mode off (info), and a Node runtime
  past end-of-life (warning).
- Added `devsurface env check` (missing/empty key report with CI exit codes
  and `--json`) and `devsurface env sync` (appends keys that exist in the
  example but not in `.env` — never overwrites existing values).
- Added `devsurface doctor --json` and `--fail-on <severity>` for CI gates,
  `devsurface info` (version + data locations), and `--json` for `history`
  and `explain`.
- Dashboard: pin favorite scripts to the top (stored per project in the
  browser), live elapsed timers on running scripts, copy buttons for script
  commands and port URLs, an Open button for busy ports, optional browser
  notifications when a script fails, a "?" keyboard-shortcuts overlay, an
  add-workspace form on the hub screen, severity filter chips and a
  copy-as-Markdown button on Repo Health, a warning-count badge on the Repo
  Health nav item, and a reset-settings button.

## 0.11.0

- Added run history: every script, install, and configured command started from
  the dashboard is recorded locally (`~/.devsurface/history`, never inside the
  repository) with status, exit code, and duration. The Scripts page shows a
  Recent Runs list, `/api/workspaces/:id/history` serves it, and
  `devsurface history` prints it in the terminal.
- Added port freeing: busy ports in the Ports view get a confirmed "Free"
  button that stops the occupying process, and `devsurface ports --free <port>`
  does the same from the terminal. Guardrails refuse to touch system processes
  or DevSurface itself, and the exact process name + PID is always shown before
  anything is stopped.
- Added `devsurface verify`: runs the project's quality scripts
  (format:check, lint, typecheck, check, test, build — whichever exist) in
  sequence with streamed output and a pass/fail summary; exits nonzero on
  failure so it works in CI and pre-push hooks.
- Added workspace pruning: `devsurface workspace prune` removes registered
  workspaces whose directories no longer exist, hub summaries flag missing
  workspaces, and the hub overview shows a one-click "Remove missing" cleanup.
- Added an open-in-editor action (Quick Actions and the command palette):
  detects the VS Code/Cursor/VSCodium CLI or honors `DEVSURFACE_EDITOR`.
- Added undocumented env key detection: keys present in `.env` but missing from
  `.env.example` are listed in the Environment view and raised as a doctor info
  notice, since other machines will not know those settings exist.

## 0.10.0

- Added deep git insights: the scanner now reports working-tree changes,
  ahead/behind counts against the upstream, the last commit (subject, author,
  age), and the origin remote URL with any embedded credentials stripped. The
  Overview shows Working Tree and Last Commit cells, `devsurface scan` prints
  `main (3 changed, 1 ahead)`, and everything degrades gracefully when the git
  CLI is unavailable.
- Added monorepo detection: npm/yarn/bun `workspaces`, `pnpm-workspace.yaml`,
  Turborepo, Nx, and Lerna are recognized, and member packages are resolved
  from workspace globs. Shown on the Overview, in `devsurface scan`, and as a
  passport hero badge.
- Added dependency insights: runtime/dev dependency counts and a stale-lockfile
  check (package.json modified after the lockfile) with a matching doctor
  warning.
- Added a dashboard dark theme: a topbar toggle, a Theme setting
  (System/Light/Dark), command-palette entries, `prefers-color-scheme` support,
  and persistence in localStorage. Every stylesheet color now flows through CSS
  variables.
- Added `devsurface explain [script]`: plain-English explanations of every
  package script and configured command in the terminal.
- Added `devsurface badge`: generates a shields-style `devsurface | NN% ready`
  SVG badge from the setup-readiness score for embedding in READMEs.
- Added `devsurface scan --markdown`: a full Markdown project report (overview,
  readiness checklist, scripts with explanations, env keys, ports, Docker,
  health) for docs, wikis, and pull requests.
- Added new doctor checks: stale lockfile, running Node below `engines.node`,
  local `.env` without a committed `.env.example`, missing LICENSE in git
  repos, and branch behind its upstream.
- Expanded framework detection from 7 to 29 frameworks (Astro, Nuxt, SvelteKit,
  Angular, Vue, Svelte, Solid, Gatsby, Docusaurus, RedwoodJS, Expo,
  React Native, Electron, Tauri, AdonisJS, Koa, hapi, Hono, tRPC, Drizzle,
  Storybook, Tailwind CSS, and more) with default dev-server ports for each.
- Expanded script explanations: coverage, benchmarks, codegen, bundle analysis,
  monorepo runners (turbo/nx/lerna), concurrently/npm-run-all,
  deploy CLIs (wrangler/vercel/netlify/firebase), changesets, husky,
  Electron/Tauri, drizzle-kit, and watch-mode runners.
- Added a script search box to the Scripts page and text/stream filters plus a
  download button to the Logs page.

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
