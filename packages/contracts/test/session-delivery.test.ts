// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  sessionDeliveryConsumeSchema,
  sessionDeliveryResponseSchema,
} from '../src/session-delivery.js';

describe('session delivery contracts', () => {
  it('accepts bounded base64url delivery ids', () => {
    expect(sessionDeliveryConsumeSchema.parse({ delivery: 'a'.repeat(43) })).toEqual({
      delivery: 'a'.repeat(43),
    });
    expect(sessionDeliveryConsumeSchema.safeParse({ delivery: 'not a code' }).success).toBe(false);
  });

  it('rejects unknown response fields', () => {
    expect(
      sessionDeliveryResponseSchema.safeParse({ token: 'token', session: 'console' }).success,
    ).toBe(false);
  });
});
