// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  DURABLE_GENERATION_HIGH_WATER_CHECKPOINT_V1_SCHEMA,
  GENERATION_HIGH_WATER_OBJECT_PREFIX_TEMPLATE,
  durableGenerationHighWaterCheckpointSchema,
  generationContextV1Schema,
  highWaterLogEntryV1Schema,
  highWaterPointerV1Schema,
  toDurableGenerationHighWaterTransportContext,
  type DurableGenerationHighWaterCheckpointV1,
  type GenerationContextV1,
  type HighWaterLogEntryV1,
  type HighWaterPointerV1,
  type HighWaterObjectReferenceV1,
} from '../src/generation-high-water.js';
import * as rootContracts from '../src/index.js';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const SOURCE_COMMIT = '1'.repeat(40);
const PCR0 = 'f'.repeat(96);
const SIGNATURE = `${'A'.repeat(86)}==`;

const validContext = {
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  policyDigest: DIGEST_B,
  policyGeneration: 7,
  activationGeneration: 3,
  configurationGeneration: 11,
  keysetEpoch: 4,
  keysetDigest: DIGEST_A,
  releaseId: 'release-1',
  protectedSourceCommit: SOURCE_COMMIT,
  eifDigest: DIGEST_A,
  pcr0: PCR0,
  bootRootDigest: DIGEST_B,
} satisfies GenerationContextV1;

const validCheckpoint = {
  ...validContext,
  schema: DURABLE_GENERATION_HIGH_WATER_CHECKPOINT_V1_SCHEMA,
  predecessorDigest: DIGEST_A,
  checkpointDigest: DIGEST_A,
  signerKeyId: 'generation-high-water-key-1',
  signerPurpose: 'generation-high-water',
} satisfies DurableGenerationHighWaterCheckpointV1;

const validLogCheckpoint = {
  checkpointVersion: 1,
  ...validContext,
  schema: DURABLE_GENERATION_HIGH_WATER_CHECKPOINT_V1_SCHEMA,
  keysetHighWater: { epoch: 4, digest: DIGEST_A },
  predecessorDigest: DIGEST_A,
  previousCheckpointDigest: null,
  checkpointDigest: DIGEST_A,
  signerKeyId: 'generation-high-water-key-1',
  signerPurpose: 'generation-high-water',
  issuedAtTrustedMs: 1_700_000_000_000,
};

const validEntry = {
  logVersion: 1,
  logSequence: 1,
  checkpoint: validLogCheckpoint,
  previousEntryDigest: null,
  entryDigest: DIGEST_B,
  signerPurpose: 'generation-high-water',
  signerKeyId: 'generation-high-water-key-1',
  signatureAlgorithm: 'Ed25519',
  signature: SIGNATURE,
} satisfies HighWaterLogEntryV1;

const validPointer = {
  pointerVersion: 1,
  contextKey: 'org-1:deployment-1',
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  logSequence: 1,
  entryDigest: DIGEST_B,
  checkpointDigest: DIGEST_A,
  objectKey:
    'gate-a/high-water/v1/org/org-1/deployment/deployment-1/sequence/00000000000000000001.cbor',
  objectVersionId: 'version-1',
  pointerState: 'healthy',
  updatedAtTrustedMs: 1_700_000_000_000,
} satisfies HighWaterPointerV1;

