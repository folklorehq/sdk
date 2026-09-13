// SPDX-License-Identifier: Apache-2.0
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';

import {
  base64Ed25519SignatureSchema,
  canonicalJson,
  digest64Schema,
  identifierSchema,
} from '../shared.js';
import {
  PLACEMENT_IDENTITY_MAX_RECEIPT_LIFETIME_MS,
  PLACEMENT_IDENTITY_MAX_RENEWALS,
  PLACEMENT_IDENTITY_MAX_TRANSACTION_LIFETIME_MS,
  placementIdentityMethodV1Schema,
  placementIdentityNonceV1Schema,
  placementIdentityTimestampV1Schema,
  placementIdentityTransactionIdV1Schema,
} from './bootstrap.js';

const accountIdSchema = z.string().uuid();
const selectionKindSchema = z.enum(['new_uuid', 'imported_legacy']);

export const placementIdentityReceiptV1Schema = z
  .object({
    schema: z.literal('PlacementIdentityReceiptV1'),
    version: z.literal(1),
    transactionId: placementIdentityTransactionIdV1Schema,
    delegationId: identifierSchema,
    method: placementIdentityMethodV1Schema,
    accountId: accountIdSchema,
    accountBindingDigest: digest64Schema,
    identityReceiptDigest: digest64Schema,
    bootstrapKeyDigest: digest64Schema,
    identityProofDigest: digest64Schema,
    issuedAt: placementIdentityTimestampV1Schema,
    expiresAt: placementIdentityTimestampV1Schema,
    absoluteExpiresAt: placementIdentityTimestampV1Schema,
    renewalCount: z.number().int().nonnegative().max(PLACEMENT_IDENTITY_MAX_RENEWALS).safe(),
    maxRenewals: z.literal(PLACEMENT_IDENTITY_MAX_RENEWALS),
    signerKeyId: identifierSchema,
    authoritySignatureBase64: base64Ed25519SignatureSchema,
  })
  .strict()
  .superRefine((value, context) => {
    const receiptLifetime =
      new Date(value.expiresAt).getTime() - new Date(value.issuedAt).getTime();
    if (receiptLifetime <= 0 || receiptLifetime > PLACEMENT_IDENTITY_MAX_RECEIPT_LIFETIME_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'receipt expiry must be within five minutes of issue time',
      });
    }
    const absoluteLifetime =
      new Date(value.absoluteExpiresAt).getTime() - new Date(value.issuedAt).getTime();
    if (
      absoluteLifetime <= 0 ||
      absoluteLifetime > PLACEMENT_IDENTITY_MAX_TRANSACTION_LIFETIME_MS
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['absoluteExpiresAt'],
        message: 'absolute expiry must be within the 60-minute transaction lifetime',
      });
    }
    if (new Date(value.absoluteExpiresAt).getTime() < new Date(value.expiresAt).getTime()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['absoluteExpiresAt'],
        message: 'absolute expiry must not precede receipt expiry',
      });
    }
  });

export type PlacementIdentityReceiptV1 = z.infer<typeof placementIdentityReceiptV1Schema>;

export const PLACEMENT_IDENTITY_RECEIPT_IDENTITY_DIGEST_DOMAIN_V1 =
  'folklore.placement-identity-receipt.v1';

// Stable receipt identity fields; excludes identityReceiptDigest, the signature, and volatile
// issuance/expiry/renewal fields so the digest survives renewals.
export const placementIdentityReceiptIdentityPreimageV1Schema = z
  .object({
    schema: z.literal('PlacementIdentityReceiptV1'),
    version: z.literal(1),
    transactionId: placementIdentityTransactionIdV1Schema,
    delegationId: identifierSchema,
    method: placementIdentityMethodV1Schema,
    accountId: accountIdSchema,
    accountBindingDigest: digest64Schema,
    bootstrapKeyDigest: digest64Schema,
    identityProofDigest: digest64Schema,
    absoluteExpiresAt: placementIdentityTimestampV1Schema,
    maxRenewals: z.literal(PLACEMENT_IDENTITY_MAX_RENEWALS),
    signerKeyId: identifierSchema,
  })
  .strict();

export type PlacementIdentityReceiptIdentityPreimageV1 = z.infer<
  typeof placementIdentityReceiptIdentityPreimageV1Schema
