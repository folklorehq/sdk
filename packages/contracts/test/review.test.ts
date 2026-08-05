// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { reviewQueueItemSchema } from '../src/review.js';

const BASE = {
  scoreId: 'score-1',
  factId: 'fact-1',
  containerId: 'cont-1',
  composite: 0.7,
  signals: { threadIdMatch: 1 },
  confidence: 'low',
  scoredAt: '2024-01-01T00:00:00.000Z',
  fact: { kind: 'content', occurredAt: '2024-01-01T00:00:00.000Z', sourceKind: 'github' },
  container: { label: 'Billing', shape: 'theme' },
};

describe('reviewQueueItemSchema', () => {
  it('round-trips an item without a snippet', () => {
    expect(reviewQueueItemSchema.parse(BASE).snippet).toBeUndefined();
  });

  it('round-trips an item with a snippet', () => {
    expect(reviewQueueItemSchema.parse({ ...BASE, snippet: 'preview text' }).snippet).toBe(
      'preview text',
    );
  });

  it('accepts a snippet of exactly 280 characters', () => {
    expect(reviewQueueItemSchema.parse({ ...BASE, snippet: 'x'.repeat(280) }).snippet).toHaveLength(
      280,
    );
  });

  it('rejects a snippet longer than 280 characters', () => {
    expect(() => reviewQueueItemSchema.parse({ ...BASE, snippet: 'x'.repeat(281) })).toThrow();
  });

  it('keeps unknown keys non-fatal (non-strict schema)', () => {
    expect(() => reviewQueueItemSchema.parse({ ...BASE, futureKey: 1 })).not.toThrow();
  });
});
