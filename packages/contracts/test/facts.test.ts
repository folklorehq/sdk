// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { FACT_SOURCE_KINDS, parseSourceKey } from '../src/connectors/index.js';
import { FACT_SNIPPETS_ENABLED, factListQuerySchema, factSourceKindSchema } from '../src/facts.js';

describe('facts contracts', () => {
  it('accepts every registered connector kind in fact queries', () => {
    const keys = FACT_SOURCE_KINDS.map((kind) =>
      parseSourceKey(kind) === null ? `${kind}_7` : kind,
    );
    expect(keys.map((sourceKind) => factListQuerySchema.parse({ sourceKind }).sourceKind)).toEqual(
      keys,
    );
    expect(factSourceKindSchema.safeParse('custom').success).toBe(false);
  });

  it('treats snippets as an opt-in flag that any value other than 1 leaves off', () => {
    expect(FACT_SNIPPETS_ENABLED).toBe('1');
    expect(factListQuerySchema.parse({}).snippets).toBeUndefined();
    expect(factListQuerySchema.parse({ snippets: '1' }).snippets).toBe(FACT_SNIPPETS_ENABLED);
    expect(factListQuerySchema.parse({ snippets: 'true' }).snippets).not.toBe(
      FACT_SNIPPETS_ENABLED,
    );
  });
});
