import { promises as fs } from 'node:fs';
import path from 'node:path';
import { runRepositoryChecks } from '../core/check/index.js';
import type { DoctorWarning } from '../core/types.js';
import { upsertPullRequestComment } from './github.js';
import { countChecks, parseFailureThreshold, renderReport, shouldFail } from './report.js';

function input(name: string, fallback = ''): string {
  return process.env[`INPUT_${name.toUpperCase().replaceAll('-', '_')}`]?.trim() || fallback;
}

function booleanInput(name: string, fallback: boolean): boolean {
  const value = input(name);
  if (!value) {
    return fallback;
  }
  if (value === 'true') {
    return true;
  }
  if (value === 'false') {
    return false;
  }
  throw new Error(`${name} must be true or false.`);
}

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

export async function resolveActionRoot(workspace: string, requestedPath: string): Promise<string> {
  const resolvedWorkspace = path.resolve(workspace);
  const resolvedRoot = path.resolve(resolvedWorkspace, requestedPath);
  if (!isWithinRoot(resolvedWorkspace, resolvedRoot)) {
    throw new Error('path must resolve inside GITHUB_WORKSPACE.');
  }

  const [realWorkspace, realRoot] = await Promise.all([
    fs.realpath(resolvedWorkspace),
    fs.realpath(resolvedRoot)
  ]);
  if (!isWithinRoot(realWorkspace, realRoot)) {
    throw new Error('path must resolve inside GITHUB_WORKSPACE.');
  }
  return realRoot;
}

function escapeWorkflowValue(value: string): string {
  return value.replaceAll('%', '%25').replaceAll('\r', '%0D').replaceAll('\n', '%0A');
}

function escapeWorkflowProperty(value: string): string {
  return escapeWorkflowValue(value).replaceAll(':', '%3A').replaceAll(',', '%2C');
}

export { escapeWorkflowProperty, escapeWorkflowValue };

function emitAnnotations(checks: DoctorWarning[]): void {
  for (const item of checks) {
    const command = item.severity === 'info' ? 'notice' : item.severity;
    const properties = [
      item.target ? `file=${escapeWorkflowProperty(item.target)}` : null,
      `title=${escapeWorkflowProperty(item.title)}`
    ].filter(Boolean);
    console.log(`::${command} ${properties.join(',')}::${escapeWorkflowValue(item.message)}`);
  }
}

async function appendFileIfConfigured(
  filePath: string | undefined,
  content: string
): Promise<void> {
  if (filePath) {
    await fs.appendFile(filePath, content, 'utf8');
  }
}

async function writeOutput(name: string, value: string): Promise<void> {
  const outputPath = process.env.GITHUB_OUTPUT;
  if (outputPath) {
    await fs.appendFile(outputPath, `${name}=${value}\n`, 'utf8');
  }
}

export async function runAction(): Promise<void> {
  const workspace = process.env.GITHUB_WORKSPACE ?? process.cwd();
  const requestedPath = input('path', '.');
  const root = await resolveActionRoot(workspace, requestedPath);
  const threshold = parseFailureThreshold(input('fail-on', 'error'));
  const comment = booleanInput('comment', true);
  const result = await runRepositoryChecks(root);
  const report = renderReport(result.projectName, result.checks);
  const counts = countChecks(result.checks);

  emitAnnotations(result.checks);
  await appendFileIfConfigured(process.env.GITHUB_STEP_SUMMARY, report);
  await writeOutput('errors', String(counts.error));
  await writeOutput('warnings', String(counts.warning));
  await writeOutput('info', String(counts.info));
  await writeOutput('outcome', result.checks.length === 0 ? 'healthy' : 'issues-found');

  if (comment) {
    const commentResult = await upsertPullRequestComment({
      token: input('github-token'),
      repository: process.env.GITHUB_REPOSITORY ?? '',
      eventPath: process.env.GITHUB_EVENT_PATH ?? '',
      body: report
    }).catch((error: unknown) => {
      console.log(
        `DevSurface could not update the pull request comment: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      return 'skipped' as const;
    });
    if (commentResult === 'forbidden') {
      console.log(
        'DevSurface could not comment because this workflow has a read-only token. Annotations and the job summary are still available.'
      );
    }
  }

  if (shouldFail(result.checks, threshold)) {
    process.exitCode = 1;
    console.error(`DevSurface repository checks failed at the ${threshold} threshold.`);
  }
}
