// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import {
  LinearRateLimitedError,
  LinearRequestError,
  type LinearWindow,
} from '../src/linear/client.js';
import { FRESH_LINEAR_STREAM, type LinearStreamPosition } from '../src/linear/pull-cursor.js';
import { readLinearStream, SLICE_SAFETY_LAG_MS } from '../src/linear/stream-reader.js';
import type { LinearEmitBounds } from '../src/linear/normalize.js';
import type { LinearPage } from '../src/linear/types.js';

interface Node {
  readonly id: string;
}

const FLOOR = 1_000;
const STARTED_AT = 1_000_000;
const SLICE_END = STARTED_AT - SLICE_SAFETY_LAG_MS;
const PAGE_SIZE = 3;

function nodes(count: number): Node[] {
  return Array.from({ length: count }, (_, index) => ({ id: `n${index}` }));
}

function pagedFetch(all: readonly Node[], pageSize = PAGE_SIZE) {
  return vi.fn(async (_window: LinearWindow, after: string | null): Promise<LinearPage<Node>> => {
    const start = after === null ? 0 : Number(after);
    const end = Math.min(start + pageSize, all.length);
    return {
      nodes: all.slice(start, end),
      pageInfo: { hasNextPage: end < all.length, endCursor: String(end) },
    };
  });
}

function emitOne(seen: string[] = [], bounds: LinearEmitBounds[] = []) {
  return vi.fn(async (node: Node, b: LinearEmitBounds) => {
    seen.push(node.id);
    bounds.push(b);
    return 1;
  });
}

function read(overrides: Partial<Parameters<typeof readLinearStream<Node>>[0]> = {}) {
  return readLinearStream<Node>({
    fetchPage: pagedFetch(nodes(5)),
    position: FRESH_LINEAR_STREAM,
    floorMs: FLOOR,
    startedAtMs: STARTED_AT,
    budget: Number.POSITIVE_INFINITY,
    guard: () => false,
    emit: emitOne(),
    collectedBefore: 0,
    discardCollected: vi.fn(),
    ...overrides,
  });
}

