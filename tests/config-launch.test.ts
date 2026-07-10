import { describe, expect, it } from 'vitest';
import { validateConfig } from '../src/core/config/load.js';

describe('config launch + unknown keys', () => {
  it('accepts a valid launch array', () => {
    const { config, warnings } = validateConfig({ launch: ['docker', 'dev'] });
    expect(config.launch).toEqual(['docker', 'dev']);
    expect(warnings).toEqual([]);
  });

  it('rejects non-string launch entries', () => {
    const { config, warnings } = validateConfig({ launch: ['dev', 42] });
    expect(config.launch).toBeUndefined();
    expect(warnings.some((warning) => warning.includes('launch'))).toBe(true);
  });

  it('caps overly long launch sequences', () => {
    const { config, warnings } = validateConfig({
      launch: Array.from({ length: 15 }, (_, index) => `step-${index}`)
    });
    expect(config.launch).toHaveLength(10);
    expect(warnings.some((warning) => warning.includes('at most'))).toBe(true);
  });

  it('warns about unknown top-level keys but tolerates $schema', () => {
    const { warnings } = validateConfig({ $schema: 'x', name: 'ok', tpyo: true });
    expect(warnings.some((warning) => warning.includes('"tpyo"'))).toBe(true);
    expect(warnings.some((warning) => warning.includes('$schema'))).toBe(false);
  });
});
