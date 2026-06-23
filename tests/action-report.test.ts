import { describe, expect, it } from 'vitest';
import {
  countChecks,
  parseFailureThreshold,
  renderReport,
  shouldFail
} from '../src/action/report.js';
import type { DoctorWarning } from '../src/core/types.js';

const checks: DoctorWarning[] = [
  {
    id: 'broken',
    severity: 'error',
    title: 'Broken | project',
    message: 'package.json is missing'
  },
  {
    id: 'warning',
    severity: 'warning',
    title: 'Missing tests',
    message: 'No test script'
  },
  {
    id: 'info',
    severity: 'info',
    title: 'Ports',
    message: 'Port 3000 is undocumented'
  }
];

describe('action report', () => {
  it('renders a stable Markdown report and escapes table separators', () => {
    const report = renderReport('demo | <project>', checks);

    expect(report).toContain('<!-- devsurface-health-check -->');
    expect(report).toContain('DevSurface Health Check: demo \\| \\<project\\>');
    expect(report).toContain('| error | Broken \\| project | package.json is missing |');
    expect(report).toContain('Errors: **1** | Warnings: **1** | Info: **1**');
  });

  it('counts checks and applies failure thresholds', () => {
    expect(countChecks(checks)).toEqual({ error: 1, warning: 1, info: 1 });
    expect(shouldFail(checks, 'error')).toBe(true);
    expect(
      shouldFail(
        checks.filter((item) => item.severity !== 'error'),
        'error'
      )
    ).toBe(false);
    expect(shouldFail(checks, 'warning')).toBe(true);
    expect(shouldFail(checks, 'never')).toBe(false);
  });

  it('validates failure threshold inputs', () => {
    expect(parseFailureThreshold(undefined)).toBe('error');
    expect(parseFailureThreshold('WARNING')).toBe('warning');
    expect(() => parseFailureThreshold('info')).toThrow(/error, warning, never/);
  });
});
