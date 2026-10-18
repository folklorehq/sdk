// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { takeOldestWithinBudget } from '../src/budgeted-pull.js';

interface Item {
  readonly id: string;
  readonly at: number;
  readonly cost: number;
}

const item = (id: string, at: number, cost = 1): Item => ({ id, at, cost });
const ids = (items: readonly Item[]): string[] => items.map((i) => i.id);

function take(
  pages: Iterable<readonly Item[]> | AsyncIterable<readonly Item[]>,
  overrides: Partial<Parameters<typeof takeOldestWithinBudget<Item>>[1]> = {},
) {
  return takeOldestWithinBudget(pages, {
    resumeAtMs: null,
    beforeResume: 'free',
    budget: Number.POSITIVE_INFINITY,
    atMs: (i) => i.at,
    cost: (i) => i.cost,
    ...overrides,
  });
}

describe('takeOldestWithinBudget', () => {
  it('takes nothing from no pages and reports exhausted', async () => {
    expect(await take([])).toEqual({ taken: [], exhausted: true });
  });

  it("takes items at or before the resume point at no cost when 'free'", async () => {
    const result = await take([[item('a', 1), item('b', 2), item('c', 3), item('d', 4)]], {
      resumeAtMs: 2,
      beforeResume: 'free',
      budget: 1,
    });

    expect(ids(result.taken)).toEqual(['a', 'b', 'c']);
    expect(result.exhausted).toBe(false);
  });

  it("drops items before the resume point and takes those at it free when 'skip'", async () => {
    const result = await take([[item('a', 1), item('b', 2), item('c', 3), item('d', 4)]], {
      resumeAtMs: 2,
      beforeResume: 'skip',
      budget: 1,
    });

    expect(ids(result.taken)).toEqual(['b', 'c']);
    expect(result.exhausted).toBe(false);
  });

  it('keeps every item of a timestamp group once the budget runs out inside it', async () => {
    const result = await take(
      [[item('a', 1), item('b', 1), item('c', 1), item('d', 2), item('e', 2)]],
      { budget: 2 },
    );

    expect(ids(result.taken)).toEqual(['a', 'b', 'c']);
    expect(result.exhausted).toBe(false);
  });

  it('stops at the first timestamp after the one that spent the budget', async () => {
    const result = await take([[item('a', 1, 2), item('b', 2, 2), item('c', 3)]], { budget: 3 });

    expect(ids(result.taken)).toEqual(['a', 'b']);
    expect(result.exhausted).toBe(false);
  });

  it('rejects items that arrive out of order', async () => {
    await expect(take([[item('a', 2), item('b', 1)]])).rejects.toThrow(
      'budgeted_pull_order_violation',
    );
  });

  it('takes everything under an infinite budget', async () => {
    const result = await take([[item('a', 1, 5)], [item('b', 2, 5)]], {
      budget: Number.POSITIVE_INFINITY,
    });

    expect(ids(result.taken)).toEqual(['a', 'b']);
    expect(result.exhausted).toBe(true);
  });

  it('awaits an async cost', async () => {
    const result = await take([[item('a', 1), item('b', 2), item('c', 3)]], {
      budget: 2,
      cost: async (i) => i.cost,
    });

    expect(ids(result.taken)).toEqual(['a', 'b']);
    expect(result.exhausted).toBe(false);
  });

  it('does not pull a page past the boundary', async () => {
    async function* pages(): AsyncGenerator<readonly Item[]> {
      yield [item('a', 1)];
      yield [item('b', 2)];
      throw new Error('third_page_pulled');
    }

    const result = await take(pages(), { budget: 1 });

    expect(ids(result.taken)).toEqual(['a']);
    expect(result.exhausted).toBe(false);
  });
});
