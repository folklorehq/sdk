// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  ASK_MEMBER_SURFACES,
  ASK_USAGE_SURFACES,
  askUsageSubjectSchema,
  askUsageSurfaceSchema,
} from '../src/ask-allowance.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';

describe('ask usage surfaces', () => {
  it('lists the member surfaces, then page rewrite for totals and reads', () => {
    expect([...ASK_MEMBER_SURFACES]).toEqual(['ask', 'agent']);
    expect([...ASK_USAGE_SURFACES]).toEqual(['ask', 'agent', 'page_rewrite']);
  });

  it('reads a stored page_rewrite surface', () => {
    expect(askUsageSurfaceSchema.parse('page_rewrite')).toBe('page_rewrite');
  });

  it.each(['ask', 'agent'])('accepts a full subject with the %s surface', (surface) => {
    expect(askUsageSubjectSchema.parse({ orgId: ORG, userId: USER, surface })).toEqual({
      orgId: ORG,
      userId: USER,
      surface,
    });
  });

  it('refuses a full subject with the page_rewrite surface, so no per-person page row exists', () => {
    expect(
      askUsageSubjectSchema.safeParse({ orgId: ORG, userId: USER, surface: 'page_rewrite' })
        .success,
    ).toBe(false);
  });
});
