// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  PROVISIONING_PROGRESS_BLOCKERS,
  PROVISIONING_STEPS,
  provisioningProgressBlockerSchema,
  provisioningProgressSchema,
  provisioningStepSchema,
} from '../src/provisioning-progress.js';

const VALID = {
  schema: 'ProvisioningProgressV1',
  step: 'securing',
  stepIndex: 2,
  stepCount: PROVISIONING_STEPS.length,
  message: 'Setting up keys and access for your workspace.',
  etaSeconds: 120,
  delayed: false,
  blocker: null,
  served: null,
  stepStartedAt: '2026-10-16T12:00:00.000Z',
} as const;

describe('provisioning progress contract', () => {
  it.each(PROVISIONING_STEPS)('round-trips the step %s', (step) => {
    expect(provisioningStepSchema.parse(step)).toBe(step);
  });

  it.each(PROVISIONING_PROGRESS_BLOCKERS)('round-trips the blocker %s', (blocker) => {
    expect(provisioningProgressBlockerSchema.parse(blocker)).toBe(blocker);
  });

  it.each(['server_updating', 'failed', 'placement_required', 'verifying'])(
    'includes %s among the blockers',
    (blocker) => {
      expect(PROVISIONING_PROGRESS_BLOCKERS).toContain(blocker);
    },
  );

  it('ties the step count to the step list', () => {
    expect(PROVISIONING_STEPS).toHaveLength(6);
    expect(provisioningProgressSchema.parse(VALID).stepCount).toBe(PROVISIONING_STEPS.length);
  });

  it('keeps a key it does not know, so a newer server never breaks an older console', () => {
    expect(provisioningProgressSchema.parse({ ...VALID, poolId: 'pool' })).toMatchObject({
      poolId: 'pool',
    });
  });

  it('reads a blocker it does not know as no blocker', () => {
    const parsed = provisioningProgressSchema.parse({ ...VALID, blocker: 'brand_new_blocker' });

    expect(parsed.blocker).toBeNull();
  });

  it('accepts a longer step list than this build knows', () => {
    expect(
      provisioningProgressSchema.safeParse({ ...VALID, stepIndex: 6, stepCount: 7 }).success,
    ).toBe(true);
  });

  it('still rejects a step it does not know', () => {
    expect(provisioningProgressSchema.safeParse({ ...VALID, step: 'teleporting' }).success).toBe(
      false,
    );
  });

  it.each([true, false, null])('accepts served %s', (served) => {
    expect(provisioningProgressSchema.parse({ ...VALID, served }).served).toBe(served);
  });

  it('accepts a null ETA that is delayed', () => {
    expect(
      provisioningProgressSchema.parse({ ...VALID, etaSeconds: null, delayed: true }),
    ).toMatchObject({ etaSeconds: null, delayed: true });
  });

  it('rejects a negative or fractional ETA and an over-long message', () => {
    expect(provisioningProgressSchema.safeParse({ ...VALID, etaSeconds: -1 }).success).toBe(false);
    expect(provisioningProgressSchema.safeParse({ ...VALID, etaSeconds: 1.5 }).success).toBe(false);
    expect(
      provisioningProgressSchema.safeParse({ ...VALID, message: 'x'.repeat(161) }).success,
    ).toBe(false);
  });
});
