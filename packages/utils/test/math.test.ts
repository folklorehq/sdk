// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { clamp01, cosine, jaccard, mean, median } from '../src/math.js';

describe('clamp01', () => {
  it('clamps below 0, above 1, and passes through in-range', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(1.5)).toBe(1);
    expect(clamp01(0.42)).toBe(0.42);
  });
});

describe('cosine', () => {
  it('returns 1 for identical non-zero vectors', () => {
    expect(cosine([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });

  it('returns 0 for orthogonal, zero-magnitude, empty, and unequal-length inputs', () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 10);
    expect(cosine([0, 0, 0], [1, 2, 3])).toBe(0);
    expect(cosine([], [])).toBe(0);
    expect(cosine([1, 2], [1, 2, 3])).toBe(0);
  });

  it('computes a known value: [1,0,0] vs [1,1,0] = 1/sqrt(2)', () => {
    expect(cosine([1, 0, 0], [1, 1, 0])).toBeCloseTo(1 / Math.sqrt(2), 8);
  });
});

describe('median', () => {
  it('returns the middle element for odd counts', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middle elements for even counts', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('ignores non-finite values and returns 0 when empty', () => {
    expect(median([])).toBe(0);
    expect(median([NaN, 5, Infinity])).toBe(5);
  });
});

describe('mean', () => {
  it('averages the values and returns 0 when empty', () => {
    expect(mean([2, 4, 9])).toBe(5);
    expect(mean([])).toBe(0);
  });
});

describe('jaccard', () => {
  it('returns 0 for empty or disjoint sets and 1 for identical sets', () => {
    expect(jaccard([], [])).toBe(0);
    expect(jaccard(['a', 'b'], ['c', 'd'])).toBe(0);
    expect(jaccard(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
  });

  it('treats inputs as sets and computes intersection over union', () => {
    expect(jaccard(['a', 'a', 'b'], ['b', 'c'])).toBeCloseTo(1 / 3, 8);
  });
});
