/**
 * Routes for the v1.1 project tools: notes, todos, stats, dependency
 * explorer, git insights, docs viewer, cleanup advisor, snapshots, one-click
 * fixes, and the help bundle.
 *
 * One registrar serves both server flavors: the hub mounts it under
 * `/api/workspaces/:id` with a workspace resolver, the legacy single-project
 * server under `/api` with a fixed root. Mutating routes are protected by
 * the existing `/api/*` mutation guard.
 */

import type { Context, Hono } from 'hono';
import type { ProcessManager } from '../../core/process/manager.js';
import { NotesStore } from '../../core/notes/index.js';
import { scanTodos } from '../../core/todos/index.js';
import { computeCodeStats } from '../../core/stats/index.js';
import { exploreDependencies } from '../../core/deps/index.js';
import { gatherGitInsights } from '../../core/git/insights.js';
import { listDocs, readDoc } from '../../core/docs/index.js';
import { buildCleanupReport, deleteCleanupTarget } from '../../core/cleanup/index.js';
import { digestScan, diffSnapshots, SnapshotStore } from '../../core/snapshots/index.js';
import { applyFix, listAvailableFixes } from '../../core/fixes/index.js';
import { renderHelpBundle } from '../../core/bundle/index.js';
import { runDoctor } from '../../core/doctor/index.js';
import { buildOnboardingPlan } from '../../core/onboarding/index.js';
import { checkSystem } from '../../core/system/index.js';
import { scanProject } from '../../core/scanner/index.js';
import type { RunHistoryStore } from '../../core/history/index.js';
import { DEV_SURFACE_VERSION } from '../../version.js';

export interface ToolRouteTarget {
  root: string;
  processManager?: ProcessManager;
}

