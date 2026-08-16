// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import {
  base64Ed25519SignatureSchema,
  digest64Schema,
  gitCommitSchema,
  identifierSchema,
  measurement96Schema,
} from './shared.js';
import {
  durableGenerationHighWaterCheckpointSchema,
  type DurableGenerationHighWaterCheckpointV1,
} from './inference-gateway.js';

const positiveIntegerSchema = z.number().int().positive().safe();
const storageStringSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((value) =>
    [...value].every((character) => {
      const codePoint = character.codePointAt(0);
      return codePoint !== undefined && codePoint >= 0x20 && codePoint !== 0x7f;
    }),
  );

export const GENERATION_HIGH_WATER_OBJECT_PREFIX_TEMPLATE =
  'gate-a/high-water/v1/org/{orgId}/deployment/{deploymentId}/sequence/';
export const GENERATION_HIGH_WATER_CONTEXT_KEY_SEPARATOR = ':';
export const GENERATION_HIGH_WATER_LOG_ENTRY_CONTRACT = 'HighWaterLogEntryV1';
export const GENERATION_HIGH_WATER_POINTER_CONTRACT = 'HighWaterPointerV1';

export const highWaterLogCheckpointV1Schema = z
  .object({
    ...durableGenerationHighWaterCheckpointSchema.shape,
    orgId: identifierSchema,
    deploymentId: identifierSchema,
    policyGeneration: positiveIntegerSchema,
    activationGeneration: positiveIntegerSchema,
    policyDigest: digest64Schema,
    releaseId: identifierSchema,
    protectedSourceCommit: gitCommitSchema,
    eifDigest: digest64Schema,
    pcr0: measurement96Schema,
    bootRootDigest: digest64Schema,
    signerKeyId: identifierSchema,
    previousCheckpointDigest: digest64Schema.nullable(),
    issuedAtTrustedMs: positiveIntegerSchema,
    checkpointDigest: digest64Schema,
  })
  .omit({ issuedAt: true, signature: true })
  .strict();

export const highWaterLogEntryV1Schema = z
  .object({
    logVersion: z.literal(1),
    logSequence: positiveIntegerSchema,
    checkpoint: highWaterLogCheckpointV1Schema,
    previousEntryDigest: digest64Schema.nullable(),
    entryDigest: digest64Schema,
    signerPurpose: z.literal('generation-high-water'),
    signerKeyId: identifierSchema,
    signatureAlgorithm: z.literal('Ed25519'),
    signature: base64Ed25519SignatureSchema,
  })
  .strict();

export type HighWaterLogCheckpointV1 = Omit<
  DurableGenerationHighWaterCheckpointV1,
  'issuedAt' | 'signature'
> & {
  pcr0: string;
  bootRootDigest: string;
  issuedAtTrustedMs: number;
};
export type HighWaterLogEntryV1 = Omit<z.infer<typeof highWaterLogEntryV1Schema>, 'checkpoint'> & {
  checkpoint: HighWaterLogCheckpointV1;
};

export const highWaterPointerV1Schema = z
  .object({
    pointerVersion: z.literal(1),
    contextKey: identifierSchema,
    orgId: identifierSchema,
    deploymentId: identifierSchema,
    logSequence: positiveIntegerSchema,
    entryDigest: digest64Schema,
    checkpointDigest: digest64Schema,
    objectKey: storageStringSchema,
    objectVersionId: storageStringSchema,
    pointerState: z.enum(['healthy', 'repairing']),
    updatedAtTrustedMs: positiveIntegerSchema.nullable(),
  })
  .strict()
  .superRefine((pointer, context) => {
    const expectedContextKey = `${pointer.orgId}${GENERATION_HIGH_WATER_CONTEXT_KEY_SEPARATOR}${pointer.deploymentId}`;
    if (pointer.contextKey !== expectedContextKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['contextKey'],
        message: 'contextKey must bind orgId and deploymentId',
      });
    }
    const expectedObjectPrefix = GENERATION_HIGH_WATER_OBJECT_PREFIX_TEMPLATE.replace(
      '{orgId}',
      pointer.orgId,
    ).replace('{deploymentId}', pointer.deploymentId);
    const expectedObjectKey = `${expectedObjectPrefix}${String(pointer.logSequence).padStart(20, '0')}.cbor`;
    if (pointer.objectKey !== expectedObjectKey) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['objectKey'],
        message: 'objectKey must bind to the deployment high-water sequence',
      });
    }
  });

export type HighWaterPointerV1 = z.infer<typeof highWaterPointerV1Schema>;
export type GenerationHighWaterDeploymentContext = Pick<
  HighWaterPointerV1,
  'orgId' | 'deploymentId'
>;
