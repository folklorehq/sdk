// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

import {
  base64Ed25519SignatureSchema,
  canonicalBase64BytesSchema,
  canonicalJson,
  digest64Schema,
  identifierSchema,
} from '../shared.js';
import {
  PLACEMENT_IDENTITY_MAX_RENEWALS,
  PLACEMENT_IDENTITY_MAX_TRANSACTION_LIFETIME_MS,
  placementIdentityNonceV1Schema,
  placementIdentityTimestampV1Schema,
  placementIdentityTransactionIdV1Schema,
} from './bootstrap.js';

const MAX_OPERATION_RESULT_BYTES = 16 * 1024;
const boundedRenewalCountSchema = z
  .number()
  .int()
  .nonnegative()
  .max(PLACEMENT_IDENTITY_MAX_RENEWALS)
  .safe();
const operationResultBytesSchema = canonicalBase64BytesSchema({
  maxDecodedBytes: MAX_OPERATION_RESULT_BYTES,
});

export const placementIdentityOperationStateV1Schema = z.enum(['pending', 'succeeded', 'failed']);

export const placementIdentityOperationResultCodeV1Schema = z.enum([
  'PLACEMENT_IDENTITY_PENDING',
  'PLACEMENT_IDENTITY_ACCEPTED',
  'PLACEMENT_IDENTITY_BEGIN_CONFLICT',
  'PLACEMENT_IDENTITY_OPERATION_CONFLICT',
  'PLACEMENT_IDENTITY_PROOF_REPLAY',
  'PLACEMENT_IDENTITY_EXPIRED',
  'PLACEMENT_IDENTITY_REVOKED',
  'PLACEMENT_IDENTITY_UNAVAILABLE',
]);

export const placementIdentityOperationResultV1Schema = z
  .object({
    schema: z.literal('PlacementIdentityOperationResultV1'),
    version: z.literal(1),
    requestId: identifierSchema,
    operationId: identifierSchema,
    transactionId: placementIdentityTransactionIdV1Schema,
    state: placementIdentityOperationStateV1Schema,
    resultCode: placementIdentityOperationResultCodeV1Schema,
    resultDigest: digest64Schema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.state === 'pending' && value.resultCode !== 'PLACEMENT_IDENTITY_PENDING') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resultCode'],
        message: 'pending results require the pending result code',
      });
    }
    if (value.state === 'succeeded' && value.resultCode !== 'PLACEMENT_IDENTITY_ACCEPTED') {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resultCode'],
        message: 'succeeded results require the accepted result code',
      });
    }
    if (
      value.state === 'failed' &&
      (value.resultCode === 'PLACEMENT_IDENTITY_PENDING' ||
        value.resultCode === 'PLACEMENT_IDENTITY_ACCEPTED')
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['resultCode'],
        message: 'failed results require a terminal failure code',
      });
    }
  });

export type PlacementIdentityOperationResultV1 = z.infer<
  typeof placementIdentityOperationResultV1Schema
>;

export const placementIdentityOperationRecordV1Schema = z
  .object({
    schema: z.literal('PlacementIdentityOperationRecordV1'),
    version: z.literal(1),
    requestId: identifierSchema,
    operationId: identifierSchema,
    transactionId: placementIdentityTransactionIdV1Schema,
    proofDigest: digest64Schema,
    consumedProofNonce: placementIdentityNonceV1Schema,
    state: placementIdentityOperationStateV1Schema,
    pendingResultCanonicalBytesBase64: operationResultBytesSchema.optional(),
    finalResultCanonicalBytesBase64: operationResultBytesSchema.optional(),
    createdAt: placementIdentityTimestampV1Schema,
    expiresAt: placementIdentityTimestampV1Schema,
  })
  .strict()
  .superRefine((value, context) => {
    const lifetime = new Date(value.expiresAt).getTime() - new Date(value.createdAt).getTime();
    if (lifetime <= 0 || lifetime > PLACEMENT_IDENTITY_MAX_TRANSACTION_LIFETIME_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'operation expiry must be within the 60-minute transaction lifetime',
      });
    }
    if (value.state === 'pending' && value.pendingResultCanonicalBytesBase64 === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['pendingResultCanonicalBytesBase64'],
        message: 'pending operations require a pending result',
      });
    }
    if (value.state !== 'pending' && value.finalResultCanonicalBytesBase64 === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['finalResultCanonicalBytesBase64'],
        message: 'terminal operations require a final result',
      });
    }
  });

export type PlacementIdentityOperationRecordV1 = z.infer<
  typeof placementIdentityOperationRecordV1Schema
>;

