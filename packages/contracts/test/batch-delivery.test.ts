// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  synthesisRequestSchema,
  wikiSynthesisDeferredSchema,
  wikiSynthesisResultSchema,
} from '../src/enclave.js';

const REQUEST = {
  type: 'wiki_synthesis',
  requestId: 'r',
  themeId: 't',
  orgId: 'o',
  leaseToken: 'l',
  themeName: 'n',
  themeType: 'topic',
  parentThemeCount: 0,
  factRefs: [],
  relatedThemes: [],
  contributorCount: 0,
  audiences: [],
};

describe('batch delivery wire fields', () => {
  it('reads an absent delivery mode as absent and refuses an unknown one', () => {
    expect(synthesisRequestSchema.parse(REQUEST).deliveryMode).toBeUndefined();
    expect(synthesisRequestSchema.parse({ ...REQUEST, deliveryMode: 'batch' }).deliveryMode).toBe(
      'batch',
    );
    expect(synthesisRequestSchema.safeParse({ ...REQUEST, deliveryMode: 'bulk' }).success).toBe(
      false,
    );
  });
});

describe('discard batch wire field', () => {
  it('carries discardBatch only as true, and adds no key when it is absent', () => {
    expect(synthesisRequestSchema.parse({ ...REQUEST, discardBatch: true }).discardBatch).toBe(
      true,
    );
    expect('discardBatch' in synthesisRequestSchema.parse(REQUEST)).toBe(false);
    expect(synthesisRequestSchema.safeParse({ ...REQUEST, discardBatch: false }).success).toBe(
      false,
    );
  });
});

describe('refused batch results wire field', () => {
  const RESULT = {
    type: 'wiki_synthesis',
    requestId: 'r',
    themeId: 't',
    orgId: 'o',
    leaseToken: 'l',
    articles: [],
    blocks: [],
    citedFactIds: [],
    tokenUsage: [],
  };
  const DEFERRED = {
    type: 'wiki_synthesis_deferred',
    requestId: 'r',
    themeId: 't',
    orgId: 'o',
    leaseToken: 'l',
    reason: 'batch_pending',
    tokenUsage: [],
  };
  const schemas = [
    ['result', wikiSynthesisResultSchema, RESULT],
    ['deferral', wikiSynthesisDeferredSchema, DEFERRED],
  ] as const;

  it.each(schemas)('reads the count on a %s as a positive integer', (_name, schema, base) => {
    expect(schema.parse({ ...base, refusedBatchResults: 3 })).toMatchObject({
      refusedBatchResults: 3,
    });
    for (const refusedBatchResults of [0, -1, 1.5, '2'])
      expect(schema.safeParse({ ...base, refusedBatchResults }).success).toBe(false);
  });

  it.each(schemas)('reads a %s without the count as before', (_name, schema, base) => {
    const parsed = schema.parse(base);
    expect('refusedBatchResults' in parsed).toBe(false);
  });
});
