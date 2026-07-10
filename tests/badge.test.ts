import { describe, expect, it } from 'vitest';
import { readinessColor, renderReadinessBadge } from '../src/core/badge/index.js';

describe('readinessColor', () => {
  it('maps scores to the shields-style buckets', () => {
    expect(readinessColor(100)).toBe('#4c1');
    expect(readinessColor(90)).toBe('#4c1');
    expect(readinessColor(80)).toBe('#97ca00');
    expect(readinessColor(60)).toBe('#dfb317');
    expect(readinessColor(30)).toBe('#fe7d37');
    expect(readinessColor(10)).toBe('#e05d44');
  });
});

describe('renderReadinessBadge', () => {
  it('renders a valid SVG with the score text', () => {
    const svg = renderReadinessBadge(84);
    expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('84% ready');
    expect(svg).toContain('devsurface');
    expect(svg).toContain('#97ca00');
  });

  it('clamps out-of-range scores', () => {
    expect(renderReadinessBadge(250)).toContain('100% ready');
    expect(renderReadinessBadge(-5)).toContain('0% ready');
    expect(renderReadinessBadge(66.6)).toContain('67% ready');
  });
});