>;

export const accountMaterializationEnvelopeV1Schema = z
  .object({
    schema: z.literal('AccountMaterializationEnvelopeV1'),
    version: z.literal(1),
    purpose: z.literal('placement_account_materialization'),
    transactionId: placementIdentityTransactionIdV1Schema,
    delegationId: identifierSchema,
    method: placementIdentityMethodV1Schema,
    accountId: accountIdSchema,
    accountBindingDigest: digest64Schema,
    identityReceiptDigest: digest64Schema,
    selectionKind: selectionKindSchema,
    legacyManifestId: identifierSchema.optional(),
    materializationNonce: placementIdentityNonceV1Schema,
    issuedAt: placementIdentityTimestampV1Schema,
    expiresAt: placementIdentityTimestampV1Schema,
    signerKeyId: identifierSchema,
    signature: base64Ed25519SignatureSchema,
  })
  .strict()
  .superRefine((value, context) => {
    if (value.selectionKind === 'new_uuid' && value.legacyManifestId !== undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['legacyManifestId'],
        message: 'new account selection cannot carry a legacy manifest ID',
      });
    }
    if (value.selectionKind === 'imported_legacy' && value.legacyManifestId === undefined) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['legacyManifestId'],
        message: 'legacy account selection requires a manifest ID',
      });
    }
    const lifetime = new Date(value.expiresAt).getTime() - new Date(value.issuedAt).getTime();
    if (lifetime <= 0 || lifetime > PLACEMENT_IDENTITY_MAX_TRANSACTION_LIFETIME_MS) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expiresAt'],
        message: 'materialization expiry must be within the transaction lifetime',
      });
    }
  });

export type AccountMaterializationEnvelopeV1 = z.infer<
  typeof accountMaterializationEnvelopeV1Schema
>;

export const legacyIdentityBindingEntryV1Schema = z
  .object({
    accountId: accountIdSchema,
    method: placementIdentityMethodV1Schema,
    issuerDigest: digest64Schema,
    subjectDigest: digest64Schema,
    accountBindingDigest: digest64Schema,
    normalizedEmailDigest: digest64Schema.optional(),
    sourceRecordDigest: digest64Schema,
  })
  .strict();

export type LegacyIdentityBindingEntryV1 = z.infer<typeof legacyIdentityBindingEntryV1Schema>;

export const legacyIdentityBindingManifestV1Schema = z
  .object({
    schema: z.literal('LegacyIdentityBindingManifestV1'),
    version: z.literal(1),
    manifestId: identifierSchema,
    idempotencyKey: identifierSchema,
    createdAt: placementIdentityTimestampV1Schema,
    expiresAt: placementIdentityTimestampV1Schema,
    entriesDigest: digest64Schema,
    entries: z.array(legacyIdentityBindingEntryV1Schema).min(1),
    signerKeyId: identifierSchema,
    signature: base64Ed25519SignatureSchema,
  })
  .strict()
  .refine((value) => new Date(value.expiresAt).getTime() > new Date(value.createdAt).getTime(), {
    path: ['expiresAt'],
    message: 'manifest expiry must be later than creation',
  });

export type LegacyIdentityBindingManifestV1 = z.infer<typeof legacyIdentityBindingManifestV1Schema>;

function canonicalBytes(fields: readonly unknown[]): Uint8Array {
  return new TextEncoder().encode(canonicalJson(fields));
}

export function canonicalPlacementIdentityReceiptSignaturePreimageV1(
  input: PlacementIdentityReceiptV1,
): Uint8Array {
  const value = placementIdentityReceiptV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.transactionId,
    value.delegationId,
    value.method,
    value.accountId,
    value.accountBindingDigest,
    value.identityReceiptDigest,
    value.bootstrapKeyDigest,
    value.identityProofDigest,
    value.issuedAt,
    value.expiresAt,
    value.absoluteExpiresAt,
    value.renewalCount,
    value.maxRenewals,
    value.signerKeyId,
  ]);
}

export function canonicalPlacementIdentityReceiptV1(input: PlacementIdentityReceiptV1): Uint8Array {
  const value = placementIdentityReceiptV1Schema.parse(input);
  return new TextEncoder().encode(canonicalJson(value));
}

