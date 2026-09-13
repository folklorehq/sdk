// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { sourceActivationReadinessResponseSchema } from '../src/sources.js';

describe('sourceActivationReadinessResponseSchema', () => {
  it('accepts only the strict public projection', () => {
    expect(
      sourceActivationReadinessResponseSchema.parse({
        orgId: '00000000-0000-0000-0000-000000000001',
        ready: true,
      }),
    ).toEqual({ orgId: '00000000-0000-0000-0000-000000000001', ready: true });
    expect(() =>
      sourceActivationReadinessResponseSchema.parse({
        orgId: '00000000-0000-0000-0000-000000000001',
        ready: true,
        deploymentId: 'secret',
      }),
    ).toThrow();
  });
});
