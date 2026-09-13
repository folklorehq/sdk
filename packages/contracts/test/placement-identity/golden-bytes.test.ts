// SPDX-License-Identifier: Apache-2.0
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';

import {
  canonicalPlacementIdentityAuthDelegationSignaturePreimageV1,
  canonicalPlacementIdentityAuthDelegationV1,
  canonicalPlacementIdentityBeginRequestV1,
  canonicalPlacementIdentityBootstrapProofSignaturePreimageV1,
  canonicalPlacementIdentityBootstrapProofV1,
  type PlacementIdentityAuthDelegationV1,
  type PlacementIdentityBeginRequestV1,
  type PlacementIdentityBootstrapProofV1,
} from '../../src/placement-identity/bootstrap.js';
import {
  canonicalAccountMaterializationEnvelopeSignaturePreimageV1,
  canonicalAccountMaterializationEnvelopeV1,
  canonicalLegacyIdentityBindingManifestSignaturePreimageV1,
  canonicalLegacyIdentityBindingManifestV1,
  canonicalPlacementIdentityReceiptIdentityPreimageV1,
  canonicalPlacementIdentityReceiptSignaturePreimageV1,
  canonicalPlacementIdentityReceiptV1,
  PLACEMENT_IDENTITY_RECEIPT_IDENTITY_DIGEST_DOMAIN_V1,
  placementIdentityReceiptDigestV1,
  type LegacyIdentityBindingEntryV1,
  type AccountMaterializationEnvelopeV1,
  type LegacyIdentityBindingManifestV1,
  type PlacementIdentityReceiptIdentityPreimageV1,
  type PlacementIdentityReceiptV1,
} from '../../src/placement-identity/account-binding.js';
import {
  canonicalPlacementIdentityEmailChallengeSignaturePreimageV1,
  canonicalPlacementIdentityEmailChallengeV1,
  canonicalPlacementIdentityEmailRedemptionOutcomeV1,
  canonicalPlacementIdentityEmailRedemptionRequestSignaturePreimageV1,
  canonicalPlacementIdentityEmailRedemptionRequestV1,
  type PlacementIdentityEmailChallengeV1,
  type PlacementIdentityEmailRedemptionOutcomeV1,
  type PlacementIdentityEmailRedemptionRequestV1,
} from '../../src/placement-identity/email.js';
import {
  canonicalPlacementIdentityConsumeRequestV1,
  canonicalPlacementIdentityOperationRecordV1,
  canonicalPlacementIdentityOperationResultV1,
  canonicalPlacementIdentityReceiptRenewalRequestV1,
  canonicalPlacementIdentityReceiptRenewalRequestSignaturePreimageV1,
  canonicalPlacementIdentityRevokeRequestV1,
  canonicalPlacementIdentityRevokeRequestSignaturePreimageV1,
  type PlacementIdentityOperationRecordV1,
  type PlacementIdentityOperationResultV1,
  type PlacementIdentityReceiptRenewalRequestV1,
  type PlacementIdentityRevokeRequestV1,
  type PlacementIdentityConsumeRequestV1,
} from '../../src/placement-identity/operation.js';

const SPKI = 'MCowBQYDK2VwAyEAONJrM8mqpI4ZALNnVQHweHj6nRa37GeVBgF7w/L0pWY=';
const OTHER_SPKI = `MCowBQYDK2VwAyEA${'Q'.repeat(43)}=`;
const SIGNATURE = `${'A'.repeat(86)}==`;
const OTHER_SIGNATURE = Buffer.alloc(64, 1).toString('base64');
const NONCE = Buffer.alloc(32).toString('base64');
const OTHER_NONCE = Buffer.alloc(32, 1).toString('base64');
const TRANSACTION_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_TRANSACTION_ID = '00000000-0000-4000-8000-000000000002';
const ACCOUNT_ID = '00000000-0000-4000-8000-000000000003';
const OTHER_ACCOUNT_ID = '00000000-0000-4000-8000-000000000004';
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

