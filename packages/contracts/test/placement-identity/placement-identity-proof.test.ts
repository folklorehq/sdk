// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import {
  PLACEMENT_IDENTITY_CHALLENGE_PROOF_TTL_MS,
  PLACEMENT_SIGN_IN_IDENTITY_ATTESTATION_TTL_MS,
  canonicalPlacementIdentityChallengeProofSignaturePreimageV1,
  canonicalPlacementSignInIdentityAttestationSignaturePreimageV1,
  decodePlacementIdentityChallengeProofV1,
  decodePlacementSignInIdentityAttestationV1,
  encodePlacementIdentityChallengeProofV1,
  encodePlacementSignInIdentityAttestationV1,
  placementIdentityChallengeProofV1Schema,
  placementSignInIdentityAttestationDigestV1,
  placementSignInIdentityAttestationV1Schema,
  tryDecodePlacementIdentityChallengeProofV1,
  tryDecodePlacementSignInIdentityAttestationV1,
  type PlacementIdentityChallengeProofV1,
  type PlacementSignInIdentityAttestationV1,
} from '../../src/placement-identity/placement-identity-proof.js';

const ISSUED_AT = '2026-09-14T05:00:00.000Z';
const ATTESTATION_EXPIRES_AT = new Date(
  Date.parse(ISSUED_AT) + PLACEMENT_SIGN_IN_IDENTITY_ATTESTATION_TTL_MS,
).toISOString();
const PROOF_EXPIRES_AT = new Date(
  Date.parse(ISSUED_AT) + PLACEMENT_IDENTITY_CHALLENGE_PROOF_TTL_MS,
).toISOString();
const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const CHALLENGE_DIGEST = 'c'.repeat(64);
const SIGNATURE = Buffer.alloc(64, 7).toString('base64');

function attestation(
  overrides: Partial<PlacementSignInIdentityAttestationV1> = {},
): PlacementSignInIdentityAttestationV1 {
  return {
    schema: 'PlacementSignInIdentityAttestationV1',
    version: 1,
    method: 'google',
    issuer: 'https://accounts.google.com',
    subject: 'subject-1',
    callerProfile: 'customer',
    nonce: 'pending-login-id',
    tokenDigest: DIGEST_A,
    issuerDigest: DIGEST_B,
    subjectDigest: DIGEST_A,
    tenantOwnerIdentityDigest: DIGEST_B,
    issuedAt: ISSUED_AT,
    expiresAt: ATTESTATION_EXPIRES_AT,
    signerKeyId: 'placement-authority-v1',
    signerSpkiSha256: DIGEST_A,
    signatureBase64: SIGNATURE,
    ...overrides,
  };
}

function challengeProof(
  overrides: Partial<PlacementIdentityChallengeProofV1> = {},
): PlacementIdentityChallengeProofV1 {
  return {
    schema: 'PlacementIdentityChallengeProofV1',
    version: 1,
    method: 'google',
    issuer: 'https://accounts.google.com',
    subject: 'subject-1',
    challengeDigest: CHALLENGE_DIGEST,
    signInAttestationDigest: placementSignInIdentityAttestationDigestV1(attestation()),
    tokenDigest: DIGEST_A,
    issuerDigest: DIGEST_B,
    subjectDigest: DIGEST_A,
    tenantOwnerIdentityDigest: DIGEST_B,
    issuedAt: ISSUED_AT,
    expiresAt: PROOF_EXPIRES_AT,
    signerKeyId: 'placement-authority-v1',
    signerSpkiSha256: DIGEST_A,
    signatureBase64: SIGNATURE,
    ...overrides,
  };
}

