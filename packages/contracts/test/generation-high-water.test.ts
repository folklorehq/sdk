// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  GENERATION_HIGH_WATER_OBJECT_PREFIX_TEMPLATE,
  highWaterLogEntryV1Schema,
  highWaterPointerV1Schema,
  type HighWaterLogEntryV1,
  type HighWaterPointerV1,
} from '../src/generation-high-water.js';
import * as rootContracts from '../src/index.js';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const SOURCE_COMMIT = '1'.repeat(40);
const PCR0 = 'f'.repeat(96);
const SIGNATURE = `${'A'.repeat(86)}==`;

const validCheckpoint = {
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
  pcr0: PCR0,
  bootRootDigest: DIGEST_B,
  signerKeyId: 'generation-high-water-key-1',
  previousCheckpointDigest: null,
  issuedAtTrustedMs: 1_700_000_000_000,
  checkpointDigest: DIGEST_A,
};

const validEntry = {
  logVersion: 1,
  logSequence: 1,
  checkpoint: validCheckpoint,
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
  it('exports strict log and pointer schemas with the design shapes', () => {
    expect(highWaterLogEntryV1Schema.parse(validEntry)).toEqual(validEntry);
    expect(highWaterPointerV1Schema.parse(validPointer)).toEqual(validPointer);
    expect(rootContracts.highWaterLogEntryV1Schema).toBe(highWaterLogEntryV1Schema);
    expect(rootContracts.highWaterPointerV1Schema).toBe(highWaterPointerV1Schema);
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
        checkpoint: { ...validCheckpoint, pcr0: 'not-a-pcr' },
      }),
    ).toThrow();
    expect(() =>
      highWaterLogEntryV1Schema.parse({
        ...validEntry,
        checkpoint: {
          ...validCheckpoint,
          issuedAt: validCheckpoint.issuedAtTrustedMs,
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
