// SPDX-License-Identifier: Apache-2.0
import { describe, expect, expectTypeOf, it } from 'vitest';
import * as enclaveContracts from '../src/enclave.js';
import {
  encryptedBlockReadSchema,
  encryptedBlockSchema,
  encryptedBodyReadSchema,
  encryptedBodySchema,
  teamOnboardingSynthesisResultSchema,
  wikiSynthesisResultSchema,
  type EncryptedBlock,
  type EncryptedBlockRead,
  type EncryptedBody,
  type EncryptedBodyRead,
} from '../src/enclave.js';
import {
  sealedContentEnvelopeV1Schema,
  sealedEnvelopeHeader,
  type SealedContentEnvelopeV1,
} from '../src/sealed-content.js';

const envelope: SealedContentEnvelopeV1 = {
  version: 1,
  algorithm: 'ALG_AES256_GCM_IV12_TAG16_HKDF_SHA512_COMMIT_KEY_ECDSA_P384',
  orgId: '3a1e5e25-25d2-4f04-a3b6-1f7bb8b3359b',
  objectId: '0dcfa1d3-5d01-4cf6-b489-61e3cfa0b40d',
  purpose: 'wiki-block',
  formatVersion: 1,
  contentKeyVersion: 1,
  ciphertext: 'AQID',
};

const legacyBody = { format: 'esdk-v1' as const, ciphertext: 'AQID' };
const sealedBlock = {
  type: 'summary',
  sensitivityLevel: 'team_scoped' as const,
  audienceId: null,
  factIds: ['f1'],
  body: envelope,
};
const legacyBlock = { ...sealedBlock, body: legacyBody };

describe('sealedContentEnvelopeV1Schema', () => {
  it('accepts the exact v1 long-lived envelope', () => {
    expect(sealedContentEnvelopeV1Schema.parse(envelope)).toEqual(envelope);
  });

  it('accepts the distinct team-onboarding block purpose', () => {
    expect(
      sealedContentEnvelopeV1Schema.safeParse({
        ...envelope,
        purpose: 'team-onboarding-block',
      }).success,
    ).toBe(true);
  });

  it.each([
    'assignmentEpoch',
    'assignmentGeneration',
    'generation',
    'migrationEpoch',
    'pool',
    'poolId',
    'sourcePoolId',
    'destinationPoolId',
    'route',
    'routeId',
    'placement',
    'placementId',
    'assignmentState',
  ])('rejects forbidden mutable placement field %s', (field) => {
    expect(
      sealedContentEnvelopeV1Schema.safeParse({ ...envelope, [field]: 'forbidden' }).success,
    ).toBe(false);
  });

  it('rejects unrelated unknown fields', () => {
    expect(sealedContentEnvelopeV1Schema.safeParse({ ...envelope, unknown: true }).success).toBe(
      false,
    );
  });

  it('rejects invalid identities, versions, and algorithm', () => {
    expect(sealedContentEnvelopeV1Schema.safeParse({ ...envelope, version: 2 }).success).toBe(
      false,
    );
    expect(
      sealedContentEnvelopeV1Schema.safeParse({ ...envelope, orgId: envelope.orgId.toUpperCase() })
        .success,
    ).toBe(false);
    expect(
      sealedContentEnvelopeV1Schema.safeParse({ ...envelope, objectId: 'not-a-uuid' }).success,
    ).toBe(false);
    expect(sealedContentEnvelopeV1Schema.safeParse({ ...envelope, formatVersion: 0 }).success).toBe(
      false,
    );
    expect(
      sealedContentEnvelopeV1Schema.safeParse({ ...envelope, contentKeyVersion: 1.5 }).success,
    ).toBe(false);
    expect(
      sealedContentEnvelopeV1Schema.safeParse({
        ...envelope,
        contentKeyVersion: Number.MAX_SAFE_INTEGER + 1,
      }).success,
    ).toBe(false);
    expect(
      sealedContentEnvelopeV1Schema.safeParse({ ...envelope, algorithm: 'aes-gcm' }).success,
    ).toBe(false);
  });

  it('rejects empty or non-canonical ciphertext base64', () => {
    expect(sealedContentEnvelopeV1Schema.safeParse({ ...envelope, ciphertext: '' }).success).toBe(
      false,
    );
    expect(
      sealedContentEnvelopeV1Schema.safeParse({ ...envelope, ciphertext: 'AQI' }).success,
    ).toBe(false);
    expect(
      sealedContentEnvelopeV1Schema.safeParse({ ...envelope, ciphertext: 'Zh==' }).success,
    ).toBe(false);
    expect(
      sealedContentEnvelopeV1Schema.safeParse({ ...envelope, ciphertext: 'AQID\n' }).success,
    ).toBe(false);
  });
});

