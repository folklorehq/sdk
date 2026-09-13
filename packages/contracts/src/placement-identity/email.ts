// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

import {
  base64Ed25519SignatureSchema,
  canonicalJson,
  digest64Schema,
  identifierSchema,
} from '../shared.js';
import {
  PLACEMENT_IDENTITY_MAX_RECEIPT_LIFETIME_MS,
  placementIdentityNonceV1Schema,
  placementIdentityTimestampV1Schema,
  placementIdentityTransactionIdV1Schema,
} from './bootstrap.js';

const EMAIL_HANDLE_PATTERN = /^[A-Za-z0-9_-]+$/;
const emailHandleSchema = z
  .string()
  .min(16)
  .max(256)
  .regex(EMAIL_HANDLE_PATTERN, 'email presentation handle must be opaque visible token text');

export const placementIdentityEmailChallengeV1Schema = z
  .object({
    schema: z.literal('PlacementIdentityEmailChallengeV1'),
    version: z.literal(1),
    transactionId: placementIdentityTransactionIdV1Schema,
    delegationId: identifierSchema,
    bootstrapKeyDigest: digest64Schema,
    handle: emailHandleSchema,
    issuedAt: placementIdentityTimestampV1Schema,
    expiresAt: placementIdentityTimestampV1Schema,
    signerKeyId: identifierSchema,
    authoritySignatureBase64: base64Ed25519SignatureSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const lifetime = new Date(value.expiresAt).getTime() - new Date(value.issuedAt).getTime();
    if (lifetime <= 0 || lifetime > PLACEMENT_IDENTITY_MAX_RECEIPT_LIFETIME_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'email challenge expiry must be within five minutes of issue time',
      });
    }
  });

export type PlacementIdentityEmailChallengeV1 = z.infer<
  typeof placementIdentityEmailChallengeV1Schema
>;

export const placementIdentityEmailRedemptionRequestV1Schema = z
  .object({
    schema: z.literal('PlacementIdentityEmailRedemptionRequestV1'),
    version: z.literal(1),
    handle: emailHandleSchema,
    transactionId: placementIdentityTransactionIdV1Schema,
    delegationId: identifierSchema,
    bootstrapKeyDigest: digest64Schema,
    redemptionNonce: placementIdentityNonceV1Schema,
    bootstrapSignatureBase64: base64Ed25519SignatureSchema,
  })
  .strict();

export type PlacementIdentityEmailRedemptionRequestV1 = z.infer<
  typeof placementIdentityEmailRedemptionRequestV1Schema
>;

export const placementIdentityEmailResultCodeV1Schema = z.enum([
  'PLACEMENT_IDENTITY_EMAIL_ACCEPTED',
  'PLACEMENT_IDENTITY_EMAIL_INVALID',
  'PLACEMENT_IDENTITY_EMAIL_EXPIRED',
  'PLACEMENT_IDENTITY_EMAIL_CONSUMED',
  'PLACEMENT_IDENTITY_EMAIL_UNAVAILABLE',
]);

export const placementIdentityEmailRedemptionOutcomeV1Schema = z
  .object({
    schema: z.literal('PlacementIdentityEmailRedemptionOutcomeV1'),
    version: z.literal(1),
    transactionId: placementIdentityTransactionIdV1Schema,
    handleDigest: digest64Schema,
    resultCode: placementIdentityEmailResultCodeV1Schema,
    identityReceiptDigest: digest64Schema.optional(),
    accountBindingDigest: digest64Schema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const isAccepted = value.resultCode === 'PLACEMENT_IDENTITY_EMAIL_ACCEPTED';
    if (isAccepted && value.identityReceiptDigest === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['identityReceiptDigest'],
        message: 'accepted email redemption requires an identity receipt digest',
      });
    }
    if (isAccepted && value.accountBindingDigest === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountBindingDigest'],
        message: 'accepted email redemption requires an account binding digest',
      });
    }
    if (!isAccepted && value.identityReceiptDigest !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['identityReceiptDigest'],
        message: 'failed email redemption cannot return an identity receipt digest',
      });
    }
    if (!isAccepted && value.accountBindingDigest !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['accountBindingDigest'],
        message: 'failed email redemption cannot return an account binding digest',
      });
    }
  });

export type PlacementIdentityEmailRedemptionOutcomeV1 = z.infer<
  typeof placementIdentityEmailRedemptionOutcomeV1Schema
>;

function canonicalBytes(fields: readonly (string | number | null)[]): Uint8Array {
  return new TextEncoder().encode(canonicalJson(fields));
}

export function canonicalPlacementIdentityEmailChallengeSignaturePreimageV1(
  input: PlacementIdentityEmailChallengeV1,
): Uint8Array {
  const value = placementIdentityEmailChallengeV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.transactionId,
    value.delegationId,
    value.bootstrapKeyDigest,
    value.handle,
    value.issuedAt,
    value.expiresAt,
    value.signerKeyId,
  ]);
}

export function canonicalPlacementIdentityEmailChallengeV1(
  input: PlacementIdentityEmailChallengeV1,
): Uint8Array {
  const value = placementIdentityEmailChallengeV1Schema.parse(input);
  return new TextEncoder().encode(canonicalJson(value));
}

export function canonicalPlacementIdentityEmailRedemptionRequestSignaturePreimageV1(
  input: PlacementIdentityEmailRedemptionRequestV1,
): Uint8Array {
  const value = placementIdentityEmailRedemptionRequestV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.handle,
    value.transactionId,
    value.delegationId,
    value.bootstrapKeyDigest,
    value.redemptionNonce,
  ]);
}

export function canonicalPlacementIdentityEmailRedemptionRequestV1(
  input: PlacementIdentityEmailRedemptionRequestV1,
): Uint8Array {
  const value = placementIdentityEmailRedemptionRequestV1Schema.parse(input);
  return new TextEncoder().encode(canonicalJson(value));
}

export function canonicalPlacementIdentityEmailRedemptionOutcomeV1(
  input: PlacementIdentityEmailRedemptionOutcomeV1,
): Uint8Array {
  const value = placementIdentityEmailRedemptionOutcomeV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.transactionId,
    value.handleDigest,
    value.resultCode,
    value.identityReceiptDigest ?? null,
    value.accountBindingDigest ?? null,
  ]);
}
