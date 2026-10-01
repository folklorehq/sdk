// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import {
  canonicalPlacementIdentityAuthDelegationV1,
  placementIdentityAuthDelegationV1Schema,
  placementIdentityBeginRequestV1Schema,
  placementIdentityBootstrapProofV1Schema,
  placementIdentityMethodV1Schema,
  placementIdentityNonceV1Schema,
  placementIdentityTimestampV1Schema,
  type PlacementIdentityAuthDelegationV1,
  type PlacementIdentityBeginRequestV1,
  type PlacementIdentityBootstrapProofV1,
} from '../../src/placement-identity/bootstrap.js';
import {
  accountMaterializationEnvelopeV1Schema,
  canonicalPlacementIdentityReceiptIdentityPreimageV1,
  legacyIdentityBindingEntryV1Schema,
  legacyIdentityBindingManifestV1Schema,
  placementIdentityReceiptDigestV1,
  placementIdentityReceiptIdentityPreimageV1Schema,
  placementIdentityReceiptV1Schema,
  type AccountMaterializationEnvelopeV1,
  type LegacyIdentityBindingManifestV1,
  type PlacementIdentityReceiptIdentityPreimageV1,
  type PlacementIdentityReceiptV1,
} from '../../src/placement-identity/account-binding.js';
import {
  placementIdentityEmailChallengeV1Schema,
  placementIdentityEmailRedemptionOutcomeV1Schema,
  placementIdentityEmailRedemptionRequestV1Schema,
  type PlacementIdentityEmailChallengeV1,
  type PlacementIdentityEmailRedemptionOutcomeV1,
  type PlacementIdentityEmailRedemptionRequestV1,
} from '../../src/placement-identity/email.js';
import {
  canonicalPlacementIdentityOperationResultV1,
  placementIdentityConsumeRequestV1Schema,
  placementIdentityOperationRecordV1Schema,
  placementIdentityOperationResultV1Schema,
  placementIdentityReceiptRenewalRequestV1Schema,
  placementIdentityRevokeRequestV1Schema,
  type PlacementIdentityOperationRecordV1,
  type PlacementIdentityOperationResultV1,
} from '../../src/placement-identity/operation.js';

const SPKI = 'MCowBQYDK2VwAyEAONJrM8mqpI4ZALNnVQHweHj6nRa37GeVBgF7w/L0pWY=';
const SIGNATURE = `${'A'.repeat(86)}==`;
const NONCE = Buffer.alloc(32).toString('base64');
const TRANSACTION_ID = '00000000-0000-4000-8000-000000000001';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000002';
const ISSUED_AT = '2026-08-25T00:00:00.000Z';
const RECEIPT_EXPIRES_AT = '2026-08-25T00:05:00.000Z';
const TRANSACTION_EXPIRES_AT = '2026-08-25T01:00:00.000Z';
const MANIFEST_EXPIRES_AT = '2026-08-26T00:00:00.000Z';
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const DIGEST_D = 'd'.repeat(64);
const DIGEST_E = 'e'.repeat(64);
const DIGEST_F = 'f'.repeat(64);
const DIGEST_G = '1'.repeat(64);
const DIGEST_H = '2'.repeat(64);

function beginRequest(): PlacementIdentityBeginRequestV1 {
  return {
    schema: 'PlacementIdentityBeginRequestV1',
    version: 1,
    transactionId: TRANSACTION_ID,
    method: 'microsoft',
    bootstrapPublicKeySpki: SPKI,
    bootstrapKeyDigest: DIGEST_A,
  };
}

function delegation(): PlacementIdentityAuthDelegationV1 {
  return {
    schema: 'PlacementIdentityAuthDelegationV1',
    version: 1,
    transactionId: TRANSACTION_ID,
    delegationId: 'delegation-0001',
    method: 'microsoft',
    bootstrapPublicKeySpki: SPKI,
    bootstrapKeyDigest: DIGEST_A,
    authorityNonce: NONCE,
    callbackBindingDigest: DIGEST_B,
    createdAt: ISSUED_AT,
    absoluteExpiresAt: TRANSACTION_EXPIRES_AT,
    oneUseState: 'active',
    authoritySignatureBase64: SIGNATURE,
  };
}

