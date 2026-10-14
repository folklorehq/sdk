// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { FACT_SNIPPETS_ENABLED, factListQuerySchema, factSourceKindSchema } from '../src/facts.js';

describe('facts contracts', () => {
  it('accepts every registered connector kind in fact queries', () => {
    const registeredKinds = [
      'github',
      'slack',
      'linear',
      'jira',
      'confluence',
      'notion',
      'intercom',
      'meeting',
      'email',
      'google_drive',
      'microsoft365',
      'zoom_bot',
      'zoom',
      'gmail',
      'microsoft365_mail',
      'google_calendar',
      'microsoft365_calendar',
      'code',
    ] as const;

    expect(factSourceKindSchema.options).toEqual(expect.arrayContaining(registeredKinds));
    for (const sourceKind of registeredKinds) {
      expect(factListQuerySchema.parse({ sourceKind }).sourceKind).toBe(sourceKind);
    }
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