describe('Gate A high-water contracts', () => {
  it('keeps stored high-water references version-bound and deployment-scoped', () => {
    const reference = {
      context: validContext,
      logSequence: 1,
      entryDigest: DIGEST_B,
      objectKey: validPointer.objectKey,
      objectVersionId: validPointer.objectVersionId,
    } satisfies HighWaterObjectReferenceV1;
    expect(reference).toMatchObject({
      logSequence: 1,
      entryDigest: DIGEST_B,
      objectVersionId: 'version-1',
    });
    expect(reference.context.orgId).toBe(validPointer.orgId);
    expect(reference.context.deploymentId).toBe(validPointer.deploymentId);
  });

  it('owns the single canonical GenerationContextV1 with all thirteen members', () => {
    expect(rootContracts.generationContextV1Schema).toBe(generationContextV1Schema);
    const parsed = generationContextV1Schema.parse(validContext);
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'orgId',
        'deploymentId',
        'policyDigest',
        'policyGeneration',
        'activationGeneration',
        'configurationGeneration',
        'keysetEpoch',
        'keysetDigest',
        'releaseId',
        'protectedSourceCommit',
        'eifDigest',
        'pcr0',
        'bootRootDigest',
      ].sort(),
    );
    expect(() =>
      generationContextV1Schema.parse({ ...validContext, keysetHighWater: {} }),
    ).toThrow();
    expect(() =>
      generationContextV1Schema.parse({ ...validContext, configurationGeneration: 0 }),
    ).toThrow();
  });

  it('projects exactly the seven request-bound transport fields losslessly', () => {
    const transport = toDurableGenerationHighWaterTransportContext(validContext);
    expect(Object.keys(transport).sort()).toEqual(
      [
        'orgId',
        'deploymentId',
        'releaseId',
        'protectedSourceCommit',
        'eifDigest',
        'pcr0',
        'bootRootDigest',
      ].sort(),
    );
    expect(transport).toMatchObject({
      orgId: validContext.orgId,
      deploymentId: validContext.deploymentId,
      releaseId: validContext.releaseId,
      protectedSourceCommit: validContext.protectedSourceCommit,
      eifDigest: validContext.eifDigest,
      pcr0: validContext.pcr0,
      bootRootDigest: validContext.bootRootDigest,
    });
    expect(transport).not.toHaveProperty('policyDigest');
    expect(transport).not.toHaveProperty('policyGeneration');
    expect(transport).not.toHaveProperty('keysetEpoch');
    expect(transport).not.toHaveProperty('configurationGeneration');
  });

  it('accepts a complete thirteen-field checkpoint and rejects a reduced seven-field one', () => {
    const parsed = durableGenerationHighWaterCheckpointSchema.parse({
      checkpointVersion: 1,
      ...validContext,
      schema: DURABLE_GENERATION_HIGH_WATER_CHECKPOINT_V1_SCHEMA,
      keysetHighWater: { epoch: 4, digest: DIGEST_A },
      predecessorDigest: DIGEST_A,
      previousCheckpointDigest: null,
      checkpointDigest: DIGEST_A,
      signerKeyId: 'generation-high-water-key-1',
      signerPurpose: 'generation-high-water',
      issuedAt: 1_700_000_000_000,
      signature: SIGNATURE,
    });
    expect(parsed).toMatchObject({
      configurationGeneration: 11,
      keysetEpoch: 4,
      keysetDigest: DIGEST_A,
      predecessorDigest: DIGEST_A,
      schema: DURABLE_GENERATION_HIGH_WATER_CHECKPOINT_V1_SCHEMA,
      signerPurpose: 'generation-high-water',
    });
  });

  it('rejects the legacy keysetHighWater-only checkpoint as an incomplete checkpoint', () => {
    const legacyOnly = {
      checkpointVersion: 1,
      orgId: 'org-1',
      deploymentId: 'deployment-1',
      policyGeneration: 7,
      activationGeneration: 3,
      keysetHighWater: { epoch: 4, digest: DIGEST_A },
      policyDigest: DIGEST_B,
      releaseId: 'release-1',
      protectedSourceCommit: SOURCE_COMMIT,
      eifDigest: DIGEST_A,
      signerKeyId: 'generation-high-water-key-1',
      previousCheckpointDigest: null,
      issuedAt: 1_700_000_000_000,
      checkpointDigest: DIGEST_A,
      signature: SIGNATURE,
    };
    expect(() => durableGenerationHighWaterCheckpointSchema.parse(legacyOnly)).toThrow();
    expect(() =>
      highWaterLogEntryV1Schema.parse({ ...validEntry, checkpoint: legacyOnly }),
    ).toThrow();
  });

  it('rejects a checkpoint that drops any canonical context member', () => {
    for (const member of [
      'orgId',
      'deploymentId',
      'policyDigest',
      'policyGeneration',
      'activationGeneration',
      'configurationGeneration',
      'keysetEpoch',
      'keysetDigest',
      'releaseId',
      'protectedSourceCommit',
      'eifDigest',
      'pcr0',
      'bootRootDigest',
    ] as const) {
      const { [member]: _dropped, ...reducedCheckpoint } = validLogCheckpoint;
      expect(
        () =>
          highWaterLogEntryV1Schema.parse({
            ...validEntry,
            checkpoint: reducedCheckpoint,
          }),
        `checkpoint missing ${member} must be rejected`,
      ).toThrow();
    }
  });

  it('exports strict log and pointer schemas with the canonical shapes', () => {
    expect(highWaterLogEntryV1Schema.parse(validEntry)).toEqual(validEntry);
    expect(highWaterPointerV1Schema.parse(validPointer)).toEqual(validPointer);
    expect(rootContracts.highWaterLogEntryV1Schema).toBe(highWaterLogEntryV1Schema);
    expect(rootContracts.highWaterPointerV1Schema).toBe(highWaterPointerV1Schema);
    expect(rootContracts.durableGenerationHighWaterCheckpointSchema).toBe(
      durableGenerationHighWaterCheckpointSchema,
    );
    expect(GENERATION_HIGH_WATER_OBJECT_PREFIX_TEMPLATE).toBe(
      'gate-a/high-water/v1/org/{orgId}/deployment/{deploymentId}/sequence/',
    );
  });

  it('rejects unknown fields and malformed signed log values', () => {
    expect(() => highWaterLogEntryV1Schema.parse({ ...validEntry, unexpected: true })).toThrow();
    expect(() =>
      highWaterLogEntryV1Schema.parse({
        ...validEntry,
        logSequence: 0,
      }),
    ).toThrow();
    expect(() =>
      highWaterLogEntryV1Schema.parse({
        ...validEntry,
        checkpoint: { ...validLogCheckpoint, pcr0: 'not-a-pcr' },
      }),
    ).toThrow();
    expect(() =>
      highWaterLogEntryV1Schema.parse({
        ...validEntry,
        checkpoint: {
          ...validLogCheckpoint,
          issuedAt: 1_700_000_000_000,
          signature: SIGNATURE,
        },
      }),
    ).toThrow();
    expect(() =>
      highWaterLogEntryV1Schema.parse({
        ...validEntry,
        signature: 'not-a-signature',
      }),
    ).toThrow();
  });

  it('binds the pointer context key and object key to the same deployment', () => {
    expect(() =>
      highWaterPointerV1Schema.parse({
        ...validPointer,
        contextKey: 'org-2:deployment-1',
      }),
    ).toThrow();
    expect(() =>
      highWaterPointerV1Schema.parse({
        ...validPointer,
        objectKey: 'gate-a/high-water/v1/org/org-2/deployment/deployment-1/sequence/1',
      }),
    ).toThrow();
    expect(() =>
      highWaterPointerV1Schema.parse({
        ...validPointer,
        objectKey:
          'gate-a/high-water/v1/org/org-1/deployment/deployment-1/sequence/00000000000000000002.cbor',
      }),
    ).toThrow();
    expect(() =>
      highWaterPointerV1Schema.parse({
        ...validPointer,
        pointerState: 'unknown',
      }),
    ).toThrow();
  });
});

describe('high-water finalization guard contract', () => {
  it('exports an immutable pending and finalized guard schema', async () => {
    const highWater = (await import('../src/generation-high-water.js')) as unknown as Record<
      string,
      unknown
    >;
    expect(highWater['generationHighWaterFinalizationGuardV1Schema']).toBeDefined();
  });
});
