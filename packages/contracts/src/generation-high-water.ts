// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import {
  base64Ed25519SignatureSchema,
  digest64Schema,
  gitCommitSchema,
  identifierSchema,
  measurement96Schema,
} from './shared.js';

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
export const DURABLE_GENERATION_HIGH_WATER_CHECKPOINT_V1_SCHEMA =
  'folklore.durable-generation-high-water-checkpoint.v1' as const;

// The one canonical generation context (plan Task 2). Declared exactly once here; every
// transport, carrier, boot, and snapshot consumer imports this type and never declares a local
// seven-field or keyset high-water replacement.
export interface GenerationContextV1 {
  readonly orgId: string;
  readonly deploymentId: string;
  readonly policyDigest: string;
  readonly policyGeneration: number;
  readonly activationGeneration: number;
  readonly configurationGeneration: number;
  readonly keysetEpoch: number;
  readonly keysetDigest: string;
  readonly releaseId: string;
  readonly protectedSourceCommit: string;
  readonly eifDigest: string;
  readonly pcr0: string;
  readonly bootRootDigest: string;
}

const generationContextShape = {
  orgId: identifierSchema,
  deploymentId: identifierSchema,
  policyDigest: digest64Schema,
  policyGeneration: positiveIntegerSchema,
  activationGeneration: positiveIntegerSchema,
  configurationGeneration: positiveIntegerSchema,
  keysetEpoch: positiveIntegerSchema,
  keysetDigest: digest64Schema,
  releaseId: identifierSchema,
  protectedSourceCommit: gitCommitSchema,
  eifDigest: digest64Schema,
  pcr0: measurement96Schema,
  bootRootDigest: digest64Schema,
} as const;

export const generationContextV1Schema = z.object(generationContextShape).strict();

// The only transport projection: the seven request-bound measured-boot identity fields. The
// policy/keyset members are response-bound and travel only inside the signed checkpoint.
export interface DurableGenerationHighWaterTransportContextV1 {
  readonly orgId: string;
  readonly deploymentId: string;
  readonly releaseId: string;
  readonly protectedSourceCommit: string;
  readonly eifDigest: string;
  readonly pcr0: string;
  readonly bootRootDigest: string;
}

export function toDurableGenerationHighWaterTransportContext(
  context: GenerationContextV1,
): DurableGenerationHighWaterTransportContextV1 {
  return {
    orgId: context.orgId,
    deploymentId: context.deploymentId,
    releaseId: context.releaseId,
    protectedSourceCommit: context.protectedSourceCommit,
    eifDigest: context.eifDigest,
    pcr0: context.pcr0,
    bootRootDigest: context.bootRootDigest,
  };
}

// The complete signed checkpoint: the full thirteen-field context plus the chain link, the
// checkpoint digest, and the signer identity. No seven-field checkpoint may be returned as a
// complete checkpoint, and no adapter may infer a missing digest from a generation number.
export interface DurableGenerationHighWaterCheckpointV1 extends GenerationContextV1 {
  readonly schema: typeof DURABLE_GENERATION_HIGH_WATER_CHECKPOINT_V1_SCHEMA;
  readonly predecessorDigest: string;
  readonly checkpointDigest: string;
  readonly signerKeyId: string;
  readonly signerPurpose: 'generation-high-water';
}

// Legacy keyset high-water field kept only for the canonical boot-manifest encoders that still
// carry the reference/evidence wire shapes. The canonical context above is the only authority;
// production carriers, snapshots, and transport adapters use keysetEpoch/keysetDigest.
export const legacyKeysetHighWaterShape = {
  keysetHighWater: z.object({ epoch: positiveIntegerSchema, digest: digest64Schema }).strict(),
} as const;

export function legacyKeysetHighWater(
  epoch: number,
  digest: string,
): { keysetHighWater: { epoch: number; digest: string } } {
  return { keysetHighWater: { epoch, digest } };
}

// Legacy release-provenance context fields (keysetHighWaterEpoch/keysetHighWaterDigest) kept for
// the official release-provenance wire payload. The canonical context uses keysetEpoch/keysetDigest.
export const legacyReleaseProvenanceKeysetHighWaterShape = {
  keysetHighWaterEpoch: positiveIntegerSchema,
  keysetHighWaterDigest: digest64Schema,
} as const;
export type LegacyReleaseProvenanceKeysetHighWaterV1 = {
  readonly keysetHighWaterEpoch: number;
  readonly keysetHighWaterDigest: string;
};

export function releaseProvenanceLegacyKeysetHighWaterFields(
  context: LegacyReleaseProvenanceKeysetHighWaterV1,
): [number, string] {
  return [context.keysetHighWaterEpoch, context.keysetHighWaterDigest];
}

// The durable checkpoint wire schema carries the canonical fields plus the legacy fields the
// existing canonical encoders still serialize. Strict: both the canonical context and the chain
// link must be present; a reduced checkpoint is rejected.
export const durableGenerationHighWaterCheckpointSchema = z
  .object({
    checkpointVersion: z.literal(1),
    ...generationContextShape,
    schema: z.literal(DURABLE_GENERATION_HIGH_WATER_CHECKPOINT_V1_SCHEMA),
    ...legacyKeysetHighWaterShape,
    predecessorDigest: digest64Schema,
    previousCheckpointDigest: digest64Schema.nullable(),
    checkpointDigest: digest64Schema,
    signerKeyId: identifierSchema,
    signerPurpose: z.literal('generation-high-water'),
    issuedAt: positiveIntegerSchema,
    signature: base64Ed25519SignatureSchema,
  })
  .strict();

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
    predecessorDigest: digest64Schema.nullable(),
    issuedAtTrustedMs: positiveIntegerSchema,
    checkpointDigest: digest64Schema,
  })
  .omit({ issuedAt: true, signature: true })
  .strict();

export type HighWaterLogCheckpointV1 = z.infer<typeof highWaterLogCheckpointV1Schema>;

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

export type HighWaterLogEntryV1 = z.infer<typeof highWaterLogEntryV1Schema>;

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
