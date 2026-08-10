// SPDX-License-Identifier: Apache-2.0
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  appHandoffExchangeInputSchema,
  appHandoffIssueInputSchema,
  appHandoffIssueResponseSchema,
} from '../src/app-handoff.js';

const OPAQUE_VALUE = 'a'.repeat(43);

describe('app handoff contracts', () => {
  it('accepts high-entropy-shaped nonce and code values', () => {
    expect(
      appHandoffIssueInputSchema.parse({ orgId: randomUUID(), nonce: OPAQUE_VALUE }),
    ).toBeTruthy();
    expect(
      appHandoffIssueResponseSchema.parse({
        code: OPAQUE_VALUE,
        callbackUrl: `https://acme.folklorehq.com/auth/callback#code=${OPAQUE_VALUE}`,
      }),
    ).toBeTruthy();
    expect(
      appHandoffExchangeInputSchema.parse({ code: OPAQUE_VALUE, nonce: OPAQUE_VALUE }),
    ).toBeTruthy();
  });

  it('rejects short or non-url-safe bearer values', () => {
    expect(
      appHandoffIssueInputSchema.safeParse({ orgId: randomUUID(), nonce: 'short' }).success,
    ).toBe(false);
    expect(
      appHandoffExchangeInputSchema.safeParse({ code: `${OPAQUE_VALUE}=`, nonce: OPAQUE_VALUE })
        .success,
    ).toBe(false);
  });
});
