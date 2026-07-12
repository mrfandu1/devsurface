import { promises as fs } from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { renderHelpBundle } from '../../core/bundle/index.js';
import { runDoctor } from '../../core/doctor/index.js';
import { RunHistoryStore } from '../../core/history/index.js';
import { checkSystem } from '../../core/system/index.js';
import { scanProject } from '../../core/scanner/index.js';
import { DEV_SURFACE_VERSION } from '../../version.js';

/**
 * `devsurface bundle` — write a single Markdown file with everything a
 * helper needs (summary, health, machine info, recent runs). Paste it into
 * a chat or issue when asking for help. Secrets never appear.
 */
export async function bundleCommand(
  cwd = process.cwd(),
  options: { out?: string } = {}
): Promise<void> {
  const scan = await scanProject(cwd);
  const [warnings, system, history] = await Promise.all([
    runDoctor(cwd, scan),
    checkSystem(scan),
    new RunHistoryStore().list(cwd)
  ]);

  const markdown = renderHelpBundle({
    scan,
    warnings,
    system,
    history,
    devsurfaceVersion: DEV_SURFACE_VERSION
  });

  const out = options.out ?? 'devsurface-help.md';
  if (out === '-') {
    console.log(markdown);
    return;
  }
  const target = path.resolve(cwd, out);
  await fs.writeFile(target, markdown, 'utf8');
  console.log(pc.green(`Help bundle written to ${out}`));
  console.log(
    'Send that file (or paste its contents) to whoever is helping you — it contains no secret values.'
  );
}
