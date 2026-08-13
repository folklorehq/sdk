// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

const immutableArtifactBucketSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]-immutable$/);
const immutableArtifactKeySchema = z.string().regex(/^artifacts\/[0-9a-f]{40}\/enclave\.eif$/);
const immutableArtifactVersionIdSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((value) => !/\s/.test(value))
  .refine((value) => value !== 'null');
const immutableArtifactDigestSchema = z.string().regex(/^sha256:[0-9a-f]{64}$/);

/** Per-member rollout fence carried by every update and acknowledgement. */
export const rolloutFenceSchema = z
  .object({
    rollout_id: z.string().uuid(),
    lease_token: z.number().int().positive(),
    member_generation: z.number().int().positive(),
    attempt_nonce: z.string().uuid(),
  })
  .strict();

export type RolloutFence = z.infer<typeof rolloutFenceSchema>;

/** Exact versioned EIF object identity required for a host-side enclave activation. */
export const immutableEnclaveArtifactSchema = z
  .object({
    bucket: immutableArtifactBucketSchema,
    key: immutableArtifactKeySchema,
    version_id: immutableArtifactVersionIdSchema,
    digest: immutableArtifactDigestSchema,
  })
  .strict();

export type ImmutableEnclaveArtifact = z.infer<typeof immutableEnclaveArtifactSchema>;