function bootstrapProof(): PlacementIdentityBootstrapProofV1 {
  return {
    schema: 'PlacementIdentityBootstrapProofV1',
    version: 1,
    purpose: 'placement_identity_bootstrap',
    transactionId: TRANSACTION_ID,
    delegationId: 'delegation-0001',
    identityReceiptDigest: DIGEST_C,
    bootstrapKeyDigest: DIGEST_A,
    authorityChallengeDigest: DIGEST_B,
    recoveryPublicKeyDigest: DIGEST_D,
    placementPublicKeyDigest: DIGEST_E,
    accountId: ACCOUNT_ID,
    accountBindingDigest: DIGEST_F,
    proofNonce: NONCE,
    bootstrapSignatureBase64: SIGNATURE,
  };
}

function receipt(): PlacementIdentityReceiptV1 {
  return {
    schema: 'PlacementIdentityReceiptV1',
    version: 1,
    transactionId: TRANSACTION_ID,
    delegationId: 'delegation-0001',
    method: 'microsoft',
    accountId: ACCOUNT_ID,
    accountBindingDigest: DIGEST_F,
    identityReceiptDigest: DIGEST_C,
    bootstrapKeyDigest: DIGEST_A,
    identityProofDigest: DIGEST_B,
    issuedAt: ISSUED_AT,
    expiresAt: RECEIPT_EXPIRES_AT,
    absoluteExpiresAt: TRANSACTION_EXPIRES_AT,
    renewalCount: 0,
    maxRenewals: 12,
    signerKeyId: 'placement-authority-v1',
    authoritySignatureBase64: SIGNATURE,
  };
}

function receiptIdentityPreimage(): PlacementIdentityReceiptIdentityPreimageV1 {
  const value = receipt();
  return {
    schema: value.schema,
    version: value.version,
    transactionId: value.transactionId,
    delegationId: value.delegationId,
    method: value.method,
    accountId: value.accountId,
    accountBindingDigest: value.accountBindingDigest,
    bootstrapKeyDigest: value.bootstrapKeyDigest,
    identityProofDigest: value.identityProofDigest,
    absoluteExpiresAt: value.absoluteExpiresAt,
    maxRenewals: value.maxRenewals,
    signerKeyId: value.signerKeyId,
  };
}

function materializationEnvelope(): AccountMaterializationEnvelopeV1 {
  return {
    schema: 'AccountMaterializationEnvelopeV1',
    version: 1,
    purpose: 'placement_account_materialization',
    transactionId: TRANSACTION_ID,
    delegationId: 'delegation-0001',
    method: 'microsoft',
    accountId: ACCOUNT_ID,
    accountBindingDigest: DIGEST_F,
    identityReceiptDigest: DIGEST_C,
    selectionKind: 'imported_legacy',
    legacyManifestId: 'manifest-0001',
    materializationNonce: NONCE,
    issuedAt: ISSUED_AT,
    expiresAt: RECEIPT_EXPIRES_AT,
    signerKeyId: 'placement-authority-v1',
    signature: SIGNATURE,
  };
}

function legacyManifest(): LegacyIdentityBindingManifestV1 {
  return {
    schema: 'LegacyIdentityBindingManifestV1',
    version: 1,
    manifestId: 'manifest-0001',
    idempotencyKey: 'import-0001',
    createdAt: ISSUED_AT,
    expiresAt: MANIFEST_EXPIRES_AT,
    entriesDigest: DIGEST_G,
    entries: [
      {
        accountId: ACCOUNT_ID,
        method: 'microsoft',
        issuerDigest: DIGEST_A,
        subjectDigest: DIGEST_B,
        accountBindingDigest: DIGEST_F,
        normalizedEmailDigest: DIGEST_H,
        sourceRecordDigest: DIGEST_C,
      },
    ],
    signerKeyId: 'placement-authority-v1',
    signature: SIGNATURE,
  };
}

function operationResult(): PlacementIdentityOperationResultV1 {
  return {
    schema: 'PlacementIdentityOperationResultV1',
    version: 1,
    requestId: 'request-0001',
    operationId: 'operation-0001',
    transactionId: TRANSACTION_ID,
    state: 'pending',
    resultCode: 'PLACEMENT_IDENTITY_PENDING',
    resultDigest: DIGEST_D,
  };
}

function operationRecord(): PlacementIdentityOperationRecordV1 {
  const pendingResultCanonicalBytesBase64 = Buffer.from(
    canonicalPlacementIdentityOperationResultV1(operationResult()),
  ).toString('base64');
  return {
    schema: 'PlacementIdentityOperationRecordV1',
    version: 1,
    requestId: 'request-0001',
    operationId: 'operation-0001',
    transactionId: TRANSACTION_ID,
    proofDigest: DIGEST_E,
    consumedProofNonce: NONCE,
    state: 'pending',
    pendingResultCanonicalBytesBase64,
    createdAt: ISSUED_AT,
    expiresAt: TRANSACTION_EXPIRES_AT,
  };
}