describe('readLinearStream window', () => {
  it('holds the slice end back by the safety lag so late-indexed items are read next time', async () => {
    const fetchPage = pagedFetch(nodes(1));

    await read({ fetchPage });

    expect(SLICE_SAFETY_LAG_MS).toBe(120_000);
    expect(fetchPage.mock.calls[0]?.[0].lteMs).toBe(STARTED_AT - SLICE_SAFETY_LAG_MS);
  });

  it('is caught up without a request when the watermark is inside the lag', async () => {
    const fetchPage = pagedFetch(nodes(2));
    const position = { wm: STARTED_AT - SLICE_SAFETY_LAG_MS + 1, emitAfter: null, slice: null };

    const result = await read({ fetchPage, position });

    expect(result).toEqual({ position, spent: 0, stop: 'caught_up' });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('opens a slice from just under the floor to the start time minus the safety lag', async () => {
    const fetchPage = pagedFetch(nodes(2));

    await read({ fetchPage });

    expect(fetchPage).toHaveBeenCalledWith({ gtMs: FLOOR - 1, lteMs: SLICE_END }, null);
  });

  it('is caught up when the watermark has reached the start time', async () => {
    const fetchPage = pagedFetch(nodes(2));
    const position = { wm: SLICE_END, emitAfter: 5_000, slice: null };

    const result = await read({ fetchPage, position });

    expect(result).toEqual({ position, spent: 0, stop: 'caught_up' });
    expect(fetchPage).not.toHaveBeenCalled();
  });

  it('completes by moving the watermark to the slice end and keeping the old lower bound', async () => {
    const result = await read();

    expect(result.stop).toBe('caught_up');
    expect(result.spent).toBe(5);
    expect(result.position).toEqual({ wm: SLICE_END, emitAfter: FLOOR - 1, slice: null });
  });

  it('emits against the previous slice lower bound on the next slice', async () => {
    const bounds: LinearEmitBounds[] = [];
    const position: LinearStreamPosition = { wm: 4_000, emitAfter: 2_000, slice: null };
    const fetchPage = pagedFetch(nodes(1));

    const result = await read({ fetchPage, position, emit: emitOne([], bounds) });

    expect(fetchPage).toHaveBeenCalledWith({ gtMs: 4_000, lteMs: SLICE_END }, null);
    expect(bounds).toEqual([{ emitAfterMs: 2_000, floorMs: FLOOR }]);
    expect(result.position).toEqual({ wm: SLICE_END, emitAfter: 4_000, slice: null });
  });
});

describe('readLinearStream budget', () => {
  it('stops mid-page after the node that spends the budget and remembers it', async () => {
    const result = await read({ budget: 2 });

    expect(result.stop).toBe('budget');
    expect(result.spent).toBe(2);
    expect(result.position.slice).toEqual({ untilMs: SLICE_END, after: null, lastId: 'n1' });
  });

  it('resumes by re-fetching the page and skipping through the last node taken', async () => {
    const seen: string[] = [];
    const position: LinearStreamPosition = {
      wm: null,
      emitAfter: null,
      slice: { untilMs: SLICE_END, after: null, lastId: 'n1' },
    };

    const result = await read({ position, emit: emitOne(seen) });

    expect(seen).toEqual(['n2', 'n3', 'n4']);
    expect(result.stop).toBe('caught_up');
  });

  it('takes the page from the start when the last node is gone', async () => {
    const seen: string[] = [];
    const position: LinearStreamPosition = {
      wm: null,
      emitAfter: null,
      slice: { untilMs: SLICE_END, after: null, lastId: 'vanished' },
    };

    await read({ position, emit: emitOne(seen) });

    expect(seen).toEqual(['n0', 'n1', 'n2', 'n3', 'n4']);
  });

  it('stores the end cursor when the budget runs out on the last node of a page with more after it', async () => {
    const result = await read({ budget: PAGE_SIZE });

    expect(result.stop).toBe('budget');
    expect(result.position.slice).toEqual({
      untilMs: SLICE_END,
      after: String(PAGE_SIZE),
      lastId: null,
    });
  });

  it('completes the slice when the budget runs out on the very last node', async () => {
    const result = await read({ budget: 5 });

    expect(result.stop).toBe('budget');
    expect(result.position).toEqual({ wm: SLICE_END, emitAfter: FLOOR - 1, slice: null });
  });

  it('drains a busy window of identical timestamps in budget-sized calls', async () => {
    const all = nodes(2_000);
    const fetchPage = pagedFetch(all, 100);
    const seen = new Set<string>();
    let position: LinearStreamPosition = FRESH_LINEAR_STREAM;
    let calls = 0;

    while (position.wm === null) {
      const result = await read({
        fetchPage,
        position,
        budget: 250,
        emit: vi.fn(async (node: Node) => {
          seen.add(node.id);
          return 1;
        }),
      });
      position = result.position;
      calls += 1;
      expect(result.spent).toBeGreaterThan(0);
    }

    expect(seen.size).toBe(2_000);
    expect(calls).toBe(8);
    expect(position.slice).toBeNull();
  });
});

describe('readLinearStream guard and rate limits', () => {
  it('stops before a request when the guard trips and keeps the page to fetch next', async () => {
    const fetchPage = pagedFetch(nodes(9));
    let calls = 0;
    const guard = () => calls++ > 0;

    const result = await read({ fetchPage, guard });

    expect(result.stop).toBe('guard');
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(result.position.slice).toEqual({
      untilMs: SLICE_END,
      after: String(PAGE_SIZE),
      lastId: null,
    });
  });

  it('returns the unchanged position when rate limited after progress', async () => {
    const fetchPage = vi.fn(
      async (): Promise<LinearPage<Node>> => Promise.reject(new LinearRateLimitedError()),
    );

    const result = await read({ fetchPage, collectedBefore: 4 });

    expect(result).toEqual({ position: FRESH_LINEAR_STREAM, spent: 0, stop: 'rate_limited' });
  });

  it('returns the unchanged position when rate limited after this stream emitted', async () => {
    const inner = pagedFetch(nodes(9));
    const fetchPage = vi.fn(async (window: LinearWindow, after: string | null) => {
      if (after !== null) throw new LinearRateLimitedError();
      return inner(window, after);
    });

    const result = await read({ fetchPage });

    expect(result.stop).toBe('rate_limited');
    expect(result.spent).toBe(PAGE_SIZE);
    expect(result.position).toEqual(FRESH_LINEAR_STREAM);
  });

  it('throws when rate limited before any fact was collected', async () => {
    const fetchPage = vi.fn(async () => Promise.reject(new LinearRateLimitedError()));

    await expect(read({ fetchPage })).rejects.toBeInstanceOf(LinearRateLimitedError);
  });

  it('rethrows a request failure that is not a stale cursor', async () => {
    const fetchPage = vi.fn(async () =>
      Promise.reject(new LinearRequestError('linear_unauthorized', 401)),
    );

    await expect(read({ fetchPage })).rejects.toBeInstanceOf(LinearRequestError);
  });
});

describe('readLinearStream stale cursor', () => {
  const position: LinearStreamPosition = {
    wm: null,
    emitAfter: null,
    slice: { untilMs: SLICE_END, after: 'stale', lastId: 'n1' },
  };

  it('resets the slice cursor once and then succeeds', async () => {
    const inner = pagedFetch(nodes(2));
    const fetchPage = vi.fn(async (window: LinearWindow, after: string | null) => {
      if (after === 'stale') throw new LinearRequestError('linear_cursor_invalid');
      return inner(window, after);
    });
    const seen: string[] = [];

    const result = await read({ fetchPage, position, emit: emitOne(seen) });

    expect(seen).toEqual(['n0', 'n1']);
    expect(result.stop).toBe('caught_up');
  });

  it('discards what the stream collected and restarts its spend on a reset', async () => {
    const all = nodes(6);
    const inner = pagedFetch(all);
    let failedOnce = false;
    const fetchPage = vi.fn(async (window: LinearWindow, after: string | null) => {
      if (after === '3' && !failedOnce) {
        failedOnce = true;
        throw new LinearRequestError('linear_cursor_invalid');
      }
      return inner(window, after);
    });
    const kept: string[] = [];
    const discardCollected = vi.fn(() => kept.splice(0));

    const result = await read({
      fetchPage,
      discardCollected,
      emit: vi.fn(async (node: Node) => {
        kept.push(node.id);
        return 1;
      }),
    });

    expect(discardCollected).toHaveBeenCalledTimes(1);
    expect(kept).toEqual(all.map((node) => node.id));
    expect(result.spent).toBe(all.length);
    expect(result.stop).toBe('caught_up');
  });

  it('does not reset on a graphql error that is not a stale cursor', async () => {
    const discardCollected = vi.fn();
    const fetchPage = vi.fn(async () =>
      Promise.reject(new LinearRequestError('linear_graphql_error')),
    );

    await expect(read({ fetchPage, position, discardCollected })).rejects.toBeInstanceOf(
      LinearRequestError,
    );
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(discardCollected).not.toHaveBeenCalled();
  });

  it('throws when the failure repeats after the reset', async () => {
    const fetchPage = vi.fn(async () =>
      Promise.reject(new LinearRequestError('linear_cursor_invalid')),
    );

    await expect(read({ fetchPage, position })).rejects.toBeInstanceOf(LinearRequestError);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('does not retry a failure on the first page', async () => {
    const fetchPage = vi.fn(async () =>
      Promise.reject(new LinearRequestError('linear_cursor_invalid')),
    );

    await expect(read({ fetchPage })).rejects.toBeInstanceOf(LinearRequestError);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it('does not reset when the stale-cursor error comes from emit instead of the page fetch', async () => {
    const discardCollected = vi.fn();
    const fetchPage = vi.fn(
      async (): Promise<LinearPage<Node>> => ({
        nodes: nodes(2),
        pageInfo: { hasNextPage: false, endCursor: null },
      }),
    );
    const emit = vi.fn(async () => Promise.reject(new LinearRequestError('linear_cursor_invalid')));

    const fresh: LinearStreamPosition = {
      ...position,
      slice: { untilMs: SLICE_END, after: 'stale', lastId: null },
    };

    await expect(
      read({ fetchPage, position: fresh, emit, discardCollected }),
    ).rejects.toBeInstanceOf(LinearRequestError);
    expect(fetchPage).toHaveBeenCalledTimes(1);
    expect(discardCollected).not.toHaveBeenCalled();
  });
});
