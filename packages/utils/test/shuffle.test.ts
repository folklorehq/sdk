// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { mulberry32, shuffle } from '../src/random.js';

const ITEMS = ['a', 'b', 'c', 'd', 'e', 'f'];
const SEED = 7;
const DRAWS = 1_000;
const FAIR_SPREAD = 1.5;

describe('shuffle', () => {
  it('returns a permutation of the input', () => {
    expect([...shuffle(ITEMS, mulberry32(SEED))].sort()).toEqual(ITEMS);
  });

  it('does not mutate the input', () => {
    const input = [...ITEMS];

    shuffle(input, mulberry32(SEED));

    expect(input).toEqual(ITEMS);
  });

  it('is deterministic for a seed', () => {
    expect(shuffle(ITEMS, mulberry32(SEED))).toEqual(shuffle(ITEMS, mulberry32(SEED)));
  });

  it('returns an empty list for no items', () => {
    expect(shuffle([], mulberry32(SEED))).toEqual([]);
  });

  it('puts every item first about equally often across seeds', () => {
    const firsts = new Map<string, number>();
    for (let seed = 0; seed < DRAWS; seed += 1) {
      const first = shuffle(ITEMS, mulberry32(seed))[0] ?? '';
      firsts.set(first, (firsts.get(first) ?? 0) + 1);
    }

    for (const item of ITEMS) {
      const share = (firsts.get(item) ?? 0) / DRAWS;
      expect(share).toBeGreaterThan(1 / ITEMS.length / FAIR_SPREAD);
      expect(share).toBeLessThan((1 / ITEMS.length) * FAIR_SPREAD);
    }
  });
});