// Length-prefixed tuple framing, byte-identical to the legacy placement-authority receipt preimages.
function receiptIdentityTuple(fields: readonly (string | number)[]): Uint8Array {
  const encoded = fields.map((field) => utf8ToBytes(String(field)));
  const result = new Uint8Array(4 + encoded.reduce((size, value) => size + 4 + value.length, 0));
  const view = new DataView(result.buffer);
  view.setUint32(0, fields.length);
  let offset = 4;
  for (const value of encoded) {
    view.setUint32(offset, value.length);
    offset += 4;
    result.set(value, offset);
    offset += value.length;
  }
  return result;
}

function receiptIdentityPreimage(
  input: PlacementIdentityReceiptV1 | PlacementIdentityReceiptIdentityPreimageV1,
): PlacementIdentityReceiptIdentityPreimageV1 {
  const receipt = placementIdentityReceiptV1Schema.safeParse(input);
  if (!receipt.success) return placementIdentityReceiptIdentityPreimageV1Schema.parse(input);
  const value = receipt.data;
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

export function canonicalPlacementIdentityReceiptIdentityPreimageV1(
  input: PlacementIdentityReceiptIdentityPreimageV1,
): Uint8Array {
  const value = placementIdentityReceiptIdentityPreimageV1Schema.parse(input);
  return receiptIdentityTuple([
    value.schema,
    value.version,
    value.transactionId,
    value.delegationId,
    value.method,
    value.accountId,
    value.accountBindingDigest,
    value.bootstrapKeyDigest,
    value.identityProofDigest,
    value.absoluteExpiresAt,
    value.maxRenewals,
    value.signerKeyId,
  ]);
}

export function placementIdentityReceiptDigestV1(
  input: PlacementIdentityReceiptV1 | PlacementIdentityReceiptIdentityPreimageV1,
): string {
  const preimage = canonicalPlacementIdentityReceiptIdentityPreimageV1(
    receiptIdentityPreimage(input),
  );
  return bytesToHex(
    sha256(
      concatBytes(
        utf8ToBytes(PLACEMENT_IDENTITY_RECEIPT_IDENTITY_DIGEST_DOMAIN_V1),
        Uint8Array.of(0),
        preimage,
      ),
    ),
  );
}

export function canonicalAccountMaterializationEnvelopeSignaturePreimageV1(
  input: AccountMaterializationEnvelopeV1,
): Uint8Array {
  const value = accountMaterializationEnvelopeV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.purpose,
    value.transactionId,
    value.delegationId,
    value.method,
    value.accountId,
    value.accountBindingDigest,
    value.identityReceiptDigest,
    value.selectionKind,
    value.legacyManifestId ?? null,
    value.materializationNonce,
    value.issuedAt,
    value.expiresAt,
    value.signerKeyId,
  ]);
}

export function canonicalAccountMaterializationEnvelopeV1(
  input: AccountMaterializationEnvelopeV1,
): Uint8Array {
  const value = accountMaterializationEnvelopeV1Schema.parse(input);
  return new TextEncoder().encode(canonicalJson(value));
}

export function canonicalLegacyIdentityBindingManifestSignaturePreimageV1(
  input: LegacyIdentityBindingManifestV1,
): Uint8Array {
  const value = legacyIdentityBindingManifestV1Schema.parse(input);
  return canonicalBytes([
    value.schema,
    value.version,
    value.manifestId,
    value.idempotencyKey,
    value.createdAt,
    value.expiresAt,
    value.entriesDigest,
    value.entries.map((entry) => ({
      accountId: entry.accountId,
      method: entry.method,
      issuerDigest: entry.issuerDigest,
      subjectDigest: entry.subjectDigest,
      accountBindingDigest: entry.accountBindingDigest,
      normalizedEmailDigest: entry.normalizedEmailDigest ?? null,
      sourceRecordDigest: entry.sourceRecordDigest,
    })),
    value.signerKeyId,
  ]);
}

export function canonicalLegacyIdentityBindingManifestV1(
  input: LegacyIdentityBindingManifestV1,
): Uint8Array {
  const value = legacyIdentityBindingManifestV1Schema.parse(input);
  return new TextEncoder().encode(canonicalJson(value));
}