function text(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

type FieldMutation<T> = readonly [string, (value: T) => T];

function expectChangedFields<T>(
  original: T,
  canonical: (value: T) => Uint8Array,
  changes: readonly FieldMutation<T>[],
): void {
  const originalBytes = bytesToHex(canonical(original));
  for (const [, mutate] of changes) {
    expect(bytesToHex(canonical(mutate(original)))).not.toBe(originalBytes);
  }
}

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

function proof(): PlacementIdentityBootstrapProofV1 {
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

// Independent literal vectors computed outside the implementation under test.
const RECEIPT_IDENTITY_PREIMAGE_HEX =
  '0000000c0000001a506c6163656d656e744964656e746974795265636569707456310000000131' +
  '0000002430303030303030302d303030302d343030302d383030302d3030303030303030303030' +
  '310000000f64656c65676174696f6e2d30303031000000096d6963726f736f66740000002430' +
  '303030303030302d303030302d343030302d383030302d303030303030303030303033000000' +
  `40${'66'.repeat(64)}00000040${'61'.repeat(64)}00000040${'62'.repeat(64)}` +
  '00000018323032362d30382d32355430313a30303a30302e3030305a00000002313200000016' +
  '706c6163656d656e742d617574686f726974792d7631';
const RECEIPT_IDENTITY_DIGEST = 'c86dc7b642d7d056cd67dfd5a9a73668be30543bd4a0a62b8ca93901d1a3244f';

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

function materialization(): AccountMaterializationEnvelopeV1 {
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

function manifest(): LegacyIdentityBindingManifestV1 {
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

function manifestWithEntry(
  changes: Partial<LegacyIdentityBindingEntryV1>,
): LegacyIdentityBindingManifestV1 {
  const value = manifest();
  return {
    ...value,
    entries: value.entries.map((entry, index) => (index === 0 ? { ...entry, ...changes } : entry)),
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
  return {
    schema: 'PlacementIdentityOperationRecordV1',
    version: 1,
    requestId: 'request-0001',
    operationId: 'operation-0001',
    transactionId: TRANSACTION_ID,
    proofDigest: DIGEST_E,
    consumedProofNonce: NONCE,
    state: 'pending',
    pendingResultCanonicalBytesBase64: Buffer.from(
      canonicalPlacementIdentityOperationResultV1(operationResult()),
    ).toString('base64'),
    createdAt: ISSUED_AT,
    expiresAt: TRANSACTION_EXPIRES_AT,
  };
}

function terminalOperationResult(
  state: 'succeeded' | 'failed',
): PlacementIdentityOperationResultV1 {
  if (state === 'succeeded') {
    return {
      ...operationResult(),
      state: 'succeeded',
      resultCode: 'PLACEMENT_IDENTITY_ACCEPTED',
    };
  }
  return {
    ...operationResult(),
    state: 'failed',
    resultCode: 'PLACEMENT_IDENTITY_OPERATION_CONFLICT',
  };
}

function terminalOperationRecord(
  state: 'succeeded' | 'failed',
): PlacementIdentityOperationRecordV1 {
  return {
    ...operationRecord(),
    state,
    pendingResultCanonicalBytesBase64: undefined,
    finalResultCanonicalBytesBase64: Buffer.from(
      canonicalPlacementIdentityOperationResultV1(terminalOperationResult(state)),
    ).toString('base64'),
  };
}

function renewalRequest(): PlacementIdentityReceiptRenewalRequestV1 {
  return {
    schema: 'PlacementIdentityReceiptRenewalRequestV1',
    version: 1,
    transactionId: TRANSACTION_ID,
    bootstrapKeyDigest: DIGEST_A,
    currentReceiptDigest: DIGEST_B,
    expectedRenewalCount: 1,
    renewalNonce: NONCE,
    bootstrapSignatureBase64: SIGNATURE,
  };
}

function revokeRequest(): PlacementIdentityRevokeRequestV1 {
  return {
    schema: 'PlacementIdentityRevokeRequestV1',
    version: 1,
    transactionId: TRANSACTION_ID,
    bootstrapKeyDigest: DIGEST_A,
    revokeNonce: NONCE,
    reason: 'logout',
    bootstrapSignatureBase64: SIGNATURE,
  };
}

function consumeRequest(): PlacementIdentityConsumeRequestV1 {
  return {
    schema: 'PlacementIdentityConsumeRequestV1',
    version: 1,
    requestId: 'request-0001',
    transactionId: TRANSACTION_ID,
    bootstrapKeyDigest: DIGEST_A,
    currentReceiptDigest: DIGEST_B,
    proofDigest: DIGEST_C,
    consumedProofNonce: NONCE,
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

describe('provider-neutral placement identity golden bytes', () => {
  it('matches fixed begin, delegation, and bootstrap-proof preimages', () => {
    expect(text(canonicalPlacementIdentityBeginRequestV1(beginRequest()))).toBe(
      JSON.stringify([
        'PlacementIdentityBeginRequestV1',
        1,
        TRANSACTION_ID,
        'microsoft',
        SPKI,
        DIGEST_A,
      ]),
    );
    expect(text(canonicalPlacementIdentityAuthDelegationSignaturePreimageV1(delegation()))).toBe(
      JSON.stringify([
        'PlacementIdentityAuthDelegationV1',
        1,
        TRANSACTION_ID,
        'delegation-0001',
        'microsoft',
        SPKI,
        DIGEST_A,
        NONCE,
        DIGEST_B,
        ISSUED_AT,
        TRANSACTION_EXPIRES_AT,
        'active',
      ]),
    );
    expect(text(canonicalPlacementIdentityBootstrapProofSignaturePreimageV1(proof()))).toBe(
      JSON.stringify([
        'PlacementIdentityBootstrapProofV1',
        1,
        'placement_identity_bootstrap',
        TRANSACTION_ID,
        'delegation-0001',
        DIGEST_C,
        DIGEST_A,
        DIGEST_B,
        DIGEST_D,
        DIGEST_E,
        ACCOUNT_ID,
        DIGEST_F,
        NONCE,
      ]),
    );
  });

  it('matches independent literal full-artifact UTF-8 vectors', () => {
    const cases: ReadonlyArray<readonly [string, () => Uint8Array, string]> = [
      [
        'auth delegation',
        () => canonicalPlacementIdentityAuthDelegationV1(delegation()),
        '{"absoluteExpiresAt":"2026-08-25T01:00:00.000Z","authorityNonce":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","authoritySignatureBase64":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==","bootstrapKeyDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","bootstrapPublicKeySpki":"MCowBQYDK2VwAyEAONJrM8mqpI4ZALNnVQHweHj6nRa37GeVBgF7w/L0pWY=","callbackBindingDigest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","createdAt":"2026-08-25T00:00:00.000Z","delegationId":"delegation-0001","method":"microsoft","oneUseState":"active","schema":"PlacementIdentityAuthDelegationV1","transactionId":"00000000-0000-4000-8000-000000000001","version":1}',
      ],
      [
        'bootstrap proof',
        () => canonicalPlacementIdentityBootstrapProofV1(proof()),
        '{"accountBindingDigest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","accountId":"00000000-0000-4000-8000-000000000003","authorityChallengeDigest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","bootstrapKeyDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","bootstrapSignatureBase64":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==","delegationId":"delegation-0001","identityReceiptDigest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","placementPublicKeyDigest":"eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee","proofNonce":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","purpose":"placement_identity_bootstrap","recoveryPublicKeyDigest":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd","schema":"PlacementIdentityBootstrapProofV1","transactionId":"00000000-0000-4000-8000-000000000001","version":1}',
      ],
      [
        'receipt',
        () => canonicalPlacementIdentityReceiptV1(receipt()),
        '{"absoluteExpiresAt":"2026-08-25T01:00:00.000Z","accountBindingDigest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","accountId":"00000000-0000-4000-8000-000000000003","authoritySignatureBase64":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==","bootstrapKeyDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","delegationId":"delegation-0001","expiresAt":"2026-08-25T00:05:00.000Z","identityProofDigest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","identityReceiptDigest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","issuedAt":"2026-08-25T00:00:00.000Z","maxRenewals":12,"method":"microsoft","renewalCount":0,"schema":"PlacementIdentityReceiptV1","signerKeyId":"placement-authority-v1","transactionId":"00000000-0000-4000-8000-000000000001","version":1}',
      ],
      [
        'materialization envelope',
        () => canonicalAccountMaterializationEnvelopeV1(materialization()),
        '{"accountBindingDigest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","accountId":"00000000-0000-4000-8000-000000000003","delegationId":"delegation-0001","expiresAt":"2026-08-25T00:05:00.000Z","identityReceiptDigest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","issuedAt":"2026-08-25T00:00:00.000Z","legacyManifestId":"manifest-0001","materializationNonce":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","method":"microsoft","purpose":"placement_account_materialization","schema":"AccountMaterializationEnvelopeV1","selectionKind":"imported_legacy","signature":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==","signerKeyId":"placement-authority-v1","transactionId":"00000000-0000-4000-8000-000000000001","version":1}',
      ],
      [
        'legacy binding manifest',
        () => canonicalLegacyIdentityBindingManifestV1(manifest()),
        '{"createdAt":"2026-08-25T00:00:00.000Z","entries":[{"accountBindingDigest":"ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff","accountId":"00000000-0000-4000-8000-000000000003","issuerDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","method":"microsoft","normalizedEmailDigest":"2222222222222222222222222222222222222222222222222222222222222222","sourceRecordDigest":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc","subjectDigest":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"}],"entriesDigest":"1111111111111111111111111111111111111111111111111111111111111111","expiresAt":"2026-08-26T00:00:00.000Z","idempotencyKey":"import-0001","manifestId":"manifest-0001","schema":"LegacyIdentityBindingManifestV1","signature":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==","signerKeyId":"placement-authority-v1","version":1}',
      ],
      [
        'email challenge',
        () => canonicalPlacementIdentityEmailChallengeV1(emailChallenge()),
        '{"authoritySignatureBase64":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==","bootstrapKeyDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","delegationId":"delegation-0001","expiresAt":"2026-08-25T00:05:00.000Z","handle":"opaque-email-handle-0001","issuedAt":"2026-08-25T00:00:00.000Z","schema":"PlacementIdentityEmailChallengeV1","signerKeyId":"placement-authority-v1","transactionId":"00000000-0000-4000-8000-000000000001","version":1}',
      ],
      [
        'email redemption request',
        () => canonicalPlacementIdentityEmailRedemptionRequestV1(emailRedemption()),
        '{"bootstrapKeyDigest":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","bootstrapSignatureBase64":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==","delegationId":"delegation-0001","handle":"opaque-email-handle-0001","redemptionNonce":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","schema":"PlacementIdentityEmailRedemptionRequestV1","transactionId":"00000000-0000-4000-8000-000000000001","version":1}',
      ],
    ];
    for (const [, canonical, expected] of cases) {
      expect(text(canonical())).toBe(expected);
    }
  });

  it('changes bootstrap proof bytes when every proof binding field changes', () => {
    const original = proof();
    const originalBytes = bytesToHex(
      canonicalPlacementIdentityBootstrapProofSignaturePreimageV1(original),
    );
    const changes: ReadonlyArray<readonly [keyof PlacementIdentityBootstrapProofV1, string]> = [
      ['transactionId', OTHER_TRANSACTION_ID],
      ['delegationId', 'delegation-0002'],
      ['identityReceiptDigest', DIGEST_D],
      ['bootstrapKeyDigest', DIGEST_B],
      ['authorityChallengeDigest', DIGEST_C],
      ['recoveryPublicKeyDigest', DIGEST_E],
      ['placementPublicKeyDigest', DIGEST_F],
      ['accountId', OTHER_ACCOUNT_ID],
      ['accountBindingDigest', DIGEST_G],
      ['proofNonce', Buffer.alloc(32, 1).toString('base64')],
    ];
    for (const [field, replacement] of changes) {
      const changed = { ...original, [field]: replacement } as PlacementIdentityBootstrapProofV1;
      expect(
        bytesToHex(canonicalPlacementIdentityBootstrapProofSignaturePreimageV1(changed)),
      ).not.toBe(originalBytes);
    }
  });

  it('changes canonical bytes for every mutable security-bound field', () => {
    expectChangedFields(beginRequest(), canonicalPlacementIdentityBeginRequestV1, [
      ['transactionId', (value) => ({ ...value, transactionId: OTHER_TRANSACTION_ID })],
      ['method', (value) => ({ ...value, method: 'google' })],
      ['bootstrapPublicKeySpki', (value) => ({ ...value, bootstrapPublicKeySpki: OTHER_SPKI })],
      ['bootstrapKeyDigest', (value) => ({ ...value, bootstrapKeyDigest: DIGEST_B })],
    ]);
    expectChangedFields(delegation(), canonicalPlacementIdentityAuthDelegationSignaturePreimageV1, [
      ['transactionId', (value) => ({ ...value, transactionId: OTHER_TRANSACTION_ID })],
      ['delegationId', (value) => ({ ...value, delegationId: 'delegation-0002' })],
      ['method', (value) => ({ ...value, method: 'google' })],
      ['bootstrapPublicKeySpki', (value) => ({ ...value, bootstrapPublicKeySpki: OTHER_SPKI })],
      ['bootstrapKeyDigest', (value) => ({ ...value, bootstrapKeyDigest: DIGEST_B })],
      ['authorityNonce', (value) => ({ ...value, authorityNonce: OTHER_NONCE })],
      ['callbackBindingDigest', (value) => ({ ...value, callbackBindingDigest: DIGEST_C })],
      ['createdAt', (value) => ({ ...value, createdAt: '2026-08-25T00:00:00.001Z' })],
      [
        'absoluteExpiresAt',
        (value) => ({ ...value, absoluteExpiresAt: '2026-08-25T00:59:59.999Z' }),
      ],
      ['oneUseState', (value) => ({ ...value, oneUseState: 'consumed' })],
    ]);
    expectChangedFields(receipt(), canonicalPlacementIdentityReceiptSignaturePreimageV1, [
      ['transactionId', (value) => ({ ...value, transactionId: OTHER_TRANSACTION_ID })],
      ['delegationId', (value) => ({ ...value, delegationId: 'delegation-0002' })],
      ['method', (value) => ({ ...value, method: 'google' })],
      ['accountId', (value) => ({ ...value, accountId: OTHER_ACCOUNT_ID })],
      ['accountBindingDigest', (value) => ({ ...value, accountBindingDigest: DIGEST_G })],
      ['identityReceiptDigest', (value) => ({ ...value, identityReceiptDigest: DIGEST_D })],
      ['bootstrapKeyDigest', (value) => ({ ...value, bootstrapKeyDigest: DIGEST_B })],
      ['identityProofDigest', (value) => ({ ...value, identityProofDigest: DIGEST_E })],
      ['issuedAt', (value) => ({ ...value, issuedAt: '2026-08-25T00:00:00.001Z' })],
      ['expiresAt', (value) => ({ ...value, expiresAt: '2026-08-25T00:04:59.999Z' })],
      [
        'absoluteExpiresAt',
        (value) => ({ ...value, absoluteExpiresAt: '2026-08-25T00:59:59.999Z' }),
      ],
      ['renewalCount', (value) => ({ ...value, renewalCount: 1 })],
      ['signerKeyId', (value) => ({ ...value, signerKeyId: 'placement-authority-v2' })],
    ]);
    expectChangedFields(
      materialization(),
      canonicalAccountMaterializationEnvelopeSignaturePreimageV1,
      [
        ['transactionId', (value) => ({ ...value, transactionId: OTHER_TRANSACTION_ID })],
        ['delegationId', (value) => ({ ...value, delegationId: 'delegation-0002' })],
        ['method', (value) => ({ ...value, method: 'google' })],
        ['accountId', (value) => ({ ...value, accountId: OTHER_ACCOUNT_ID })],
        ['accountBindingDigest', (value) => ({ ...value, accountBindingDigest: DIGEST_G })],
        ['identityReceiptDigest', (value) => ({ ...value, identityReceiptDigest: DIGEST_D })],
        [
          'selectionKind',
          (value) => ({ ...value, selectionKind: 'new_uuid', legacyManifestId: undefined }),
        ],
        ['legacyManifestId', (value) => ({ ...value, legacyManifestId: 'manifest-0002' })],
        ['materializationNonce', (value) => ({ ...value, materializationNonce: OTHER_NONCE })],
        ['issuedAt', (value) => ({ ...value, issuedAt: '2026-08-25T00:00:00.001Z' })],
        ['expiresAt', (value) => ({ ...value, expiresAt: '2026-08-25T00:04:59.999Z' })],
        ['signerKeyId', (value) => ({ ...value, signerKeyId: 'placement-authority-v2' })],
      ],
    );
    expectChangedFields(manifest(), canonicalLegacyIdentityBindingManifestSignaturePreimageV1, [
      ['manifestId', (value) => ({ ...value, manifestId: 'manifest-0002' })],
      ['idempotencyKey', (value) => ({ ...value, idempotencyKey: 'import-0002' })],
      ['createdAt', (value) => ({ ...value, createdAt: '2026-08-25T00:00:00.001Z' })],
      ['expiresAt', (value) => ({ ...value, expiresAt: '2026-08-27T00:00:00.000Z' })],
      ['entriesDigest', (value) => ({ ...value, entriesDigest: DIGEST_H })],
      ['entry accountId', () => manifestWithEntry({ accountId: OTHER_ACCOUNT_ID })],
      ['entry method', () => manifestWithEntry({ method: 'google' })],
      ['entry issuerDigest', () => manifestWithEntry({ issuerDigest: DIGEST_D })],
      ['entry subjectDigest', () => manifestWithEntry({ subjectDigest: DIGEST_E })],
      ['entry accountBindingDigest', () => manifestWithEntry({ accountBindingDigest: DIGEST_G })],
      [
        'entry normalizedEmailDigest',
        () => manifestWithEntry({ normalizedEmailDigest: undefined }),
      ],
      ['entry sourceRecordDigest', () => manifestWithEntry({ sourceRecordDigest: DIGEST_D })],
      ['signerKeyId', (value) => ({ ...value, signerKeyId: 'placement-authority-v2' })],
    ]);
    expectChangedFields(
      renewalRequest(),
      canonicalPlacementIdentityReceiptRenewalRequestSignaturePreimageV1,
      [
        ['transactionId', (value) => ({ ...value, transactionId: OTHER_TRANSACTION_ID })],
        ['bootstrapKeyDigest', (value) => ({ ...value, bootstrapKeyDigest: DIGEST_C })],
        ['currentReceiptDigest', (value) => ({ ...value, currentReceiptDigest: DIGEST_D })],
        ['expectedRenewalCount', (value) => ({ ...value, expectedRenewalCount: 2 })],
        ['renewalNonce', (value) => ({ ...value, renewalNonce: OTHER_NONCE })],
      ],
    );
    expectChangedFields(
      revokeRequest(),
      canonicalPlacementIdentityRevokeRequestSignaturePreimageV1,
      [
        ['transactionId', (value) => ({ ...value, transactionId: OTHER_TRANSACTION_ID })],
        ['bootstrapKeyDigest', (value) => ({ ...value, bootstrapKeyDigest: DIGEST_C })],
        ['revokeNonce', (value) => ({ ...value, revokeNonce: OTHER_NONCE })],
        ['reason', (value) => ({ ...value, reason: 'cancel' })],
      ],
    );
    expectChangedFields(
      emailChallenge(),
      canonicalPlacementIdentityEmailChallengeSignaturePreimageV1,
      [
        ['transactionId', (value) => ({ ...value, transactionId: OTHER_TRANSACTION_ID })],
        ['delegationId', (value) => ({ ...value, delegationId: 'delegation-0002' })],
        ['bootstrapKeyDigest', (value) => ({ ...value, bootstrapKeyDigest: DIGEST_B })],
        ['handle', (value) => ({ ...value, handle: 'opaque-email-handle-0002' })],
        ['issuedAt', (value) => ({ ...value, issuedAt: '2026-08-25T00:00:00.001Z' })],
        ['expiresAt', (value) => ({ ...value, expiresAt: '2026-08-25T00:04:59.999Z' })],
        ['signerKeyId', (value) => ({ ...value, signerKeyId: 'placement-authority-v2' })],
      ],
    );
    expectChangedFields(
      emailRedemption(),
      canonicalPlacementIdentityEmailRedemptionRequestSignaturePreimageV1,
      [
        ['handle', (value) => ({ ...value, handle: 'opaque-email-handle-0002' })],
        ['transactionId', (value) => ({ ...value, transactionId: OTHER_TRANSACTION_ID })],
        ['delegationId', (value) => ({ ...value, delegationId: 'delegation-0002' })],
        ['bootstrapKeyDigest', (value) => ({ ...value, bootstrapKeyDigest: DIGEST_B })],
        ['redemptionNonce', (value) => ({ ...value, redemptionNonce: OTHER_NONCE })],
      ],
    );
  });

  it('matches fixed receipt, operation, materialization, import, and email preimages', () => {
    expect(text(canonicalPlacementIdentityReceiptSignaturePreimageV1(receipt()))).toBe(
      JSON.stringify([
        'PlacementIdentityReceiptV1',
        1,
        TRANSACTION_ID,
        'delegation-0001',
        'microsoft',
        ACCOUNT_ID,
        DIGEST_F,
        DIGEST_C,
        DIGEST_A,
        DIGEST_B,
        ISSUED_AT,
        RECEIPT_EXPIRES_AT,
        TRANSACTION_EXPIRES_AT,
        0,
        12,
        'placement-authority-v1',
      ]),
    );
    expect(text(canonicalPlacementIdentityOperationResultV1(operationResult()))).toBe(
      JSON.stringify([
        'PlacementIdentityOperationResultV1',
        1,
        'request-0001',
        'operation-0001',
        TRANSACTION_ID,
        'pending',
        'PLACEMENT_IDENTITY_PENDING',
        DIGEST_D,
      ]),
    );
    expect(text(canonicalPlacementIdentityOperationRecordV1(operationRecord()))).toBe(
      JSON.stringify([
        'PlacementIdentityOperationRecordV1',
        1,
        'request-0001',
        'operation-0001',
        TRANSACTION_ID,
        DIGEST_E,
        NONCE,
        'pending',
        operationRecord().pendingResultCanonicalBytesBase64,
        null,
        ISSUED_AT,
        TRANSACTION_EXPIRES_AT,
      ]),
    );
    expect(
      text(canonicalAccountMaterializationEnvelopeSignaturePreimageV1(materialization())),
    ).toBe(
      JSON.stringify([
        'AccountMaterializationEnvelopeV1',
        1,
        'placement_account_materialization',
        TRANSACTION_ID,
        'delegation-0001',
        'microsoft',
        ACCOUNT_ID,
        DIGEST_F,
        DIGEST_C,
        'imported_legacy',
        'manifest-0001',
        NONCE,
        ISSUED_AT,
        RECEIPT_EXPIRES_AT,
        'placement-authority-v1',
      ]),
    );
    expect(text(canonicalLegacyIdentityBindingManifestSignaturePreimageV1(manifest()))).toBe(
      JSON.stringify([
        'LegacyIdentityBindingManifestV1',
        1,
        'manifest-0001',
        'import-0001',
        ISSUED_AT,
        MANIFEST_EXPIRES_AT,
        DIGEST_G,
        [
          {
            accountBindingDigest: DIGEST_F,
            accountId: ACCOUNT_ID,
            issuerDigest: DIGEST_A,
            method: 'microsoft',
            normalizedEmailDigest: DIGEST_H,
            sourceRecordDigest: DIGEST_C,
            subjectDigest: DIGEST_B,
          },
        ],
        'placement-authority-v1',
      ]),
    );
    expect(
      text(canonicalPlacementIdentityReceiptRenewalRequestSignaturePreimageV1(renewalRequest())),
    ).toBe(
      JSON.stringify([
        'PlacementIdentityReceiptRenewalRequestV1',
        1,
        TRANSACTION_ID,
        DIGEST_A,
        DIGEST_B,
        1,
        NONCE,
      ]),
    );
    expect(text(canonicalPlacementIdentityReceiptRenewalRequestV1(renewalRequest()))).toBe(
      JSON.stringify([
        'PlacementIdentityReceiptRenewalRequestV1',
        1,
        TRANSACTION_ID,
        DIGEST_A,
        DIGEST_B,
        1,
        NONCE,
        SIGNATURE,
      ]),
    );
    expect(text(canonicalPlacementIdentityRevokeRequestSignaturePreimageV1(revokeRequest()))).toBe(
      JSON.stringify([
        'PlacementIdentityRevokeRequestV1',
        1,
        TRANSACTION_ID,
        DIGEST_A,
        NONCE,
        'logout',
      ]),
    );
    expect(text(canonicalPlacementIdentityRevokeRequestV1(revokeRequest()))).toBe(
      JSON.stringify([
        'PlacementIdentityRevokeRequestV1',
        1,
        TRANSACTION_ID,
        DIGEST_A,
        NONCE,
        'logout',
        SIGNATURE,
      ]),
    );
    expect(text(canonicalPlacementIdentityConsumeRequestV1(consumeRequest()))).toBe(
      JSON.stringify([
        'PlacementIdentityConsumeRequestV1',
        1,
        'request-0001',
        TRANSACTION_ID,
        DIGEST_A,
        DIGEST_B,
        DIGEST_C,
        NONCE,
      ]),
    );
    expect(
      text(canonicalPlacementIdentityEmailChallengeSignaturePreimageV1(emailChallenge())),
    ).toBe(
      JSON.stringify([
        'PlacementIdentityEmailChallengeV1',
        1,
        TRANSACTION_ID,
        'delegation-0001',
        DIGEST_A,
        'opaque-email-handle-0001',
        ISSUED_AT,
        RECEIPT_EXPIRES_AT,
        'placement-authority-v1',
      ]),
    );
    expect(
      text(canonicalPlacementIdentityEmailRedemptionRequestSignaturePreimageV1(emailRedemption())),
    ).toBe(
      JSON.stringify([
        'PlacementIdentityEmailRedemptionRequestV1',
        1,
        'opaque-email-handle-0001',
        TRANSACTION_ID,
        'delegation-0001',
        DIGEST_A,
        NONCE,
      ]),
    );
    expect(text(canonicalPlacementIdentityEmailRedemptionOutcomeV1(emailOutcome()))).toBe(
      JSON.stringify([
        'PlacementIdentityEmailRedemptionOutcomeV1',
        1,
        TRANSACTION_ID,
        DIGEST_H,
        'PLACEMENT_IDENTITY_EMAIL_ACCEPTED',
        DIGEST_C,
        DIGEST_F,
      ]),
    );
  });

  it('canonicalizes pending and terminal operation references distinctly', () => {
    const pending = operationRecord();
    const succeeded = terminalOperationRecord('succeeded');
    const failed = terminalOperationRecord('failed');
    const cases: ReadonlyArray<
      readonly [PlacementIdentityOperationRecordV1, string | null, string | null]
    > = [
      [pending, pending.pendingResultCanonicalBytesBase64 ?? null, null],
      [succeeded, null, succeeded.finalResultCanonicalBytesBase64 ?? null],
      [failed, null, failed.finalResultCanonicalBytesBase64 ?? null],
    ];
    for (const [value, pendingReference, finalReference] of cases) {
      expect(text(canonicalPlacementIdentityOperationRecordV1(value))).toBe(
        JSON.stringify([
          'PlacementIdentityOperationRecordV1',
          1,
          'request-0001',
          'operation-0001',
          TRANSACTION_ID,
          DIGEST_E,
          NONCE,
          value.state,
          pendingReference,
          finalReference,
          ISSUED_AT,
          TRANSACTION_EXPIRES_AT,
        ]),
      );
    }
    expect(succeeded.finalResultCanonicalBytesBase64).not.toBe(
      failed.finalResultCanonicalBytesBase64,
    );
  });

  it('keeps signatures out of preimages and in every signed artifact', () => {
    const signatureCases: ReadonlyArray<
      readonly [string, () => Uint8Array, () => Uint8Array, () => Uint8Array, () => Uint8Array]
    > = [
      [
        'delegation',
        () => canonicalPlacementIdentityAuthDelegationSignaturePreimageV1(delegation()),
        () =>
          canonicalPlacementIdentityAuthDelegationSignaturePreimageV1({
            ...delegation(),
            authoritySignatureBase64: OTHER_SIGNATURE,
          }),
        () => canonicalPlacementIdentityAuthDelegationV1(delegation()),
        () =>
          canonicalPlacementIdentityAuthDelegationV1({
            ...delegation(),
            authoritySignatureBase64: OTHER_SIGNATURE,
          }),
      ],
      [
        'bootstrap proof',
        () => canonicalPlacementIdentityBootstrapProofSignaturePreimageV1(proof()),
        () =>
          canonicalPlacementIdentityBootstrapProofSignaturePreimageV1({
            ...proof(),
            bootstrapSignatureBase64: OTHER_SIGNATURE,
          }),
        () => canonicalPlacementIdentityBootstrapProofV1(proof()),
        () =>
          canonicalPlacementIdentityBootstrapProofV1({
            ...proof(),
            bootstrapSignatureBase64: OTHER_SIGNATURE,
          }),
      ],
      [
        'receipt',
        () => canonicalPlacementIdentityReceiptSignaturePreimageV1(receipt()),
        () =>
          canonicalPlacementIdentityReceiptSignaturePreimageV1({
            ...receipt(),
            authoritySignatureBase64: OTHER_SIGNATURE,
          }),
        () => canonicalPlacementIdentityReceiptV1(receipt()),
        () =>
          canonicalPlacementIdentityReceiptV1({
            ...receipt(),
            authoritySignatureBase64: OTHER_SIGNATURE,
          }),
      ],
      [
        'materialization envelope',
        () => canonicalAccountMaterializationEnvelopeSignaturePreimageV1(materialization()),
        () =>
          canonicalAccountMaterializationEnvelopeSignaturePreimageV1({
            ...materialization(),
            signature: OTHER_SIGNATURE,
          }),
        () => canonicalAccountMaterializationEnvelopeV1(materialization()),
        () =>
          canonicalAccountMaterializationEnvelopeV1({
            ...materialization(),
            signature: OTHER_SIGNATURE,
          }),
      ],
      [
        'legacy binding manifest',
        () => canonicalLegacyIdentityBindingManifestSignaturePreimageV1(manifest()),
        () =>
          canonicalLegacyIdentityBindingManifestSignaturePreimageV1({
            ...manifest(),
            signature: OTHER_SIGNATURE,
          }),
        () => canonicalLegacyIdentityBindingManifestV1(manifest()),
        () =>
          canonicalLegacyIdentityBindingManifestV1({
            ...manifest(),
            signature: OTHER_SIGNATURE,
          }),
      ],
      [
        'receipt renewal',
        () => canonicalPlacementIdentityReceiptRenewalRequestSignaturePreimageV1(renewalRequest()),
        () =>
          canonicalPlacementIdentityReceiptRenewalRequestSignaturePreimageV1({
            ...renewalRequest(),
            bootstrapSignatureBase64: OTHER_SIGNATURE,
          }),
        () => canonicalPlacementIdentityReceiptRenewalRequestV1(renewalRequest()),
        () =>
          canonicalPlacementIdentityReceiptRenewalRequestV1({
            ...renewalRequest(),
            bootstrapSignatureBase64: OTHER_SIGNATURE,
          }),
      ],
      [
        'revoke request',
        () => canonicalPlacementIdentityRevokeRequestSignaturePreimageV1(revokeRequest()),
        () =>
          canonicalPlacementIdentityRevokeRequestSignaturePreimageV1({
            ...revokeRequest(),
            bootstrapSignatureBase64: OTHER_SIGNATURE,
          }),
        () => canonicalPlacementIdentityRevokeRequestV1(revokeRequest()),
        () =>
          canonicalPlacementIdentityRevokeRequestV1({
            ...revokeRequest(),
            bootstrapSignatureBase64: OTHER_SIGNATURE,
          }),
      ],
      [
        'email challenge',
        () => canonicalPlacementIdentityEmailChallengeSignaturePreimageV1(emailChallenge()),
        () =>
          canonicalPlacementIdentityEmailChallengeSignaturePreimageV1({
            ...emailChallenge(),
            authoritySignatureBase64: OTHER_SIGNATURE,
          }),
        () => canonicalPlacementIdentityEmailChallengeV1(emailChallenge()),
        () =>
          canonicalPlacementIdentityEmailChallengeV1({
            ...emailChallenge(),
            authoritySignatureBase64: OTHER_SIGNATURE,
          }),
      ],
      [
        'email redemption',
        () =>
          canonicalPlacementIdentityEmailRedemptionRequestSignaturePreimageV1(emailRedemption()),
        () =>
          canonicalPlacementIdentityEmailRedemptionRequestSignaturePreimageV1({
            ...emailRedemption(),
            bootstrapSignatureBase64: OTHER_SIGNATURE,
          }),
        () => canonicalPlacementIdentityEmailRedemptionRequestV1(emailRedemption()),
        () =>
          canonicalPlacementIdentityEmailRedemptionRequestV1({
            ...emailRedemption(),
            bootstrapSignatureBase64: OTHER_SIGNATURE,
          }),
      ],
    ];
    for (const [, preimage, changedPreimage, artifact, changedArtifact] of signatureCases) {
      expect(bytesToHex(changedPreimage())).toBe(bytesToHex(preimage()));
      expect(bytesToHex(changedArtifact())).not.toBe(bytesToHex(artifact()));
    }
  });

  it('matches the fixed receipt identity preimage bytes and stable identity digest', () => {
    expect(
      bytesToHex(canonicalPlacementIdentityReceiptIdentityPreimageV1(receiptIdentityPreimage())),
    ).toBe(RECEIPT_IDENTITY_PREIMAGE_HEX);
    expect(placementIdentityReceiptDigestV1(receipt())).toBe(RECEIPT_IDENTITY_DIGEST);
    expect(placementIdentityReceiptDigestV1(receiptIdentityPreimage())).toBe(
      RECEIPT_IDENTITY_DIGEST,
    );
    expect(PLACEMENT_IDENTITY_RECEIPT_IDENTITY_DIGEST_DOMAIN_V1).toBe(
      'folklore.placement-identity-receipt.v1',
    );
  });

  it('keeps the receipt signature preimage golden bytes byte-for-byte unchanged', () => {
    expect(text(canonicalPlacementIdentityReceiptSignaturePreimageV1(receipt()))).toBe(
      JSON.stringify([
        'PlacementIdentityReceiptV1',
        1,
        TRANSACTION_ID,
        'delegation-0001',
        'microsoft',
        ACCOUNT_ID,
        DIGEST_F,
        DIGEST_C,
        DIGEST_A,
        DIGEST_B,
        ISSUED_AT,
        RECEIPT_EXPIRES_AT,
        TRANSACTION_EXPIRES_AT,
        0,
        12,
        'placement-authority-v1',
      ]),
    );
  });

  it('changes the stable identity digest for every included identity field', () => {
    const original = placementIdentityReceiptDigestV1(receipt());
    const changes: ReadonlyArray<
      readonly [keyof PlacementIdentityReceiptV1, string, PlacementIdentityReceiptV1]
    > = [
      ['transactionId', OTHER_TRANSACTION_ID, receipt()],
      ['delegationId', 'delegation-0002', receipt()],
      ['method', 'google', receipt()],
      ['accountId', OTHER_ACCOUNT_ID, receipt()],
      ['accountBindingDigest', DIGEST_G, receipt()],
      ['bootstrapKeyDigest', DIGEST_B, receipt()],
      ['identityProofDigest', DIGEST_E, receipt()],
      ['absoluteExpiresAt', '2026-08-25T00:59:59.999Z', receipt()],
      ['signerKeyId', 'placement-authority-v2', receipt()],
    ];
    for (const [field, replacement] of changes) {
      const changed = { ...receipt(), [field]: replacement } as PlacementIdentityReceiptV1;
      expect(placementIdentityReceiptDigestV1(changed)).not.toBe(original);
    }
  });

  it('excludes the self digest, signature, and volatile issuance fields', () => {
    const original = placementIdentityReceiptDigestV1(receipt());
    expect(
      placementIdentityReceiptDigestV1({ ...receipt(), identityReceiptDigest: DIGEST_D }),
    ).toBe(original);
    expect(
      placementIdentityReceiptDigestV1({ ...receipt(), authoritySignatureBase64: OTHER_SIGNATURE }),
    ).toBe(original);
    expect(
      placementIdentityReceiptDigestV1({ ...receipt(), issuedAt: '2026-08-25T00:00:01.000Z' }),
    ).toBe(original);
    expect(
      placementIdentityReceiptDigestV1({ ...receipt(), expiresAt: '2026-08-25T00:04:00.000Z' }),
    ).toBe(original);
    expect(placementIdentityReceiptDigestV1({ ...receipt(), renewalCount: 1 })).toBe(original);
  });

  it('domain-separates the stable identity digest from raw tuple bytes', () => {
    const bytes = canonicalPlacementIdentityReceiptIdentityPreimageV1(receiptIdentityPreimage());
    expect(placementIdentityReceiptDigestV1(receipt())).not.toBe(bytesToHex(sha256(bytes)));
  });

  it('keeps the neutral family separate from legacy Google V1/V2 contracts', () => {
    expect(() =>
      placementIdentityBeginRequestV1Schema.parse({
        schema: 'PlacementAuthorityVerifyGoogleOidcRequestV2',
        version: 2,
        idToken: 'opaque-id-token',
        expectedNonce: 'nonce',
        callerProfile: 'customer',
      }),
    ).toThrow();
    expect(() =>
      placementIdentityBootstrapProofV1Schema.parse({
        ...proof(),
        schema: 'PlacementAuthorityVerifyGoogleOidcRequestV2',
      }),
    ).toThrow();
  });
});