function terminalOperationRecord(
  state: 'succeeded' | 'failed',
): PlacementIdentityOperationRecordV1 {
  const result =
    state === 'succeeded'
      ? {
          ...operationResult(),
          state: 'succeeded' as const,
          resultCode: 'PLACEMENT_IDENTITY_ACCEPTED' as const,
        }
      : {
          ...operationResult(),
          state: 'failed' as const,
          resultCode: 'PLACEMENT_IDENTITY_OPERATION_CONFLICT' as const,
        };
  return {
    ...operationRecord(),
    state,
    pendingResultCanonicalBytesBase64: undefined,
    finalResultCanonicalBytesBase64: Buffer.from(
      canonicalPlacementIdentityOperationResultV1(result),
    ).toString('base64'),
  };
}

function emailChallenge(): PlacementIdentityEmailChallengeV1 {
  return {
    schema: 'PlacementIdentityEmailChallengeV1',
    version: 1,
    transactionId: TRANSACTION_ID,
    delegationId: 'delegation-0001',
    bootstrapKeyDigest: DIGEST_A,
    handle: 'opaque-email-handle-0001',
    issuedAt: ISSUED_AT,
    expiresAt: RECEIPT_EXPIRES_AT,
    signerKeyId: 'placement-authority-v1',
    authoritySignatureBase64: SIGNATURE,
  };
}

function emailRedemption(): PlacementIdentityEmailRedemptionRequestV1 {
  return {
    schema: 'PlacementIdentityEmailRedemptionRequestV1',
    version: 1,
    handle: 'opaque-email-handle-0001',
    transactionId: TRANSACTION_ID,
    delegationId: 'delegation-0001',
    bootstrapKeyDigest: DIGEST_A,
    redemptionNonce: NONCE,
    bootstrapSignatureBase64: SIGNATURE,
  };
}

function emailOutcome(): PlacementIdentityEmailRedemptionOutcomeV1 {
  return {
    schema: 'PlacementIdentityEmailRedemptionOutcomeV1',
    version: 1,
    transactionId: TRANSACTION_ID,
    handleDigest: DIGEST_H,
    resultCode: 'PLACEMENT_IDENTITY_EMAIL_ACCEPTED',
    identityReceiptDigest: DIGEST_C,
    accountBindingDigest: DIGEST_F,
  };
}

