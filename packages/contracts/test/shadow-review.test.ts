// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  SHADOW_ARMS,
  shadowNextResponseSchema,
  shadowReviewQuerySchema,
  shadowVerdictSchema,
} from '../src/shadow-review.js';
import { wikiPageResponseSchema } from '../src/wiki.js';

const VARIANT_ID = '11111111-1111-4111-8111-111111111111';
const VERDICT = {
  accuracy: 'left',
  coverage: 'right',
  clarity: 'tie',
  citations: 'left',
  falseLeft: false,
  falseRight: true,
} as const;

describe('shadow review wire schemas', () => {
  it('accepts a verdict of enums and booleans only', () => {
    expect(shadowVerdictSchema.parse(VERDICT)).toEqual(VERDICT);
  });

  it('rejects an extra key, a missing key, and a free-text value', () => {
    expect(shadowVerdictSchema.safeParse({ ...VERDICT, note: 'prose' }).success).toBe(false);
    const { clarity: _clarity, ...missing } = VERDICT;
    expect(shadowVerdictSchema.safeParse(missing).success).toBe(false);
    expect(shadowVerdictSchema.safeParse({ ...VERDICT, accuracy: 'better' }).success).toBe(false);
  });

  it('allows only the two shadow arms in the query', () => {
    expect(SHADOW_ARMS).toEqual(['R', 'B']);
    expect(shadowReviewQuerySchema.parse({ arm: 'B' })).toEqual({ arm: 'B' });
    expect(shadowReviewQuerySchema.safeParse({ arm: 'D' }).success).toBe(false);
    expect(shadowReviewQuerySchema.safeParse({}).success).toBe(false);
  });

  it('parses a pair or the done marker and nothing else', () => {
    const pair = {
      variantId: VARIANT_ID,
      arm: 'R',
      left: { body: 'left prose' },
      right: { body: 'right prose' },
    };
    expect(shadowNextResponseSchema.parse(pair)).toEqual(pair);
    expect(shadowNextResponseSchema.parse({ done: true })).toEqual({ done: true });
    expect(shadowNextResponseSchema.safeParse({ ...pair, production: 'left' }).success).toBe(false);
    expect(shadowNextResponseSchema.safeParse({ done: false }).success).toBe(false);
  });
});

describe('wiki page updatesQueued', () => {
  const page = {
    themeId: 'theme-1',
    pageId: 'page-1',
    publicationId: null,
    revision: null,
    title: 'Status',
    blocks: [],
    meta: null,
  };

  it('defaults to false for a response that predates the field', () => {
    expect(wikiPageResponseSchema.parse(page).updatesQueued).toBe(false);
  });

  it('carries true through and rejects a non-boolean', () => {
    expect(wikiPageResponseSchema.parse({ ...page, updatesQueued: true }).updatesQueued).toBe(true);
    expect(wikiPageResponseSchema.safeParse({ ...page, updatesQueued: 'yes' }).success).toBe(false);
  });
});