export function registerToolRoutes(
  app: Hono,
  basePath: string,
  resolveTarget: (context: Context) => Promise<ToolRouteTarget | null>,
  history?: RunHistoryStore
): void {
  const notesStore = new NotesStore();
  const snapshotStore = new SnapshotStore();

  const route = (suffix: string): string => `${basePath}${suffix}`;

  type Handler = (context: Context, target: ToolRouteTarget) => Promise<Response>;
  const withTarget =
    (handler: Handler) =>
    async (context: Context): Promise<Response> => {
      const target = await resolveTarget(context);
      if (target === null) {
        return context.json({ error: 'Workspace not found.' }, 404);
      }
      return handler(context, target);
    };

  // ── Notes ────────────────────────────────────────────────────────────────
  app.get(
    route('/notes'),
    withTarget(async (context, target) => context.json(await notesStore.list(target.root)))
  );

  app.post(
    route('/notes'),
    withTarget(async (context, target) => {
      const body = await context.req
        .json<{ text?: unknown; checklist?: unknown }>()
        .catch(() => null);
      if (body === null || typeof body.text !== 'string' || body.text.trim().length === 0) {
        return context.json({ error: 'Note text is required.' }, 400);
      }
      const note = await notesStore.add(target.root, body.text, {
        checklist: body.checklist === true
      });
      return context.json(note, 201);
    })
  );

  app.post(
    route('/notes/:noteId/toggle'),
    withTarget(async (context, target) => {
      const note = await notesStore.toggleDone(target.root, context.req.param('noteId') ?? '');
      return note === null ? context.json({ error: 'Note not found.' }, 404) : context.json(note);
    })
  );

  app.post(
    route('/notes/:noteId/pin'),
    withTarget(async (context, target) => {
      const note = await notesStore.togglePinned(target.root, context.req.param('noteId') ?? '');
      return note === null ? context.json({ error: 'Note not found.' }, 404) : context.json(note);
    })
  );

  app.delete(
    route('/notes/:noteId'),
    withTarget(async (context, target) => {
      const removed = await notesStore.remove(target.root, context.req.param('noteId') ?? '');
      return context.json({ removed }, removed ? 200 : 404);
    })
  );

  // ── Read-only insights ───────────────────────────────────────────────────
  app.get(
    route('/todos'),
    withTarget(async (context, target) => context.json(await scanTodos(target.root)))
  );

  app.get(
    route('/stats'),
    withTarget(async (context, target) => context.json(await computeCodeStats(target.root)))
  );

  app.get(
    route('/deps'),
    withTarget(async (context, target) => {
      const scan = await scanProject(target.root);
      return context.json(await exploreDependencies(target.root, scan.packageJson));
    })
  );

  app.get(
    route('/git/insights'),
    withTarget(async (context, target) => context.json(await gatherGitInsights(target.root)))
  );

  app.get(
    route('/docs'),
    withTarget(async (context, target) => context.json(await listDocs(target.root)))
  );

  app.get(
    route('/docs/read'),
    withTarget(async (context, target) => {
      const relPath = context.req.query('path') ?? '';
      const markdown = await readDoc(target.root, relPath);
      return markdown === null
        ? context.json({ error: 'That document cannot be read.' }, 404)
        : context.json({ path: relPath, markdown });
    })
  );

  // ── Cleanup ──────────────────────────────────────────────────────────────
  app.get(
    route('/cleanup'),
    withTarget(async (context, target) => context.json(await buildCleanupReport(target.root)))
  );

  app.post(
    route('/cleanup/delete'),
    withTarget(async (context, target) => {
      const body = await context.req.json<{ name?: unknown }>().catch(() => null);
      if (body === null || typeof body.name !== 'string') {
        return context.json({ error: 'A folder name is required.' }, 400);
      }
      const result = await deleteCleanupTarget(target.root, body.name);
      return context.json(result, result.deleted ? 200 : 400);
    })
  );

  // ── Snapshots ────────────────────────────────────────────────────────────
  app.get(
    route('/snapshots'),
    withTarget(async (context, target) => context.json(await snapshotStore.list(target.root)))
  );

  app.post(
    route('/snapshots'),
    withTarget(async (context, target) => {
      const body = await context.req.json<{ label?: unknown }>().catch(() => null);
      const scan = await scanProject(target.root);
      const warnings = await runDoctor(target.root, scan);
      const plan = buildOnboardingPlan(scan, warnings);
      const snapshot = digestScan(scan, {
        warningIds: warnings.map((warning) => warning.id),
        readiness: plan.readiness,
        label: typeof body?.label === 'string' ? body.label : ''
      });
      await snapshotStore.save(target.root, snapshot);
      return context.json(snapshot, 201);
    })
  );

  app.get(
    route('/snapshots/diff'),
    withTarget(async (context, target) => {
      const previous = await snapshotStore.latest(target.root);
      if (previous === null) {
        return context.json({ error: 'No snapshot to compare against yet.' }, 404);
      }
      const scan = await scanProject(target.root);
      const warnings = await runDoctor(target.root, scan);
      const plan = buildOnboardingPlan(scan, warnings);
      const current = digestScan(scan, {
        warningIds: warnings.map((warning) => warning.id),
        readiness: plan.readiness,
        label: 'now'
      });
      return context.json(diffSnapshots(previous, current));
    })
  );

  // ── One-click fixes ──────────────────────────────────────────────────────
  app.get(
    route('/fixes'),
    withTarget(async (context, target) => context.json(await listAvailableFixes(target.root)))
  );

  app.post(
    route('/fixes/apply'),
    withTarget(async (context, target) => {
      const body = await context.req.json<{ warningId?: unknown }>().catch(() => null);
      if (body === null || typeof body.warningId !== 'string') {
        return context.json({ error: 'A warningId is required.' }, 400);
      }
      const result = await applyFix(target.root, body.warningId);
      return context.json(result, result.applied ? 200 : 400);
    })
  );

  // ── Help bundle ──────────────────────────────────────────────────────────
  app.get(
    route('/bundle.md'),
    withTarget(async (context, target) => {
      const scan = await scanProject(target.root);
      const [warnings, system, runs] = await Promise.all([
        runDoctor(target.root, scan),
        checkSystem(scan),
        history === undefined ? Promise.resolve([]) : history.list(target.root)
      ]);
      const markdown = renderHelpBundle({
        scan,
        warnings,
        system,
        history: runs,
        logs: target.processManager?.listLogs(),
        devsurfaceVersion: DEV_SURFACE_VERSION
      });
      context.header('Content-Type', 'text/markdown; charset=utf-8');
      if (context.req.query('download') === '1') {
        const safeName =
          scan.projectName.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 60) || 'project';
        context.header('Content-Disposition', `attachment; filename="${safeName}-help.md"`);
      }
      return context.body(markdown);
    })
  );
}
