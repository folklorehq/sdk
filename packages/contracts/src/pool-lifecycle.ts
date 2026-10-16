// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const POOL_LIFECYCLE_STAGES = [
  // desired_generation increased
  'roll_opened',
  // deployments.expected_source_sha changed
  'release_recorded',
  // pool_provisioning.state
  'provisioning',
  'booting',
  'healthy',
  'draining',
  'failed',
  'retired',
  // pool_readiness.enclave_phase changed; detail is the phase
  'enclave_boot',
  // pool_readiness.apply_phase changed; detail is the phase
  'tenant_apply',
  // pool_assignment_acks.generation increased with healthy = true
  'assignment_acked',
  // the served predicate flipped (readiness plan D-3)
  'served',
  'unserved',
] as const;
export type PoolLifecycleStage = (typeof POOL_LIFECYCLE_STAGES)[number];
export const poolLifecycleStageSchema = z.enum(POOL_LIFECYCLE_STAGES);

export const POOL_LIFECYCLE_DETAIL_PATTERN = /^[a-z][a-z0-9_]{0,63}$/;
export const POOL_LIFECYCLE_SOURCE_SHA_PATTERN = /^[0-9a-f]{40}$/;

// UNWIRED until PL-2: the admin pool lifecycle read returns this shape.
export const adminPoolLifecycleEventSchema = z
  .object({
    stage: poolLifecycleStageSchema,
    detail: z.string().regex(POOL_LIFECYCLE_DETAIL_PATTERN).nullable(),
    sourceSha: z.string().regex(POOL_LIFECYCLE_SOURCE_SHA_PATTERN).nullable(),
    revision: z.number().int().positive(),
    generation: z.number().int().nonnegative(),
    occurredAt: z.string().datetime(),
    sincePreviousSeconds: z.number().int().nonnegative().nullable(),
  })
  .strict();
export type AdminPoolLifecycleEvent = z.infer<typeof adminPoolLifecycleEventSchema>;
