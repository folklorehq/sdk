// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const PROVISIONING_STEPS = [
  'placed',
  'preparing_storage',
  'securing',
  'starting_workspace',
  'connecting',
  'ready',
] as const;
export const provisioningStepSchema = z.enum(PROVISIONING_STEPS);
export type ProvisioningStep = z.infer<typeof provisioningStepSchema>;

// Two-phase rule: the console accepts a new blocker value first, the server emits it after.
export const PROVISIONING_PROGRESS_BLOCKERS = [
  'waiting_for_server',
  'server_updating',
  'server_capacity_full',
  'retrying',
  'server_restarting',
  'failed',
  'placement_required',
  'verifying',
] as const;
export const provisioningProgressBlockerSchema = z.enum(PROVISIONING_PROGRESS_BLOCKERS);
export type ProvisioningProgressBlocker = z.infer<typeof provisioningProgressBlockerSchema>;

export const PROVISIONING_PROGRESS_MESSAGE_MAX_LENGTH = 160;

// Blocker precedence: failed, placement_required, verifying, then the pool and retry blockers.
// A null ETA with delayed set means a step ran past its expected time.
// Progress fraction: stepIndex / (stepCount - 1), so 'placed' is 0 and 'ready' is 1.
export const provisioningProgressSchema = z
  .object({
    schema: z.literal('ProvisioningProgressV1'),
    step: provisioningStepSchema,
    stepIndex: z.number().int().nonnegative(),
    stepCount: z.number().int().positive(),
    message: z.string().min(1).max(PROVISIONING_PROGRESS_MESSAGE_MAX_LENGTH),
    etaSeconds: z.number().int().nonnegative().nullable(),
    delayed: z.boolean(),
    blocker: provisioningProgressBlockerSchema.nullable().catch(null),
    served: z.boolean().nullable(),
    stepStartedAt: z.string().datetime().nullable(),
  })
  .passthrough();
export type ProvisioningProgress = z.infer<typeof provisioningProgressSchema>;
