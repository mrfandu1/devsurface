import { describe, expect, it } from 'vitest';
import { escapeWorkflowProperty, escapeWorkflowValue } from '../src/action/runtime.js';
import { isDangerousCommand } from '../src/core/security/dangerousCommand.js';
import { safeDisplayText } from '../src/core/security/text.js';
import { isSafeHttpUrl } from '../src/core/security/url.js';
import { createMutationToken, hasValidMutationToken } from '../src/server/mutationToken.js';
import { isAllowedTerminalCommand } from '../src/server/terminal.js';

describe('security helpers', () => {
  it('accepts only http and https docs URLs', () => {
    expect(isSafeHttpUrl('https://docs.example.com')).toBe(true);
    expect(isSafeHttpUrl('http://localhost:3000/docs')).toBe(true);
    expect(isSafeHttpUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeHttpUrl('file:///etc/passwd')).toBe(false);
  });

  it('strips terminal escape sequences from display text', () => {
    const ESC = '\u001B';
    expect(safeDisplayText(`${ESC}[31mhello${ESC}[0m`)).toBe('hello');
    expect(safeDisplayText(`${ESC}]8;;https://evil.example${ESC}\\link${ESC}]8;;${ESC}\\`)).toBe(
      'link'
    );
  });

  it('escapes GitHub workflow annotation injection characters', () => {
    expect(escapeWorkflowValue('line1\nline2::warning title=%25')).toBe(
      'line1%0Aline2::warning title=%2525'
    );
    expect(escapeWorkflowProperty('src/app.ts:42,title')).toBe('src/app.ts%3A42%2Ctitle');
  });

  it('uses one shared dangerous-command heuristic', () => {
    expect(isDangerousCommand('docker volume rm data')).toBe(true);
    expect(isDangerousCommand('git clean -fdx')).toBe(true);
    expect(isDangerousCommand('npm run dev')).toBe(false);
    expect(isDangerousCommand('vite build')).toBe(false);
  });

  it('validates mutation tokens with a constant-time comparison', () => {
    const token = createMutationToken();
    expect(hasValidMutationToken(token, token)).toBe(true);
    expect(hasValidMutationToken(`${token}x`, token)).toBe(false);
    expect(hasValidMutationToken('', token)).toBe(false);
    expect(hasValidMutationToken(null, token)).toBe(false);
  });

  it('accepts safe terminal basenames only', () => {
    expect(isAllowedTerminalCommand('gnome-terminal')).toBe(true);
    expect(isAllowedTerminalCommand('x-terminal-emulator')).toBe(true);
    expect(isAllowedTerminalCommand('../../bin/sh')).toBe(false);
    expect(isAllowedTerminalCommand('evil;rm')).toBe(false);
    expect(isAllowedTerminalCommand('my term')).toBe(false);
  });
});