describe('placement sign-in identity attestation', () => {
  it('round-trips the canonical encoding', () => {
    const value = attestation();
    const encoded = encodePlacementSignInIdentityAttestationV1(value);
    expect(JSON.parse(encoded)).toEqual(value);
    expect(decodePlacementSignInIdentityAttestationV1(encoded)).toEqual(value);
  });

  it('rejects a non-canonical encoding', () => {
    const encoded = encodePlacementSignInIdentityAttestationV1(attestation());
    expect(tryDecodePlacementSignInIdentityAttestationV1(` ${encoded}`)).toBeNull();
    expect(tryDecodePlacementSignInIdentityAttestationV1(encoded.replace('{', '{\n'))).toBeNull();
  });

  it('rejects an attestation whose lifetime exceeds the 24-hour window', () => {
    const beyondWindow = new Date(
      Date.parse(ISSUED_AT) + PLACEMENT_SIGN_IN_IDENTITY_ATTESTATION_TTL_MS + 1_000,
    ).toISOString();
    expect(
      placementSignInIdentityAttestationV1Schema.safeParse(attestation({ expiresAt: beyondWindow }))
        .success,
    ).toBe(false);
  });

  it('rejects an attestation that expires before it was issued', () => {
    expect(
      placementSignInIdentityAttestationV1Schema.safeParse(attestation({ expiresAt: ISSUED_AT }))
        .success,
    ).toBe(false);
  });

  it('rejects extra and missing fields, and a non-canonical signature', () => {
    const encoded = encodePlacementSignInIdentityAttestationV1(attestation());
    const withExtra = JSON.stringify({ ...attestation(), email: 'a@b.com' });
    expect(tryDecodePlacementSignInIdentityAttestationV1(withExtra)).toBeNull();
    const { signatureBase64: _dropped, ...withoutSignature } = attestation();
    expect(
      tryDecodePlacementSignInIdentityAttestationV1(JSON.stringify(withoutSignature)),
    ).toBeNull();
    expect(
      tryDecodePlacementSignInIdentityAttestationV1(
        encoded.replace(SIGNATURE, Buffer.alloc(63, 7).toString('base64')),
      ),
    ).toBeNull();
  });

  it('never decodes a challenge proof or a raw provider token as an attestation', () => {
    expect(
      tryDecodePlacementSignInIdentityAttestationV1(
        encodePlacementIdentityChallengeProofV1(challengeProof()),
      ),
    ).toBeNull();
    expect(tryDecodePlacementSignInIdentityAttestationV1('header.payload.signature')).toBeNull();
    expect(tryDecodePlacementSignInIdentityAttestationV1('')).toBeNull();
  });

  it('binds the signature preimage to the attestation domain and to every signed field', () => {
    const preimage = canonicalPlacementSignInIdentityAttestationSignaturePreimageV1({
      ...attestation(),
    });
    expect(new TextDecoder().decode(preimage)).toContain(
      'folklore.placement-sign-in-identity-attestation.v1',
    );
    const moved = canonicalPlacementSignInIdentityAttestationSignaturePreimageV1({
      ...attestation({ subject: 'subject-2' }),
    });
    expect(Buffer.from(moved).equals(Buffer.from(preimage))).toBe(false);
  });

  it('excludes the signature from the preimage so re-signing is deterministic', () => {
    const first = canonicalPlacementSignInIdentityAttestationSignaturePreimageV1(attestation());
    const second = canonicalPlacementSignInIdentityAttestationSignaturePreimageV1(
      attestation({ signatureBase64: Buffer.alloc(64, 9).toString('base64') }),
    );
    expect(Buffer.from(first).equals(Buffer.from(second))).toBe(true);
  });

  it('digests the artifact and changes when a signed field changes', () => {
    const digest = placementSignInIdentityAttestationDigestV1(attestation());
    expect(digest).toMatch(/^[0-9a-f]{64}$/);
    expect(placementSignInIdentityAttestationDigestV1(attestation())).toBe(digest);
    expect(placementSignInIdentityAttestationDigestV1(attestation({ subject: 'other' }))).not.toBe(
      digest,
    );
  });

  it('leaves the caller profile explicit so operator sign-ins cannot be used as customers', () => {
    expect(
      placementSignInIdentityAttestationV1Schema.safeParse(
        attestation({ callerProfile: 'operator' }),
      ).success,
    ).toBe(true);
    expect(
      placementSignInIdentityAttestationV1Schema.safeParse({ ...attestation(), callerProfile: 'x' })
        .success,
    ).toBe(false);
  });
});

describe('placement identity challenge proof', () => {
  it('round-trips the canonical encoding', () => {
    const value = challengeProof();
    const encoded = encodePlacementIdentityChallengeProofV1(value);
    expect(decodePlacementIdentityChallengeProofV1(encoded)).toEqual(value);
  });

  it('rejects a non-canonical encoding and an over-long lifetime', () => {
    const encoded = encodePlacementIdentityChallengeProofV1(challengeProof());
    expect(tryDecodePlacementIdentityChallengeProofV1(`${encoded}\n`)).toBeNull();
    expect(
      placementIdentityChallengeProofV1Schema.safeParse(
        challengeProof({
          expiresAt: new Date(
            Date.parse(ISSUED_AT) + PLACEMENT_IDENTITY_CHALLENGE_PROOF_TTL_MS + 1_000,
          ).toISOString(),
        }),
      ).success,
    ).toBe(false);
  });

  it('never decodes an attestation as a challenge proof', () => {
    expect(
      tryDecodePlacementIdentityChallengeProofV1(
        encodePlacementSignInIdentityAttestationV1(attestation()),
      ),
    ).toBeNull();
  });

  it('binds the signature preimage to its own domain', () => {
    const preimage = canonicalPlacementIdentityChallengeProofSignaturePreimageV1(challengeProof());
    expect(new TextDecoder().decode(preimage)).toContain(
      'folklore.placement-identity-challenge-proof.v1',
    );
    expect(new TextDecoder().decode(preimage)).not.toContain(
      'folklore.placement-sign-in-identity-attestation.v1',
    );
  });

  it('carries the challenge digest so the enrollment binding survives the change', () => {
    expect(
      placementIdentityChallengeProofV1Schema.safeParse(
        challengeProof({ challengeDigest: 'not-a-digest' }),
      ).success,
    ).toBe(false);
    expect(challengeProof().challengeDigest).toBe(CHALLENGE_DIGEST);
  });
});