describe('provider-neutral placement identity contracts', () => {
  it('accepts the complete strict versioned contract family', () => {
    expect(placementIdentityMethodV1Schema.parse('google')).toBe('google');
    expect(placementIdentityBeginRequestV1Schema.parse(beginRequest())).toEqual(beginRequest());
    expect(placementIdentityAuthDelegationV1Schema.parse(delegation())).toEqual(delegation());
    expect(placementIdentityBootstrapProofV1Schema.parse(bootstrapProof())).toEqual(
      bootstrapProof(),
    );
    expect(placementIdentityReceiptV1Schema.parse(receipt())).toEqual(receipt());
    expect(accountMaterializationEnvelopeV1Schema.parse(materializationEnvelope())).toEqual(
      materializationEnvelope(),
    );
    expect(legacyIdentityBindingManifestV1Schema.parse(legacyManifest())).toEqual(legacyManifest());
    expect(placementIdentityOperationResultV1Schema.parse(operationResult())).toEqual(
      operationResult(),
    );
    expect(placementIdentityOperationRecordV1Schema.parse(operationRecord())).toEqual(
      operationRecord(),
    );
    for (const state of ['succeeded', 'failed'] as const) {
      expect(
        placementIdentityOperationRecordV1Schema.parse(terminalOperationRecord(state)),
      ).toEqual(terminalOperationRecord(state));
    }
    expect(placementIdentityEmailChallengeV1Schema.parse(emailChallenge())).toEqual(
      emailChallenge(),
    );
    expect(placementIdentityEmailRedemptionRequestV1Schema.parse(emailRedemption())).toEqual(
      emailRedemption(),
    );
    expect(placementIdentityEmailRedemptionOutcomeV1Schema.parse(emailOutcome())).toEqual(
      emailOutcome(),
    );
  });

  it('requires the full canonical SPKI and matching digest fields in wire shapes', () => {
    expect(() =>
      placementIdentityBeginRequestV1Schema.parse({
        ...beginRequest(),
        bootstrapPublicKeySpki: undefined,
      }),
    ).toThrow();
    expect(() =>
      placementIdentityBeginRequestV1Schema.parse({
        ...beginRequest(),
        bootstrapKeyDigest: undefined,
      }),
    ).toThrow();
    expect(delegation().bootstrapPublicKeySpki).toBe(SPKI);
    expect(delegation().bootstrapKeyDigest).toBe(DIGEST_A);
    expect(() => placementIdentityNonceV1Schema.parse('AA==')).toThrow();
  });

  it('rejects unknown fields, wrong versions, missing fields, and forbidden raw values', () => {
    expect(() =>
      placementIdentityBeginRequestV1Schema.parse({ ...beginRequest(), extra: true }),
    ).toThrow();
    expect(() =>
      placementIdentityAuthDelegationV1Schema.parse({ ...delegation(), version: 2 }),
    ).toThrow();
    expect(() =>
      placementIdentityBootstrapProofV1Schema.parse({ ...bootstrapProof(), proofNonce: undefined }),
    ).toThrow();
    expect(() =>
      placementIdentityReceiptV1Schema.parse({ ...receipt(), providerToken: 'token' }),
    ).toThrow();
    expect(() =>
      accountMaterializationEnvelopeV1Schema.parse({
        ...materializationEnvelope(),
        privateKey: 'secret',
      }),
    ).toThrow();
    expect(() =>
      legacyIdentityBindingEntryV1Schema.parse({
        ...legacyManifest().entries[0],
        email: 'person@example.com',
      }),
    ).toThrow();
    expect(() =>
      placementIdentityEmailRedemptionRequestV1Schema.parse({
        ...emailRedemption(),
        authorizationCode: 'code',
      }),
    ).toThrow();
    expect(() =>
      placementIdentityEmailRedemptionOutcomeV1Schema.parse({
        ...emailOutcome(),
        message: 'raw error',
      }),
    ).toThrow();
  });

  it('enforces timestamp, transaction, receipt, and renewal bounds', () => {
    expect(placementIdentityTimestampV1Schema.parse(ISSUED_AT)).toBe(ISSUED_AT);
    expect(() => placementIdentityTimestampV1Schema.parse('2026-08-25T00:00:00Z')).toThrow();
    expect(() =>
      placementIdentityAuthDelegationV1Schema.parse({
        ...delegation(),
        absoluteExpiresAt: '2026-08-25T01:00:00.001Z',
      }),
    ).toThrow();
    expect(() =>
      placementIdentityReceiptV1Schema.parse({
        ...receipt(),
        expiresAt: '2026-08-25T00:05:00.001Z',
      }),
    ).toThrow();
    expect(() =>
      placementIdentityReceiptV1Schema.parse({ ...receipt(), renewalCount: 13 }),
    ).toThrow();
    expect(() =>
      placementIdentityReceiptV1Schema.parse({ ...receipt(), absoluteExpiresAt: ISSUED_AT }),
    ).toThrow();
    expect(
      placementIdentityReceiptV1Schema.parse({
        ...receipt(),
        absoluteExpiresAt: TRANSACTION_EXPIRES_AT,
      }).absoluteExpiresAt,
    ).toBe(TRANSACTION_EXPIRES_AT);
    expect(() =>
      placementIdentityReceiptV1Schema.parse({
        ...receipt(),
        absoluteExpiresAt: '2026-08-25T01:00:00.001Z',
      }),
    ).toThrow();
    expect(() =>
      placementIdentityOperationRecordV1Schema.parse({
        ...operationRecord(),
        expiresAt: '2026-08-25T01:00:00.001Z',
      }),
    ).toThrow();
    expect(() =>
      placementIdentityReceiptRenewalRequestV1Schema.parse({
        schema: 'PlacementIdentityReceiptRenewalRequestV1',
        version: 1,
        transactionId: TRANSACTION_ID,
        bootstrapKeyDigest: DIGEST_A,
        currentReceiptDigest: DIGEST_B,
        expectedRenewalCount: 13,
        renewalNonce: NONCE,
        bootstrapSignatureBase64: SIGNATURE,
      }),
    ).toThrow();
  });

  it('enforces fixed result and account-selection shapes', () => {
    expect(() =>
      placementIdentityOperationResultV1Schema.parse({
        ...operationResult(),
        resultCode: 'PLACEMENT_IDENTITY_ACCEPTED',
      }),
    ).toThrow();
    expect(() =>
      accountMaterializationEnvelopeV1Schema.parse({
        ...materializationEnvelope(),
        selectionKind: 'new_uuid',
      }),
    ).toThrow();
    expect(() =>
      accountMaterializationEnvelopeV1Schema.parse({
        ...materializationEnvelope(),
        legacyManifestId: undefined,
      }),
    ).toThrow();
    expect(() =>
      placementIdentityEmailRedemptionOutcomeV1Schema.parse({
        ...emailOutcome(),
        resultCode: 'PLACEMENT_IDENTITY_EMAIL_INVALID',
      }),
    ).toThrow();
  });

  it('keeps operation lifecycle requests bounded and strict without implementing state', () => {
    expect(
      placementIdentityRevokeRequestV1Schema.parse({
        schema: 'PlacementIdentityRevokeRequestV1',
        version: 1,
        transactionId: TRANSACTION_ID,
        bootstrapKeyDigest: DIGEST_A,
        revokeNonce: NONCE,
        reason: 'logout',
        bootstrapSignatureBase64: SIGNATURE,
      }).reason,
    ).toBe('logout');
    expect(
      placementIdentityConsumeRequestV1Schema.parse({
        schema: 'PlacementIdentityConsumeRequestV1',
        version: 1,
        requestId: 'request-0001',
        transactionId: TRANSACTION_ID,
        bootstrapKeyDigest: DIGEST_A,
        currentReceiptDigest: DIGEST_B,
        proofDigest: DIGEST_C,
        consumedProofNonce: NONCE,
      }).proofDigest,
    ).toBe(DIGEST_C);
  });

  it('parses only the stable receipt identity preimage and rejects fixed or malformed fields', () => {
    expect(
      placementIdentityReceiptIdentityPreimageV1Schema.parse(receiptIdentityPreimage()),
    ).toEqual(receiptIdentityPreimage());
    expect(
      placementIdentityReceiptDigestV1({ ...receipt(), identityReceiptDigest: DIGEST_D }),
    ).toBe(placementIdentityReceiptDigestV1(receipt()));
    expect(placementIdentityReceiptDigestV1(receiptIdentityPreimage())).toBe(
      placementIdentityReceiptDigestV1(receipt()),
    );

    const rejections: ReadonlyArray<Record<string, unknown>> = [
      { ...receiptIdentityPreimage(), schema: 'PlacementIdentityReceiptV2' },
      { ...receiptIdentityPreimage(), version: 2 },
      { ...receiptIdentityPreimage(), maxRenewals: 13 },
      { ...receiptIdentityPreimage(), maxRenewals: 11 },
      { ...receiptIdentityPreimage(), transactionId: 'not-a-uuid' },
      { ...receiptIdentityPreimage(), accountId: 'not-a-uuid' },
      { ...receiptIdentityPreimage(), delegationId: '' },
      { ...receiptIdentityPreimage(), signerKeyId: 'not a canonical identifier' },
      { ...receiptIdentityPreimage(), accountBindingDigest: 'A'.repeat(64) },
      { ...receiptIdentityPreimage(), bootstrapKeyDigest: DIGEST_A.slice(0, 63) },
      { ...receiptIdentityPreimage(), identityProofDigest: `${DIGEST_B}0` },
      { ...receiptIdentityPreimage(), absoluteExpiresAt: '2026-08-25T01:00:00Z' },
      { ...receiptIdentityPreimage(), issuedAt: ISSUED_AT },
      { ...receiptIdentityPreimage(), identityReceiptDigest: DIGEST_C },
      { ...receiptIdentityPreimage(), extra: true },
    ];
    for (const value of rejections) {
      expect(placementIdentityReceiptIdentityPreimageV1Schema.safeParse(value).success).toBe(false);
      expect(() => canonicalPlacementIdentityReceiptIdentityPreimageV1(value as never)).toThrow();
    }
  });

  it('uses the same strict parse before canonical delegation bytes', () => {
    expect(canonicalPlacementIdentityAuthDelegationV1(delegation())).toEqual(
      canonicalPlacementIdentityAuthDelegationV1({
        ...delegation(),
        authoritySignatureBase64: SIGNATURE,
      }),
    );
    expect(() =>
      canonicalPlacementIdentityAuthDelegationV1({ ...delegation(), unknown: 'field' } as never),
    ).toThrow();
  });
});
