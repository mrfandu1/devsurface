import { describe, expect, it } from 'vitest';
import { bucketCommitDates, computeStreaks } from '../src/core/git/activity.js';

describe('bucketCommitDates', () => {
  it('buckets ISO dates by weekday and hour', () => {
    // 2024-01-01 is a Monday.
    const { byWeekday, byHour, days } = bucketCommitDates([
      '2024-01-01T09:30:00Z',
      '2024-01-01T14:00:00Z',
      '2024-01-02T10:00:00Z'
    ]);
    expect(byWeekday.reduce((a, b) => a + b, 0)).toBe(3);
    expect(byHour.reduce((a, b) => a + b, 0)).toBe(3);
    expect(days.has('2024-01-01')).toBe(true);
    expect(days.size).toBe(2);
  });

  it('ignores unparseable lines', () => {
    const { days } = bucketCommitDates(['not-a-date', '']);
    expect(days.size).toBe(0);
  });
});

describe('computeStreaks', () => {
  it('finds the longest consecutive run', () => {
    const days = new Set(['2024-01-01', '2024-01-02', '2024-01-03', '2024-01-10']);
    const { longest } = computeStreaks(days);
    expect(longest).toBe(3);
  });

  it('returns zero for an empty set', () => {
    expect(computeStreaks(new Set())).toEqual({ longest: 0, current: 0 });
  });

  it('counts a current streak ending today', () => {
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const { current } = computeStreaks(new Set([yesterday, today]));
    expect(current).toBe(2);
  });
});