export const placementIdentityReceiptRenewalRequestV1Schema = z
  .object({
    schema: z.literal('PlacementIdentityReceiptRenewalRequestV1'),
    version: z.literal(1),
    transactionId: placementIdentityTransactionIdV1Schema,
    bootstrapKeyDigest: digest64Schema,
    currentReceiptDigest: digest64Schema,
    expectedRenewalCount: boundedRenewalCountSchema,
    renewalNonce: placementIdentityNonceV1Schema,
    bootstrapSignatureBase64: base64Ed25519SignatureSchema,
  })
  .strict();

export type PlacementIdentityReceiptRenewalRequestV1 = z.infer<
  typeof placementIdentityReceiptRenewalRequestV1Schema
>;

export const placementIdentityRevokeRequestV1Schema = z
  .object({
    schema: z.literal('PlacementIdentityRevokeRequestV1'),
    version: z.literal(1),
    transactionId: placementIdentityTransactionIdV1Schema,
    bootstrapKeyDigest: digest64Schema,
    revokeNonce: placementIdentityNonceV1Schema,
    reason: z.enum(['cancel', 'logout', 'lost_key', 'operator_abort', 'expired']),
    bootstrapSignatureBase64: base64Ed25519SignatureSchema,
  })
  .strict();

export type PlacementIdentityRevokeRequestV1 = z.infer<
  typeof placementIdentityRevokeRequestV1Schema
>;

export const placementIdentityConsumeRequestV1Schema = z
  .object({
    schema: z.literal('PlacementIdentityConsumeRequestV1'),
    version: z.literal(1),
    requestId: identifierSchema,
    transactionId: placementIdentityTransactionIdV1Schema,
    bootstrapKeyDigest: digest64Schema,
    currentReceiptDigest: digest64Schema,
    proofDigest: digest64Schema,
    consumedProofNonce: placementIdentityNonceV1Schema,
  })
  .strict();

export type PlacementIdentityConsumeRequestV1 = z.infer<
  typeof placementIdentityConsumeRequestV1Schema
>;

function canonicalBytes(fields: readonly (string | number | null)[]): Uint8Array {
  return new TextEncoder().encode(canonicalJson(fields));
}

export function canonicalPlacementIdentityOperationResultV1(
  input: PlacementIdentityOperationResultV1,
): Uint8Array {
  const value = placementIdentityOperationResultV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.requestId,
    value.operationId,
    value.transactionId,
    value.state,
    value.resultCode,
    value.resultDigest,
  ]);
}

export function canonicalPlacementIdentityOperationRecordV1(
  input: PlacementIdentityOperationRecordV1,
): Uint8Array {
  const value = placementIdentityOperationRecordV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.requestId,
    value.operationId,
    value.transactionId,
    value.proofDigest,
    value.consumedProofNonce,
    value.state,
    value.pendingResultCanonicalBytesBase64 ?? null,
    value.finalResultCanonicalBytesBase64 ?? null,
    value.createdAt,
    value.expiresAt,
  ]);
}

export function canonicalPlacementIdentityReceiptRenewalRequestSignaturePreimageV1(
  input: PlacementIdentityReceiptRenewalRequestV1,
): Uint8Array {
  const value = placementIdentityReceiptRenewalRequestV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.transactionId,
    value.bootstrapKeyDigest,
    value.currentReceiptDigest,
    value.expectedRenewalCount,
    value.renewalNonce,
  ]);
}

export function canonicalPlacementIdentityReceiptRenewalRequestV1(
  input: PlacementIdentityReceiptRenewalRequestV1,
): Uint8Array {
  const value = placementIdentityReceiptRenewalRequestV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.transactionId,
    value.bootstrapKeyDigest,
    value.currentReceiptDigest,
    value.expectedRenewalCount,
    value.renewalNonce,
    value.bootstrapSignatureBase64,
  ]);
}

export function canonicalPlacementIdentityRevokeRequestSignaturePreimageV1(
  input: PlacementIdentityRevokeRequestV1,
): Uint8Array {
  const value = placementIdentityRevokeRequestV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.transactionId,
    value.bootstrapKeyDigest,
    value.revokeNonce,
    value.reason,
  ]);
}

export function canonicalPlacementIdentityRevokeRequestV1(
  input: PlacementIdentityRevokeRequestV1,
): Uint8Array {
  const value = placementIdentityRevokeRequestV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.transactionId,
    value.bootstrapKeyDigest,
    value.revokeNonce,
    value.reason,
    value.bootstrapSignatureBase64,
  ]);
}

export function canonicalPlacementIdentityConsumeRequestV1(
  input: PlacementIdentityConsumeRequestV1,
): Uint8Array {
  const value = placementIdentityConsumeRequestV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.requestId,
    value.transactionId,
    value.bootstrapKeyDigest,
    value.currentReceiptDigest,
    value.proofDigest,
    value.consumedProofNonce,
  ]);
}
