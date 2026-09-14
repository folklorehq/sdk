// SPDX-License-Identifier: Apache-2.0
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';

import {
  base64Ed25519SignatureSchema,
  canonicalJson,
  digest64Schema,
  identifierSchema,
} from '../shared.js';
import { placementIdentityTimestampV1Schema } from './bootstrap.js';

/*
  Two signed artifacts carry the sign-in identity into placement.

  `PlacementSignInIdentityAttestationV1` is minted by the placement authority when it verifies the
  provider assertion at sign-in. The control plane retains it for the life of the session instead of
  the raw provider token, whose own one-hour expiry made placement impossible for every session
  older than the token. The authority signs it, so the control plane cannot name an identity, and its
  lifetime is chosen here rather than by the provider.

  `PlacementIdentityChallengeProofV1` is minted when the browser asks for the proof, after the
  signer-issued challenge exists. It carries the challenge digest, so the enrollment check that the
  proof belongs to this exact transaction is preserved. The authority re-verifies its own attestation
  before signing one, so a control-plane compromise still cannot substitute an identity.
*/

export const PLACEMENT_SIGN_IN_IDENTITY_ATTESTATION_SCHEMA_V1 =
  'PlacementSignInIdentityAttestationV1';
export const PLACEMENT_SIGN_IN_IDENTITY_ATTESTATION_SIGNATURE_DOMAIN_V1 =
  'folklore.placement-sign-in-identity-attestation.v1';
export const PLACEMENT_SIGN_IN_IDENTITY_ATTESTATION_DIGEST_DOMAIN_V1 =
  'folklore.placement-sign-in-identity-attestation-digest.v1';
export const PLACEMENT_IDENTITY_CHALLENGE_PROOF_SCHEMA_V1 = 'PlacementIdentityChallengeProofV1';
export const PLACEMENT_IDENTITY_CHALLENGE_PROOF_SIGNATURE_DOMAIN_V1 =
  'folklore.placement-identity-challenge-proof.v1';

// The attestation outlives the provider token by a bounded window: long enough that a user who signs
// in and returns later can still finish setup, short enough that a revoked provider identity stops
// conferring tenant authority the same day.
export const PLACEMENT_SIGN_IN_IDENTITY_ATTESTATION_TTL_MS = 24 * 60 * 60 * 1000;
// The challenge proof is consumed within one ceremony, so it does not outlive the challenge.
export const PLACEMENT_IDENTITY_CHALLENGE_PROOF_TTL_MS = 5 * 60 * 1000;

const GOOGLE_OIDC_ISSUER = 'https://accounts.google.com';

export const placementSignInIdentityCallerProfileV1Schema = z.enum(['customer', 'operator']);

const attestationShape = {
  schema: z.literal(PLACEMENT_SIGN_IN_IDENTITY_ATTESTATION_SCHEMA_V1),
  version: z.literal(1),
  method: z.literal('google'),
  issuer: z.literal(GOOGLE_OIDC_ISSUER),
  subject: z.string().min(1).max(255),
  callerProfile: placementSignInIdentityCallerProfileV1Schema,
  nonce: z.string().min(1).max(256),
  tokenDigest: digest64Schema,
  issuerDigest: digest64Schema,
  subjectDigest: digest64Schema,
  tenantOwnerIdentityDigest: digest64Schema,
  issuedAt: placementIdentityTimestampV1Schema,
  expiresAt: placementIdentityTimestampV1Schema,
  signerKeyId: identifierSchema,
  signerSpkiSha256: digest64Schema,
};

export const unsignedPlacementSignInIdentityAttestationV1Schema = z
  .object(attestationShape)
  .strict()
  .superRefine((value, context) => {
    const lifetime = new Date(value.expiresAt).getTime() - new Date(value.issuedAt).getTime();
    if (lifetime <= 0 || lifetime > PLACEMENT_SIGN_IN_IDENTITY_ATTESTATION_TTL_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'attestation expiry must be within the 24-hour attestation lifetime',
      });
    }
  });

