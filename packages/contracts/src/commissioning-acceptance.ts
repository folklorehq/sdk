// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

import {
  base64Ed25519SignatureSchema,
  canonicalJson,
  digest64Schema,
  gitCommitSchema,
  identifierSchema,
  measurement96Schema,
} from './shared.js';

const CANONICAL_UTC_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const ARTIFACT_PATH_PATTERN = /^artifacts\/[0-9a-f]{40}\/enclave\.eif$/;

export const canonicalUtcTimestampSchema = z
  .string()
  .regex(CANONICAL_UTC_TIMESTAMP_PATTERN, 'timestamp must be canonical UTC')
  .refine((value) => {
    const timestamp = new Date(value);
    return Number.isFinite(timestamp.getTime()) && timestamp.toISOString() === value;
  }, 'timestamp must be a valid UTC instant');

const nonzeroMeasurement96Schema = measurement96Schema.refine(
  (value) => /[1-9a-f]/.test(value),
  'measurement must be nonzero',
);

const releaseSchema = z
  .object({
    protectedSourceCommit: gitCommitSchema,
    eifArtifactPath: z
      .string()
      .regex(ARTIFACT_PATH_PATTERN, 'EIF artifact path must be commit-bound'),
    eifDigest: digest64Schema,
    pcr0: nonzeroMeasurement96Schema,
  })
  .strict()
  .refine(
    (release) =>
      release.eifArtifactPath === `artifacts/${release.protectedSourceCommit}/enclave.eif`,
    'EIF artifact path must match protected source commit',
  );

const runtimeBindingsSchema = z
  .object({
    signerFloorKeysetDigest: digest64Schema,
    inferenceTrustPolicyDigest: digest64Schema,
    assignmentManifestPublicKeyDigest: digest64Schema,
    enclaveOutputKeyConfigDigest: digest64Schema,
    sharedPoolRuntimeConfigDigest: digest64Schema,
  })
  .strict();

export const commissioningAcceptancePayloadV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    canonicalDomain: z.literal('folklore.shared-tier-general-admission.v1'),
    environment: z.literal('prod'),
    decision: z.literal('pass'),
    issuedAt: canonicalUtcTimestampSchema,
    validUntil: canonicalUtcTimestampSchema,
    evidenceSha256: digest64Schema,
    release: releaseSchema,
    runtimeBindings: runtimeBindingsSchema,
  })
  .strict()
  .refine(
    (payload) => new Date(payload.validUntil).getTime() > new Date(payload.issuedAt).getTime(),
    'validUntil must be later than issuedAt',
  );

export type CommissioningAcceptancePayloadV1 = z.infer<
  typeof commissioningAcceptancePayloadV1Schema
>;

export const signedCommissioningAcceptanceEnvelopeV1Schema = z
  .object({
    schemaVersion: z.literal(1),
    algorithm: z.literal('Ed25519'),
    keyId: identifierSchema,
    payload: commissioningAcceptancePayloadV1Schema,
    signature: base64Ed25519SignatureSchema,
  })
  .strict();

export type SignedCommissioningAcceptanceEnvelopeV1 = z.infer<
  typeof signedCommissioningAcceptanceEnvelopeV1Schema
>;

export function commissioningAcceptancePayloadBytes(
  payload: CommissioningAcceptancePayloadV1,
): Uint8Array {
  const parsed = commissioningAcceptancePayloadV1Schema.parse(payload);
  return new TextEncoder().encode(canonicalJson(parsed));
}
