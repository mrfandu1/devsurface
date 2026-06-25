import { describe, expect, it } from 'vitest';
import { formatUpdateNotice, isNewerVersion } from '../src/cli/updateCheck.js';

describe('update check', () => {
  it('detects newer semantic versions', () => {
    expect(isNewerVersion('0.5.1', '0.5.0')).toBe(true);
    expect(isNewerVersion('0.5.1', '0.5.0')).toBe(true);
    expect(isNewerVersion('1.0.0', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.5.0', '0.5.0')).toBe(false);
    expect(isNewerVersion('0.4.9', '0.5.0')).toBe(false);
  });

  it('formats the user-facing update command', () => {
    const notice = formatUpdateNotice({
      currentVersion: '0.5.0',
      latestVersion: '0.5.1'
    });

    expect(notice).toContain('Update available: v0.5.1');
    expect(notice).toContain('Run: npx devsurface@latest');
  });
});