export type UnsignedPlacementSignInIdentityAttestationV1 = z.infer<
  typeof unsignedPlacementSignInIdentityAttestationV1Schema
>;

export const placementSignInIdentityAttestationV1Schema = z
  .object({
    ...attestationShape,
    signatureBase64: base64Ed25519SignatureSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const lifetime = new Date(value.expiresAt).getTime() - new Date(value.issuedAt).getTime();
    if (lifetime <= 0 || lifetime > PLACEMENT_SIGN_IN_IDENTITY_ATTESTATION_TTL_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'attestation expiry must be within the 24-hour attestation lifetime',
      });
    }
  });

export type PlacementSignInIdentityAttestationV1 = z.infer<
  typeof placementSignInIdentityAttestationV1Schema
>;

const challengeProofShape = {
  schema: z.literal(PLACEMENT_IDENTITY_CHALLENGE_PROOF_SCHEMA_V1),
  version: z.literal(1),
  method: z.literal('google'),
  issuer: z.literal(GOOGLE_OIDC_ISSUER),
  subject: z.string().min(1).max(255),
  challengeDigest: digest64Schema,
  signInAttestationDigest: digest64Schema,
  tokenDigest: digest64Schema,
  issuerDigest: digest64Schema,
  subjectDigest: digest64Schema,
  tenantOwnerIdentityDigest: digest64Schema,
  issuedAt: placementIdentityTimestampV1Schema,
  expiresAt: placementIdentityTimestampV1Schema,
  signerKeyId: identifierSchema,
  signerSpkiSha256: digest64Schema,
};

export const unsignedPlacementIdentityChallengeProofV1Schema = z
  .object(challengeProofShape)
  .strict()
  .superRefine((value, context) => {
    const lifetime = new Date(value.expiresAt).getTime() - new Date(value.issuedAt).getTime();
    if (lifetime <= 0 || lifetime > PLACEMENT_IDENTITY_CHALLENGE_PROOF_TTL_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'challenge proof expiry must be within the five-minute proof lifetime',
      });
    }
  });

export type UnsignedPlacementIdentityChallengeProofV1 = z.infer<
  typeof unsignedPlacementIdentityChallengeProofV1Schema
>;

export const placementIdentityChallengeProofV1Schema = z
  .object({
    ...challengeProofShape,
    signatureBase64: base64Ed25519SignatureSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const lifetime = new Date(value.expiresAt).getTime() - new Date(value.issuedAt).getTime();
    if (lifetime <= 0 || lifetime > PLACEMENT_IDENTITY_CHALLENGE_PROOF_TTL_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'challenge proof expiry must be within the five-minute proof lifetime',
      });
    }
  });

export type PlacementIdentityChallengeProofV1 = z.infer<
  typeof placementIdentityChallengeProofV1Schema
>;

// Domain-separated preimages: a signature over one artifact can never verify as a signature over the
// other, even though both are signed by the same authority key.
// The signed artifact is accepted so a signer can recompute the preimage from what it produced; the
// signature field is not part of the preimage.
export function canonicalPlacementSignInIdentityAttestationSignaturePreimageV1(
  input: PlacementSignInIdentityAttestationV1,
): Uint8Array {
  const value = placementSignInIdentityAttestationV1Schema.parse(input);
  return signedPreimage(PLACEMENT_SIGN_IN_IDENTITY_ATTESTATION_SIGNATURE_DOMAIN_V1, [
    value.schema,
    value.version,
    value.method,
    value.issuer,
    value.subject,
    value.callerProfile,
    value.nonce,
    value.tokenDigest,
    value.issuerDigest,
    value.subjectDigest,
    value.tenantOwnerIdentityDigest,
    value.issuedAt,
    value.expiresAt,
    value.signerKeyId,
    value.signerSpkiSha256,
  ]);
}

