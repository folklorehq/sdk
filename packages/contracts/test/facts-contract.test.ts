// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  FACT_EXCERPT_BATCH_MAX,
  FACT_EXCERPT_MAX_CHARS,
  factExcerptResponseSchema,
  factSummarySchema,
} from '../src/facts.js';
import { SNIPPET_MAX_CHARS } from '../src/search.js';

const FACT_ID = '11111111-1111-4111-8111-111111111111';
const SUMMARY = {
  id: FACT_ID,
  kind: 'content',
  sourceId: 'source-1',
  sourceKind: 'github',
  sourceFactId: null,
  occurredAt: '2026-01-02T12:00:00.000Z',
  ingestedAt: '2026-01-02T12:01:00.000Z',
} as const;

describe('fact excerpt contract', () => {
  it('pins the documented bounds', () => {
    expect(FACT_EXCERPT_MAX_CHARS).toBe(1_200);
    expect(FACT_EXCERPT_BATCH_MAX).toBe(50);
  });

  it('accepts an excerpt at the bound and rejects one character more', () => {
    const atBound = 'x'.repeat(FACT_EXCERPT_MAX_CHARS);

    expect(factExcerptResponseSchema.parse({ factId: FACT_ID, excerpt: atBound }).excerpt).toBe(
      atBound,
    );
    expect(
      factExcerptResponseSchema.safeParse({ factId: FACT_ID, excerpt: `${atBound}x` }).success,
    ).toBe(false);
  });

  it('rejects a non-uuid fact id and any extra field', () => {
    expect(factExcerptResponseSchema.safeParse({ factId: 'fact-1', excerpt: 'a' }).success).toBe(
      false,
    );
    expect(
      factExcerptResponseSchema.safeParse({ factId: FACT_ID, excerpt: 'a', body: 'b' }).success,
    ).toBe(false);
  });
});

describe('fact summary snippet', () => {
  it('is optional, and a row without one still parses', () => {
    expect(factSummarySchema.parse(SUMMARY)).not.toHaveProperty('snippet');
  });

  it('accepts a snippet at the bound and rejects one character more', () => {
    const atBound = 'x'.repeat(SNIPPET_MAX_CHARS);

    expect(factSummarySchema.parse({ ...SUMMARY, snippet: atBound }).snippet).toBe(atBound);
    expect(factSummarySchema.safeParse({ ...SUMMARY, snippet: `${atBound}x` }).success).toBe(false);
  });
});
