// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import {
  commissioningAcceptancePayloadBytes,
  commissioningAcceptancePayloadV1Schema,
  signedCommissioningAcceptanceEnvelopeV1Schema,
  type CommissioningAcceptancePayloadV1,
} from '../src/commissioning-acceptance.js';
import { canonicalJson } from '../src/shared.js';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const SOURCE_COMMIT = '1'.repeat(40);
const PCR0 = 'f'.repeat(96);
const SIGNATURE = `${'A'.repeat(86)}==`;
const ISSUED_AT = '2026-08-23T06:00:00.000Z';
const VALID_UNTIL = '2026-08-23T07:00:00.000Z';

function payload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    canonicalDomain: 'folklore.shared-tier-general-admission.v1',
    environment: 'prod',
    decision: 'pass',
    issuedAt: ISSUED_AT,
    validUntil: VALID_UNTIL,
    evidenceSha256: DIGEST_A,
    release: {
      protectedSourceCommit: SOURCE_COMMIT,
      eifArtifactPath: `artifacts/${SOURCE_COMMIT}/enclave.eif`,
      eifDigest: DIGEST_B,
      pcr0: PCR0,
    },
    runtimeBindings: {
      signerFloorKeysetDigest: DIGEST_A,
      inferenceTrustPolicyDigest: DIGEST_B,
      assignmentManifestPublicKeyDigest: DIGEST_A,
      enclaveOutputKeyConfigDigest: DIGEST_B,
      sharedPoolRuntimeConfigDigest: DIGEST_A,
    },
    ...overrides,
  };
}

function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schemaVersion: 1,
    algorithm: 'Ed25519',
    keyId: 'commissioning-authority-v1',
    payload: payload(),
    signature: SIGNATURE,
    ...overrides,
  };
}

describe('commissioning acceptance contracts', () => {
  it('parses a valid payload and envelope and emits stable canonical UTF-8 payload bytes', () => {
    const parsed = commissioningAcceptancePayloadV1Schema.parse(
      payload(),
    ) as CommissioningAcceptancePayloadV1;
    const reordered = {
      runtimeBindings: parsed.runtimeBindings,
      release: parsed.release,
      evidenceSha256: parsed.evidenceSha256,
      validUntil: parsed.validUntil,
      issuedAt: parsed.issuedAt,
      decision: parsed.decision,
      environment: parsed.environment,
      canonicalDomain: parsed.canonicalDomain,
      schemaVersion: parsed.schemaVersion,
    };

    expect(signedCommissioningAcceptanceEnvelopeV1Schema.parse(envelope()).payload).toEqual(parsed);
    expect(commissioningAcceptancePayloadBytes(parsed)).toEqual(
      commissioningAcceptancePayloadBytes(reordered as CommissioningAcceptancePayloadV1),
    );
    expect(new TextDecoder().decode(commissioningAcceptancePayloadBytes(parsed))).toBe(
      canonicalJson(parsed),
    );
  });

  it('rejects unknown fields at every nested level', () => {
    expect(() =>
      commissioningAcceptancePayloadV1Schema.parse({ ...payload(), extra: true }),
    ).toThrow();
    expect(() =>
      commissioningAcceptancePayloadV1Schema.parse({
        ...payload(),
        release: { ...payload().release, extra: true },
      }),
    ).toThrow();
    expect(() =>
      commissioningAcceptancePayloadV1Schema.parse({
        ...payload(),
        runtimeBindings: { ...payload().runtimeBindings, extra: true },
      }),
    ).toThrow();
    expect(() =>
      signedCommissioningAcceptanceEnvelopeV1Schema.parse({ ...envelope(), extra: true }),
    ).toThrow();
  });

  it.each([
    ['environment', { environment: 'staging' }],
    ['decision', { decision: 'fail' }],
    ['canonical domain', { canonicalDomain: 'other.domain.v1' }],
    ['zero PCR0', { release: { ...payload().release, pcr0: '0'.repeat(96) } }],
    [
      'malformed commit',
      { release: { ...payload().release, protectedSourceCommit: 'not-a-commit' } },
    ],
    ['missing EIF digest', { release: { ...payload().release, eifDigest: undefined } }],
    ['malformed digest', { evidenceSha256: 'not-a-digest' }],
    ['malformed signature', { signature: 'not-a-signature' }],
    [
      'non-commit artifact path',
      { release: { ...payload().release, eifArtifactPath: 'artifacts/latest/enclave.eif' } },
    ],
    [
      'substituted artifact path',
      {
        release: {
          ...payload().release,
          eifArtifactPath: `artifacts/${'2'.repeat(40)}/enclave.eif`,
        },
      },
    ],
  ])('rejects %s', (_label, overrides) => {
    const input = 'signature' in overrides ? envelope(overrides) : payload(overrides);
    const schema =
      'signature' in overrides
        ? signedCommissioningAcceptanceEnvelopeV1Schema
        : commissioningAcceptancePayloadV1Schema;
    expect(() => schema.parse(input)).toThrow();
  });

  it.each([
    ['equal timestamps', { issuedAt: ISSUED_AT, validUntil: ISSUED_AT }],
    ['reversed timestamps', { issuedAt: VALID_UNTIL, validUntil: ISSUED_AT }],
    ['noncanonical issued timestamp', { issuedAt: '2026-08-23T06:00:00Z' }],
    ['non-UTC timestamp', { validUntil: '2026-08-23T07:00:00.000+00:00' }],
  ])('rejects %s', (_label, overrides) => {
    expect(() => commissioningAcceptancePayloadV1Schema.parse(payload(overrides))).toThrow();
  });

  it('rejects missing payload and malformed envelope discriminators', () => {
    expect(() =>
      signedCommissioningAcceptanceEnvelopeV1Schema.parse({ ...envelope(), payload: undefined }),
    ).toThrow();
    expect(() =>
      signedCommissioningAcceptanceEnvelopeV1Schema.parse({ ...envelope(), algorithm: 'RSA' }),
    ).toThrow();
    expect(() =>
      signedCommissioningAcceptanceEnvelopeV1Schema.parse({ ...envelope(), keyId: '' }),
    ).toThrow();
  });
});
