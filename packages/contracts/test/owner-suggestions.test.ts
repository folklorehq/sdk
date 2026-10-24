// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  OWNER_SUGGESTION_MIN_AUTHORED_CITED_FACTS,
  OWNER_SUGGESTION_MIN_SHARE,
  ownerSuggestionSchema,
} from '../src/owner-suggestions.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';

const claimable = {
  state: 'claimable',
  userId: USER_ID,
  displayName: 'Ada',
  isViewer: false,
  canConfirm: true,
  canDismiss: true,
  authoredFacts: 4,
  authoredCitedFacts: 6,
} as const;

const needsLink = {
  state: 'needs_link',
  sourceKind: 'github',
  sourceLogin: 'ada',
  displayName: null,
  canDismiss: false,
  authoredFacts: 4,
  authoredCitedFacts: 6,
} as const;

describe('ownerSuggestionSchema', () => {
  it('parses none', () => {
    expect(ownerSuggestionSchema.parse({ state: 'none' })).toEqual({ state: 'none' });
  });

  it('parses claimable and needs_link', () => {
    expect(ownerSuggestionSchema.parse(claimable)).toEqual(claimable);
    expect(ownerSuggestionSchema.parse(needsLink)).toEqual(needsLink);
  });

  it('refuses an unknown key on every state', () => {
    for (const body of [{ state: 'none' }, claimable, needsLink]) {
      expect(ownerSuggestionSchema.safeParse({ ...body, extra: 1 }).success).toBe(false);
    }
  });

  it('refuses linkable, which the box decides', () => {
    expect(ownerSuggestionSchema.safeParse({ ...needsLink, linkable: true }).success).toBe(false);
  });

  it('refuses a user id on needs_link', () => {
    expect(ownerSuggestionSchema.safeParse({ ...needsLink, userId: USER_ID }).success).toBe(false);
  });

  it('refuses a zero cited count and a negative authored count', () => {
    expect(ownerSuggestionSchema.safeParse({ ...claimable, authoredCitedFacts: 0 }).success).toBe(
      false,
    );
    expect(ownerSuggestionSchema.safeParse({ ...claimable, authoredFacts: -1 }).success).toBe(
      false,
    );
  });

  it('refuses a non-uuid user id and an empty source kind', () => {
    expect(ownerSuggestionSchema.safeParse({ ...claimable, userId: 'u1' }).success).toBe(false);
    expect(ownerSuggestionSchema.safeParse({ ...needsLink, sourceKind: '' }).success).toBe(false);
  });

  it('exposes the thresholds the service applies', () => {
    expect(OWNER_SUGGESTION_MIN_AUTHORED_CITED_FACTS).toBe(5);
    expect(OWNER_SUGGESTION_MIN_SHARE).toBe(0.4);
  });
});
