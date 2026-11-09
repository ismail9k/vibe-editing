import { describe, it, expect } from 'vitest';
import { spring, sp, rng, typed, track } from '../../src/core/motion';

describe('motion', () => {
  it('springs start at 0 and settle at 1', () => {
    expect(spring(0)).toBe(0);
    expect(spring(2)).toBeCloseTo(1, 2);
  });

  it('never overshoots on the heavy spring', () => {
    for (let t = 0; t <= 3; t += 0.01) expect(sp(t, 'heavy')).toBeLessThanOrEqual(1.0005);
  });

  it('overshoots visibly on the playful spring', () => {
    let max = 0;
    for (let t = 0; t <= 2; t += 0.01) max = Math.max(max, sp(t, 'playful'));
    expect(max).toBeGreaterThan(1.05);
  });

  it('gives the same sequence for the same seed', () => {
    const a = rng(7), b = rng(7);
    const xs = Array.from({ length: 5 }, () => a()), ys = Array.from({ length: 5 }, () => b());
    expect(xs).toEqual(ys);
    expect(new Set(xs).size).toBe(5);
  });

  it('types characters at the given rate', () => {
    expect(typed('abc', 0.1, 20)).toBe('ab');
    expect(typed('abc', 10, 20)).toBe('abc');
  });

  it('tracks a value through several targets', () => {
    expect(track(10, [[0, 0], [1, 100], [2, 50]])).toBeCloseTo(50, 1);
  });
});
