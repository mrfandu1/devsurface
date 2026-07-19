/**
 * Routes for the v1.2 insight tools: secret scan, env usage, script
 * intelligence, git activity, dependency health, test insights, config
 * inspector, bloat finder, link checker, CI insights, standup, release-note
 * draft, README score, and the project scorecard.
 *
 * Like `registerToolRoutes`, one registrar serves both server flavors: the
 * hub mounts it under `/api/workspaces/:id`, the single-project server under
 * `/api`. Every route here is read-only (GET), so no mutation is possible.
 */

import type { Context, Hono } from 'hono';
import { scanSecrets } from '../../core/secrets/index.js';
import { exploreEnvUsage } from '../../core/env/usage.js';
import { analyzeScripts } from '../../core/scripts/index.js';
import { gatherActivity } from '../../core/git/activity.js';
import { checkDepsHealth } from '../../core/deps/health.js';
import { analyzeTests } from '../../core/testinsights/index.js';
import { inspectConfigs } from '../../core/configs/index.js';
import { findBloat } from '../../core/bloat/index.js';
import { checkLinks } from '../../core/links/index.js';
import { analyzeCi } from '../../core/ci/index.js';
import { buildStandup } from '../../core/standup/index.js';
import { buildChangelogReport } from '../../core/changelog/index.js';
import { scoreReadme } from '../../core/readme/index.js';
import { buildScorecard } from '../../core/scorecard/index.js';
import { scanProject } from '../../core/scanner/index.js';

export interface InsightRouteTarget {
  root: string;
}

export function registerInsightRoutes(
  app: Hono,
  basePath: string,
  resolveTarget: (context: Context) => Promise<InsightRouteTarget | null>
): void {
  const route = (suffix: string): string => `${basePath}${suffix}`;

  type Handler = (context: Context, root: string) => Promise<Response>;
  const withRoot =
    (handler: Handler) =>
    async (context: Context): Promise<Response> => {
      const target = await resolveTarget(context);
      if (target === null) {
        return context.json({ error: 'Workspace not found.' }, 404);
      }
      return handler(context, target.root);
    };

  app.get(
    route('/secrets'),
    withRoot(async (context, root) => context.json(await scanSecrets(root)))
  );

  app.get(
    route('/env/usage'),
    withRoot(async (context, root) => {
      const scan = await scanProject(root);
      return context.json(await exploreEnvUsage(root, scan.env));
    })
  );

  app.get(
    route('/scripts'),
    withRoot(async (context, root) => {
      const scan = await scanProject(root);
      return context.json(await analyzeScripts(root, scan.scripts));
    })
  );

  app.get(
    route('/activity'),
    withRoot(async (context, root) => {
      const days = Number(context.req.query('days'));
      return context.json(
        await gatherActivity(root, Number.isFinite(days) && days > 0 ? days : 90)
      );
    })
  );

  app.get(
    route('/deps/health'),
    withRoot(async (context, root) => {
      const scan = await scanProject(root);
      return context.json(await checkDepsHealth(root, scan.packageJson));
    })
  );

  app.get(
    route('/tests'),
    withRoot(async (context, root) => context.json(await analyzeTests(root)))
  );

  app.get(
    route('/configs'),
    withRoot(async (context, root) => context.json(await inspectConfigs(root)))
  );

  app.get(
    route('/bloat'),
    withRoot(async (context, root) => context.json(await findBloat(root)))
  );

  app.get(
    route('/links'),
    withRoot(async (context, root) => context.json(await checkLinks(root)))
  );

  app.get(
    route('/ci'),
    withRoot(async (context, root) => {
      const scan = await scanProject(root);
      return context.json(await analyzeCi(root, scan.scripts));
    })
  );

  app.get(
    route('/standup'),
    withRoot(async (context, root) => {
      const days = Number(context.req.query('days'));
      const mine = context.req.query('mine') === '1';
      return context.json(
        await buildStandup(root, {
          sinceDays: Number.isFinite(days) && days > 0 ? days : 1,
          mineOnly: mine
        })
      );
    })
  );

  app.get(
    route('/release-notes'),
    withRoot(async (context, root) => context.json(await buildChangelogReport(root)))
  );

  app.get(
    route('/readme'),
    withRoot(async (context, root) => context.json(await scoreReadme(root)))
  );

  app.get(
    route('/scorecard'),
    withRoot(async (context, root) => {
      const scan = await scanProject(root);
      return context.json(await buildScorecard(root, scan));
    })
  );
}