export function canonicalPlacementIdentityChallengeProofSignaturePreimageV1(
  input: PlacementIdentityChallengeProofV1,
): Uint8Array {
  const value = placementIdentityChallengeProofV1Schema.parse(input);
  return signedPreimage(PLACEMENT_IDENTITY_CHALLENGE_PROOF_SIGNATURE_DOMAIN_V1, [
    value.schema,
    value.version,
    value.method,
    value.issuer,
    value.subject,
    value.challengeDigest,
    value.signInAttestationDigest,
    value.tokenDigest,
    value.issuerDigest,
    value.subjectDigest,
    value.tenantOwnerIdentityDigest,
    value.issuedAt,
    value.expiresAt,
    value.signerKeyId,
    value.signerSpkiSha256,
  ]);
}

export function canonicalPlacementSignInIdentityAttestationV1(
  input: PlacementSignInIdentityAttestationV1,
): Uint8Array {
  const value = placementSignInIdentityAttestationV1Schema.parse(input);
  return new TextEncoder().encode(canonicalJson(value));
}

export function encodePlacementSignInIdentityAttestationV1(
  input: PlacementSignInIdentityAttestationV1,
): string {
  return canonicalJson(placementSignInIdentityAttestationV1Schema.parse(input));
}

export function decodePlacementSignInIdentityAttestationV1(
  value: string,
): PlacementSignInIdentityAttestationV1 {
  const decoded = tryDecodePlacementSignInIdentityAttestationV1(value);
  if (decoded === null) throw new Error('PLACEMENT_SIGN_IN_IDENTITY_ATTESTATION_INVALID');
  return decoded;
}

export function tryDecodePlacementSignInIdentityAttestationV1(
  value: string,
): PlacementSignInIdentityAttestationV1 | null {
  return decodeCanonicalArtifact(value, placementSignInIdentityAttestationV1Schema);
}

export function placementSignInIdentityAttestationDigestV1(
  input: PlacementSignInIdentityAttestationV1,
): string {
  return bytesToHex(
    sha256(
      concatBytes(
        utf8ToBytes(PLACEMENT_SIGN_IN_IDENTITY_ATTESTATION_DIGEST_DOMAIN_V1),
        Uint8Array.of(0),
        canonicalPlacementSignInIdentityAttestationV1(input),
      ),
    ),
  );
}

export function canonicalPlacementIdentityChallengeProofV1(
  input: PlacementIdentityChallengeProofV1,
): Uint8Array {
  const value = placementIdentityChallengeProofV1Schema.parse(input);
  return new TextEncoder().encode(canonicalJson(value));
}

export function encodePlacementIdentityChallengeProofV1(
  input: PlacementIdentityChallengeProofV1,
): string {
  return canonicalJson(placementIdentityChallengeProofV1Schema.parse(input));
}

export function decodePlacementIdentityChallengeProofV1(
  value: string,
): PlacementIdentityChallengeProofV1 {
  const decoded = tryDecodePlacementIdentityChallengeProofV1(value);
  if (decoded === null) throw new Error('PLACEMENT_IDENTITY_CHALLENGE_PROOF_INVALID');
  return decoded;
}

export function tryDecodePlacementIdentityChallengeProofV1(
  value: string,
): PlacementIdentityChallengeProofV1 | null {
  return decodeCanonicalArtifact(value, placementIdentityChallengeProofV1Schema);
}

function signedPreimage(domain: string, fields: readonly (string | number)[]): Uint8Array {
  return concatBytes(utf8ToBytes(domain), Uint8Array.of(0), utf8ToBytes(canonicalJson(fields)));
}

function decodeCanonicalArtifact<T>(value: string, schema: z.ZodType<T>): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(value) as unknown);
    if (!parsed.success || canonicalJson(parsed.data) !== value) return null;
    return parsed.data;
  } catch {
    return null;
  }
}
