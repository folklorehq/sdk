// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

import { digest64Schema, identifierSchema, measurement96Schema } from './shared.js';

const positiveIntegerSchema = z.number().int().positive().safe();

export const trustedTimeBindingV1Schema = z
  .object({
    orgId: identifierSchema,
    deploymentId: identifierSchema,
    bootEpoch: identifierSchema,
    releaseId: identifierSchema,
    eifDigest: digest64Schema,
    pcr0: measurement96Schema,
    bootRootDigest: digest64Schema,
    policyGeneration: positiveIntegerSchema,
    activationGeneration: positiveIntegerSchema,
    keysetEpoch: positiveIntegerSchema,
    keysetDigest: digest64Schema,
  })
  .strict();

export type TrustedTimeBindingV1 = z.infer<typeof trustedTimeBindingV1Schema>;

export const trustedTimeSampleV1Schema = z
  .object({
    orgId: identifierSchema,
    deploymentId: identifierSchema,
    bootEpoch: identifierSchema,
    trustedNowMs: positiveIntegerSchema,
    latestPossibleNowMs: positiveIntegerSchema,
    checkpointDigest: digest64Schema,
    health: z.literal('healthy'),
  })
  .strict()
  .refine(
    (sample) => sample.latestPossibleNowMs >= sample.trustedNowMs,
    'latest possible time must not precede trusted time',
  );

export type TrustedTimeSampleV1 = z.infer<typeof trustedTimeSampleV1Schema>;