describe('sealedEnvelopeHeader', () => {
  it('returns a fresh ordered AAD header without ciphertext', () => {
    const header = sealedEnvelopeHeader(envelope);

    expect(header).toEqual({
      version: 1,
      algorithm: 'ALG_AES256_GCM_IV12_TAG16_HKDF_SHA512_COMMIT_KEY_ECDSA_P384',
      orgId: '3a1e5e25-25d2-4f04-a3b6-1f7bb8b3359b',
      objectId: '0dcfa1d3-5d01-4cf6-b489-61e3cfa0b40d',
      purpose: 'wiki-block',
      formatVersion: 1,
      contentKeyVersion: 1,
    });
    expect(Object.keys(header)).toEqual([
      'version',
      'algorithm',
      'orgId',
      'objectId',
      'purpose',
      'formatVersion',
      'contentKeyVersion',
    ]);
    expect(sealedEnvelopeHeader(envelope)).not.toBe(header);
  });
});

describe('sealed write contracts', () => {
  it('accepts sealed v1 bodies and blocks', () => {
    expect(encryptedBodySchema.parse(envelope)).toEqual(envelope);
    expect(encryptedBlockSchema.parse(sealedBlock)).toEqual(sealedBlock);
  });

  it('rejects legacy bodies and blocks from normal writes', () => {
    expect(encryptedBodySchema.safeParse(legacyBody).success).toBe(false);
    expect(encryptedBlockSchema.safeParse(legacyBlock).success).toBe(false);
  });

  it('excludes legacy shapes from normal write types', () => {
    expectTypeOf<EncryptedBody>().toEqualTypeOf<SealedContentEnvelopeV1>();
    expectTypeOf<typeof legacyBody>().not.toMatchTypeOf<EncryptedBody>();
    expectTypeOf<typeof legacyBlock>().not.toMatchTypeOf<EncryptedBlock>();
  });
});

describe('explicit read compatibility contracts', () => {
  it('accepts sealed v1 and strict legacy bodies and blocks', () => {
    expect(encryptedBodyReadSchema.parse(envelope)).toEqual(envelope);
    expect(encryptedBodyReadSchema.parse(legacyBody)).toEqual(legacyBody);
    expect(encryptedBlockReadSchema.parse(sealedBlock)).toEqual(sealedBlock);
    expect(encryptedBlockReadSchema.parse(legacyBlock)).toEqual(legacyBlock);
  });

  it('rejects noncanonical or placement-extended legacy bodies', () => {
    expect(encryptedBodyReadSchema.safeParse({ ...legacyBody, ciphertext: 'AQI' }).success).toBe(
      false,
    );
    expect(encryptedBodyReadSchema.safeParse({ ...legacyBody, assignmentEpoch: 4 }).success).toBe(
      false,
    );
    expect(encryptedBodyReadSchema.safeParse({ ...legacyBody, poolId: 'pool-1' }).success).toBe(
      false,
    );
  });

  it('includes legacy shapes only in explicitly named read types', () => {
    expectTypeOf<typeof legacyBody>().toMatchTypeOf<EncryptedBodyRead>();
    expectTypeOf<typeof legacyBlock>().toMatchTypeOf<EncryptedBlockRead>();
  });

  it('does not expose the private legacy schema', () => {
    expect(enclaveContracts).not.toHaveProperty('legacyEncryptedBodySchema');
  });

  it('keeps deployed legacy wiki results readable', () => {
    expect(
      wikiSynthesisResultSchema.safeParse({
        type: 'wiki_synthesis',
        requestId: 'req-1',
        themeId: 'theme-1',
        orgId: 'org-1',
        leaseToken: 'lease-1',
        articles: [],
        blocks: [legacyBlock],
        citedFactIds: ['f1'],
      }).success,
    ).toBe(true);
    expect(
      teamOnboardingSynthesisResultSchema.safeParse({
        type: 'team_onboarding_synthesis',
        requestId: 'req-1',
        orgId: 'org-1',
        teamId: 'team-1',
        teamName: 'Payments',
        articles: [],
        blocks: [legacyBlock],
        citedFactIds: ['f1'],
      }).success,
    ).toBe(true);
  });
});
