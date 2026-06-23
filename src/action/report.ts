import type { DoctorWarning, WarningSeverity } from '../core/types.js';

export type FailureThreshold = 'error' | 'warning' | 'never';

export interface CheckCounts {
  error: number;
  warning: number;
  info: number;
}

const SEVERITY_ORDER: WarningSeverity[] = ['error', 'warning', 'info'];

function stripControlCharacters(value: string): string {
  let result = '';
  for (const character of value) {
    const code = character.charCodeAt(0);
    if ((code > 31 && code < 127) || code > 159) {
      result += character;
    }
  }
  return result;
}

export function countChecks(checks: DoctorWarning[]): CheckCounts {
  return {
    error: checks.filter((item) => item.severity === 'error').length,
    warning: checks.filter((item) => item.severity === 'warning').length,
    info: checks.filter((item) => item.severity === 'info').length
  };
}

function escapeMarkdown(value: string): string {
  return stripControlCharacters(value)
    .replaceAll('\\', '\\\\')
    .replace(/([`*_[\]{}()#+!|<>])/g, '\\$1')
    .replaceAll('\r', '')
    .replaceAll('\n', ' ');
}

export function renderReport(projectName: string, checks: DoctorWarning[]): string {
  const counts = countChecks(checks);
  const lines = [
    '<!-- devsurface-health-check -->',
    `## DevSurface Health Check: ${escapeMarkdown(projectName)}`,
    '',
    `Errors: **${counts.error}** | Warnings: **${counts.warning}** | Info: **${counts.info}**`,
    ''
  ];

  if (checks.length === 0) {
    lines.push('No repository health issues found.');
    return `${lines.join('\n')}\n`;
  }

  lines.push('| Severity | Check | Details |', '| --- | --- | --- |');
  for (const severity of SEVERITY_ORDER) {
    for (const item of checks.filter((candidate) => candidate.severity === severity)) {
      lines.push(
        `| ${severity} | ${escapeMarkdown(item.title)} | ${escapeMarkdown(item.message)} |`
      );
    }
  }

  return `${lines.join('\n')}\n`;
}

export function parseFailureThreshold(value: string | undefined): FailureThreshold {
  const normalized = value?.trim().toLowerCase() || 'error';
  if (normalized === 'error' || normalized === 'warning' || normalized === 'never') {
    return normalized;
  }
  throw new Error(`fail-on must be one of: error, warning, never. Received: ${value}`);
}

export function shouldFail(checks: DoctorWarning[], threshold: FailureThreshold): boolean {
  if (threshold === 'never') {
    return false;
  }
  if (threshold === 'warning') {
    return checks.some((item) => item.severity === 'error' || item.severity === 'warning');
  }
  return checks.some((item) => item.severity === 'error');
}
