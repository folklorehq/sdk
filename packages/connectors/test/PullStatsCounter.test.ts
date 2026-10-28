// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PullStatsCounter } from '../src/PullStatsCounter.js';

describe('PullStatsCounter', () => {
  it('starts at zero with no body figures', () => {
    expect(new PullStatsCounter().snapshot()).toEqual({
      listed: 0,
      emitted: 0,
      apiCalls: 0,
      listingRestarts: 0,
      skipped: {},
    });
  });

  it('counts listed, emitted, calls, restarts and skips by reason', () => {
    const counter = new PullStatsCounter();
    counter.listedItem(3);
    counter.emittedItem(2);
    counter.apiCall(4);
    counter.listingRestarted();
    counter.skip('archived');
    counter.skip('archived');
    counter.skip('budget_deferred');

    expect(counter.snapshot()).toEqual({
      listed: 3,
      emitted: 2,
      apiCalls: 4,
      listingRestarts: 1,
      skipped: { archived: 2, budget_deferred: 1 },
    });
  });

  it('rounds the body character total up to a multiple of 10,000 and counts truncations', () => {
    const counter = new PullStatsCounter();
    counter.bodyMeasured(4_000, false);
    counter.bodyMeasured(7_001, true);

    expect(counter.snapshot()).toMatchObject({ bodyCharsBucket: 20_000, truncatedBodies: 1 });
  });
});
