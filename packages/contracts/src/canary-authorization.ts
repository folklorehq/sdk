// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

const OPAQUE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const ED25519_PUBLIC_KEY_PATTERN = /^[A-Za-z0-9+/]{43}=$/;
const ED25519_SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{86}==$/;
const CANARY_FACT_COUNT_MAX = 1_000_000;

const authorizationFields = {
  org_id: z.string().min(1).max(128),
  deployment_id: z.string().min(1).max(128),
  canary_run_id: z.string().uuid(),
  request_id: z.string().regex(OPAQUE_ID_PATTERN),
  body_sha256: z.string().regex(SHA256_PATTERN),
  attestation_challenge_id: z.string().uuid(),
  attestation_generation: z.string().uuid(),
  attestation_session_key_sha256: z.string().regex(SHA256_PATTERN),
};

export const canaryAuthorizationRequestSchema = z
  .object({
    org_id: authorizationFields.org_id,
    canary_run_id: authorizationFields.canary_run_id,
    request_id: authorizationFields.request_id,
    body_sha256: authorizationFields.body_sha256,
    attestation_challenge_id: authorizationFields.attestation_challenge_id,
  })
  .strict();

export const canaryAuthorizationSchema = z
  .object({
    version: z.literal(1),
    authorization_id: z.string().uuid(),
    ...authorizationFields,
    issued_at: z.string().datetime({ offset: true }),
    expires_at: z.string().datetime({ offset: true }),
  })
  .strict();

export const canaryAuthorizationProofSchema = z
  .object({
    ...canaryAuthorizationSchema.shape,
    public_key: z.string().regex(ED25519_PUBLIC_KEY_PATTERN),
    signature: z.string().regex(ED25519_SIGNATURE_PATTERN),
  })
  .strict();

export const canaryAuthorizationOutcomeProofSchema = canaryAuthorizationProofSchema
  .extend({
    status: z.literal('succeeded'),
    fact_count: z.number().int().nonnegative().max(CANARY_FACT_COUNT_MAX),
    outcome_sha256: z.string().regex(SHA256_PATTERN),
  })
  .strict();

export type CanaryAuthorizationRequest = z.infer<typeof canaryAuthorizationRequestSchema>;
export type CanaryAuthorization = z.infer<typeof canaryAuthorizationSchema>;
export type CanaryAuthorizationProof = z.infer<typeof canaryAuthorizationProofSchema>;
export type CanaryAuthorizationOutcomeProof = z.infer<typeof canaryAuthorizationOutcomeProofSchema>;

export function canaryAuthorizationAad(authorization: CanaryAuthorization): CanaryAuthorization {
  return {
    version: authorization.version,
    authorization_id: authorization.authorization_id,
    org_id: authorization.org_id,
    deployment_id: authorization.deployment_id,
    canary_run_id: authorization.canary_run_id,
    request_id: authorization.request_id,
    body_sha256: authorization.body_sha256,
    attestation_challenge_id: authorization.attestation_challenge_id,
    attestation_generation: authorization.attestation_generation,
    attestation_session_key_sha256: authorization.attestation_session_key_sha256,
    issued_at: authorization.issued_at,
    expires_at: authorization.expires_at,
  };
}

export function canaryAuthorizationProofPayload(
  proof: Pick<
    CanaryAuthorizationProof,
    | 'version'
    | 'authorization_id'
    | 'org_id'
    | 'deployment_id'
    | 'canary_run_id'
    | 'request_id'
    | 'body_sha256'
    | 'attestation_challenge_id'
    | 'attestation_generation'
    | 'attestation_session_key_sha256'
    | 'issued_at'
    | 'expires_at'
    | 'public_key'
  >,
): string {
  return [
    'folklore.canary.authorization-proof.v1',
    String(proof.version),
    proof.authorization_id,
    proof.org_id,
    proof.deployment_id,
    proof.canary_run_id,
    proof.request_id,
    proof.body_sha256,
    proof.attestation_challenge_id,
    proof.attestation_generation,
    proof.attestation_session_key_sha256,
    proof.issued_at,
    proof.expires_at,
    proof.public_key,
  ].join('\0');
}

export function canaryAuthorizationOutcomeProofPayload(
  proof: Pick<
    CanaryAuthorizationOutcomeProof,
    | 'version'
    | 'authorization_id'
    | 'org_id'
    | 'deployment_id'
    | 'canary_run_id'
    | 'request_id'
    | 'body_sha256'
    | 'attestation_challenge_id'
    | 'attestation_generation'
    | 'attestation_session_key_sha256'
    | 'issued_at'
    | 'expires_at'
    | 'public_key'
    | 'status'
    | 'fact_count'
    | 'outcome_sha256'
  >,
): string {
  return [
    'folklore.canary.authorization-outcome-proof.v1',
    canaryAuthorizationProofPayload(proof),
    proof.status,
    String(proof.fact_count),
    proof.outcome_sha256,
  ].join('\0');
}

export interface CanaryPipelineOutcomeFactDigest {
  fact_id: string;
  body_sha256: string;
}

export function canaryPipelineOutcomePayload(input: {
  authorization_id: string;
  body_sha256: string;
  fact_count: number;
  fact_digests: readonly CanaryPipelineOutcomeFactDigest[];
}): string {
  const factDigests = [...input.fact_digests].sort((left, right) =>
    left.fact_id.localeCompare(right.fact_id),
  );
  return [
    'folklore.canary.pipeline-outcome.v1',
    input.authorization_id,
    input.body_sha256,
    String(input.fact_count),
    ...factDigests.flatMap((fact) => [fact.fact_id, fact.body_sha256]),
  ].join('\0');
}
