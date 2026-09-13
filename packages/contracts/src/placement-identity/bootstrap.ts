// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

import {
  base64Ed25519SignatureSchema,
  canonicalBase64BytesSchema,
  canonicalJson,
  digest64Schema,
  ed25519SpkiSchema,
  identifierSchema,
} from '../shared.js';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RFC3339_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const MAX_NONCE_BYTES = 32;

export const PLACEMENT_IDENTITY_MAX_TRANSACTION_LIFETIME_MS = 60 * 60 * 1000;
export const PLACEMENT_IDENTITY_MAX_RECEIPT_LIFETIME_MS = 5 * 60 * 1000;
export const PLACEMENT_IDENTITY_MAX_RENEWALS = 12;

// Upper bound on the provider id token carried as the placement sign-in proof. The placement
// authority enforces the same ceiling on the opaque token it accepts; the value lives here because
// `placement-authority.ts` is excluded from the product mirror and any mirrored module that imports
// it fails to build.
export const PLACEMENT_IDENTITY_MAX_PROVIDER_PROOF_CHARS = 16 * 1024;

export const placementIdentityTimestampV1Schema = z
  .string()
  .regex(RFC3339_UTC_PATTERN, 'timestamp must be canonical UTC')
  .refine((value) => {
    const timestamp = new Date(value);
    return Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === value;
  }, 'timestamp must be a real UTC instant');

export const placementIdentityTransactionIdV1Schema = z
  .string()
  .uuid()
  .regex(UUID_V4_PATTERN, 'transaction ID must be a canonical UUIDv4');

export const placementIdentityMethodV1Schema = z.enum(['google', 'microsoft', 'email']);

export const placementIdentityNonceV1Schema = canonicalBase64BytesSchema({
  maxDecodedBytes: MAX_NONCE_BYTES,
}).refine((value) => value.length === 44, 'nonce must be exactly 32 canonical bytes');

export const placementIdentityOneUseStateV1Schema = z.enum([
  'active',
  'consumed',
  'revoked',
  'expired',
]);

export const placementIdentityBeginRequestV1Schema = z
  .object({
    schema: z.literal('PlacementIdentityBeginRequestV1'),
    version: z.literal(1),
    transactionId: placementIdentityTransactionIdV1Schema,
    method: placementIdentityMethodV1Schema,
    bootstrapPublicKeySpki: ed25519SpkiSchema,
    bootstrapKeyDigest: digest64Schema,
  })
  .strict();

export type PlacementIdentityBeginRequestV1 = z.infer<typeof placementIdentityBeginRequestV1Schema>;

export const placementIdentityAuthDelegationV1Schema = z
  .object({
    schema: z.literal('PlacementIdentityAuthDelegationV1'),
    version: z.literal(1),
    transactionId: placementIdentityTransactionIdV1Schema,
    delegationId: identifierSchema,
    method: placementIdentityMethodV1Schema,
    bootstrapPublicKeySpki: ed25519SpkiSchema,
    bootstrapKeyDigest: digest64Schema,
    authorityNonce: placementIdentityNonceV1Schema,
    callbackBindingDigest: digest64Schema,
    createdAt: placementIdentityTimestampV1Schema,
    absoluteExpiresAt: placementIdentityTimestampV1Schema,
    oneUseState: placementIdentityOneUseStateV1Schema,
    authoritySignatureBase64: base64Ed25519SignatureSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const lifetime =
      new Date(value.absoluteExpiresAt).getTime() - new Date(value.createdAt).getTime();
    if (lifetime <= 0 || lifetime > PLACEMENT_IDENTITY_MAX_TRANSACTION_LIFETIME_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['absoluteExpiresAt'],
        message: 'absolute expiry must be within the 60-minute transaction lifetime',
      });
    }
  });

export type PlacementIdentityAuthDelegationV1 = z.infer<
  typeof placementIdentityAuthDelegationV1Schema
>;

export const placementIdentityBootstrapProofV1Schema = z
  .object({
    schema: z.literal('PlacementIdentityBootstrapProofV1'),
    version: z.literal(1),
    purpose: z.literal('placement_identity_bootstrap'),
    transactionId: placementIdentityTransactionIdV1Schema,
    delegationId: identifierSchema,
    identityReceiptDigest: digest64Schema,
    bootstrapKeyDigest: digest64Schema,
    authorityChallengeDigest: digest64Schema,
    recoveryPublicKeyDigest: digest64Schema,
    placementPublicKeyDigest: digest64Schema,
    accountId: z.string().uuid(),
    accountBindingDigest: digest64Schema,
    proofNonce: placementIdentityNonceV1Schema,
    bootstrapSignatureBase64: base64Ed25519SignatureSchema,
  })
  .strict();

export type PlacementIdentityBootstrapProofV1 = z.infer<
  typeof placementIdentityBootstrapProofV1Schema
>;

function canonicalBytes(fields: readonly (string | number)[]): Uint8Array {
  return new TextEncoder().encode(canonicalJson(fields));
}

export function canonicalPlacementIdentityBeginRequestV1(
  input: PlacementIdentityBeginRequestV1,
): Uint8Array {
  const value = placementIdentityBeginRequestV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.transactionId,
    value.method,
    value.bootstrapPublicKeySpki,
    value.bootstrapKeyDigest,
  ]);
}

export function canonicalPlacementIdentityAuthDelegationSignaturePreimageV1(
  input: PlacementIdentityAuthDelegationV1,
): Uint8Array {
  const value = placementIdentityAuthDelegationV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.transactionId,
    value.delegationId,
    value.method,
    value.bootstrapPublicKeySpki,
    value.bootstrapKeyDigest,
    value.authorityNonce,
    value.callbackBindingDigest,
    value.createdAt,
    value.absoluteExpiresAt,
    value.oneUseState,
  ]);
}

export function canonicalPlacementIdentityAuthDelegationV1(
  input: PlacementIdentityAuthDelegationV1,
): Uint8Array {
  const value = placementIdentityAuthDelegationV1Schema.parse(input);
  return new TextEncoder().encode(canonicalJson(value));
}

export function canonicalPlacementIdentityBootstrapProofSignaturePreimageV1(
  input: PlacementIdentityBootstrapProofV1,
): Uint8Array {
  const value = placementIdentityBootstrapProofV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.purpose,
    value.transactionId,
    value.delegationId,
    value.identityReceiptDigest,
    value.bootstrapKeyDigest,
    value.authorityChallengeDigest,
    value.recoveryPublicKeyDigest,
    value.placementPublicKeyDigest,
    value.accountId,
    value.accountBindingDigest,
    value.proofNonce,
  ]);
}

export function canonicalPlacementIdentityBootstrapProofV1(
  input: PlacementIdentityBootstrapProofV1,
): Uint8Array {
  const value = placementIdentityBootstrapProofV1Schema.parse(input);
  return new TextEncoder().encode(canonicalJson(value));
}
