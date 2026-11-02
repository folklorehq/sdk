// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { identitySuggestionSchema } from '../src/identity-suggestions.js';

const SUGGESTION = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'intercom',
  displayName: 'Alice Ng',
};

describe('identity suggestion DTO', () => {
  it('accepts exactly id, kind and displayName for an opted-in kind', () => {
    const parses = (value: unknown) => identitySuggestionSchema.safeParse(value).success;

    expect(parses(SUGGESTION)).toBe(true);
    expect(parses({ ...SUGGESTION, email: 'a@b.test' })).toBe(false);
    expect(parses({ ...SUGGESTION, kind: 'github' })).toBe(false);
  });
});
