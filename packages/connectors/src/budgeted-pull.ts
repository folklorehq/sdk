// SPDX-License-Identifier: Apache-2.0
export interface BudgetedTake<T> {
  readonly taken: readonly T[];
  readonly exhausted: boolean;
}

export interface BudgetedTakeOptions<T> {
  readonly resumeAtMs: number | null;
  /** 'free': items at or before the resume point are taken at no cost. 'skip': items before it are dropped; items at it are free. */
  readonly beforeResume: 'free' | 'skip';
  readonly budget: number;
  readonly atMs: (item: T) => number;
  readonly cost: (item: T) => number | Promise<number>;
}

const ORDER_VIOLATION = 'budgeted_pull_order_violation';

/** Items must arrive in non-decreasing atMs; once the budget is spent, the rest of that timestamp is still taken and the take stops at the next one. */
export async function takeOldestWithinBudget<T>(
  pages: AsyncIterable<readonly T[]> | Iterable<readonly T[]>,
  options: BudgetedTakeOptions<T>,
): Promise<BudgetedTake<T>> {
  const taken: T[] = [];
  let remaining = options.budget;
  let boundary: number | null = null;
  let last = Number.NEGATIVE_INFINITY;
  for await (const page of pages) {
    for (const item of page) {
      const at = options.atMs(item);
      if (at < last) throw new Error(ORDER_VIOLATION);
      last = at;
      if (boundary !== null && at !== boundary) return { taken, exhausted: false };
      const resume = options.resumeAtMs;
      if (resume !== null && at < resume && options.beforeResume === 'skip') continue;
      taken.push(item);
      if (resume === null || at > resume) remaining -= await options.cost(item);
      if (remaining <= 0) boundary ??= at;
    }
  }
  return { taken, exhausted: true };
}
