// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import {
  digest64Schema,
  gitCommitSchema,
  measurement96Schema,
  type Digest64,
  type GitCommit,
  type Measurement96,
} from './shared.js';
import { inferenceModelRoleSchema, type InferenceModelRole } from './inference-trust.js';
import {
  legacyKeysetHighWaterShape,
  releaseProvenanceLegacyKeysetHighWaterFields,
  type LegacyReleaseProvenanceKeysetHighWaterV1,
} from './generation-high-water.js';

const MAX_GATEWAY_STRING_LENGTH = 512;
const MAX_ROLE_BINDINGS = 4;
const MAX_TIMESTAMP = Number.MAX_SAFE_INTEGER;
const EVIDENCE_REQUEST_NONCE_BYTES = 32;

const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const digestSchema = z.string().regex(/^[0-9a-f]{64}$/);
const measurementSchema = z.string().regex(/^[0-9a-f]{96}$/);
const sourceCommitSchema = z.string().regex(/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/);
const providerModelSchema = z
  .string()
  .min(3)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*\/[A-Za-z0-9][A-Za-z0-9._:-]*$/);
const signatureSchema = z
  .string()
  .length(88)
  .regex(/^[A-Za-z0-9+/]{86}==$/);
const nonceSchema = z
  .string()
  .length(44)
  .regex(/^[A-Za-z0-9+/]{43}=$/);
const timestampSchema = z.number().int().safe().positive().max(MAX_TIMESTAMP);
const nullableTimestampSchema = timestampSchema.nullable();
const boundedStringSchema = z
  .string()
  .min(1)
  .max(MAX_GATEWAY_STRING_LENGTH)
  .refine((value) => [...value].every((character) => character.charCodeAt(0) > 0x1f));
const eifArtifactPathSchema = z
  .string()
  .min(1)
  .max(MAX_GATEWAY_STRING_LENGTH)
  .regex(/^artifacts\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*\.eif$/);
const exactHttpsOriginSchema = boundedStringSchema.refine((value) => {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === 'https:' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.pathname === '/' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      parsed.origin === value
    );
  } catch {
    return false;
  }
});
const routeSchema = z
  .string()
  .min(1)
  .max(2_048)
  .regex(
    /^\/(?:[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=:@-]*(?:\/[A-Za-z0-9][A-Za-z0-9._~!$&'()*+,;=:@-]*)*)?$/,
  );
const roleSchema = inferenceModelRoleSchema;

function sortedUnique(values: readonly string[]): boolean {
  return values.every((value, index) => {
    const previous = values[index - 1];
    return index === 0 || (previous !== undefined && previous < value);
  });
}

function addIssue(context: z.RefinementCtx, path: Array<string | number>, message: string): void {
  context.addIssue({ code: z.ZodIssueCode.custom, path, message });
}

const tenantContextSchema = z
  .object({
    tenantId: identifierSchema,
    assignmentDigest: digestSchema,
  })
  .strict();

const issuerSchema = z
  .object({
    workloadId: identifierSchema,
    runtimeIdentityDigest: digestSchema,
    workloadArtifactDigest: digestSchema,
    keyId: identifierSchema,
    attestedKeysetDigest: digestSchema,
  })
  .strict();

const routeProofAuthSchema = z
  .object({
    algorithm: z.literal('Ed25519'),
    signature: signatureSchema,
  })
  .strict();

const routeProofChallengeSchema = z
  .object({
    gatewayNonce: nonceSchema,
    bootEpoch: identifierSchema,
  })
  .strict();

const routeProofConnectionSchema = z
  .object({
    channelKeyDigest: digestSchema,
    exporterLabel: identifierSchema,
    exporterDigest: digestSchema,
    transcriptDigest: digestSchema,
  })
  .strict();

const routeProofRouteSchema = z
  .object({
    origin: exactHttpsOriginSchema,
    route: routeSchema,
    method: z.literal('POST'),
    routeIdentityDigest: digestSchema,
    workloadId: identifierSchema,
  })
  .strict();

// Local proof fields stay out-of-band; official ACI/1 request and receipt fields remain unchanged.
export interface PreForwardRouteProofV1 {
  proofVersion: 1;
  proofId: string;
  requestId: string;
  orgId: string;
  deploymentId: string;
  tenantContext: { tenantId: string; assignmentDigest: string };
  issuer: {
    workloadId: string;
    runtimeIdentityDigest: string;
    workloadArtifactDigest: string;
    keyId: string;
    attestedKeysetDigest: string;
  };
  pinnedTrustRootDigest: string;
  auth: { algorithm: 'Ed25519'; signature: string };
  challenge: { gatewayNonce: string; bootEpoch: string };
  connection: {
    channelKeyDigest: string;
    exporterLabel: string;
    exporterDigest: string;
    transcriptDigest: string;
  };
  route: {
    origin: string;
    route: string;
    method: 'POST';
    routeIdentityDigest: string;
    workloadId: string;
  };
  role: InferenceModelRole;
  sessionId: string;
  model: string;
  modelRevision: string;
  modelArtifactDigest: string;
  snapshotDigest: string;
  policyDigest: string;
  tenantAadDigest: string;
  capabilityDigest: string;
  workloadKeysetDigest: string;
  policyGeneration: number;
  activationGeneration: number;
  issuedAt: number;
  expiresAt: number;
}

export const preForwardRouteProofSchema = z
  .object({
    proofVersion: z.literal(1),
    proofId: identifierSchema,
    requestId: identifierSchema,
    orgId: identifierSchema,
    deploymentId: identifierSchema,
    tenantContext: tenantContextSchema,
    issuer: issuerSchema,
    pinnedTrustRootDigest: digestSchema,
    auth: routeProofAuthSchema,
    challenge: routeProofChallengeSchema,
    connection: routeProofConnectionSchema,
    route: routeProofRouteSchema,
    role: roleSchema,
    sessionId: identifierSchema,
    model: providerModelSchema,
    modelRevision: identifierSchema,
    modelArtifactDigest: digestSchema,
    snapshotDigest: digestSchema,
    policyDigest: digestSchema,
    tenantAadDigest: digestSchema,
    capabilityDigest: digestSchema,
    workloadKeysetDigest: digestSchema,
    policyGeneration: timestampSchema,
    activationGeneration: timestampSchema,
    issuedAt: timestampSchema,
    expiresAt: timestampSchema,
  })
  .strict()
  .superRefine((proof, context) => {
    if (proof.tenantContext.tenantId !== proof.orgId) {
      addIssue(
        context,
        ['tenantContext', 'tenantId'],
        'tenant context must match the organization',
      );
    }
    if (proof.route.workloadId !== proof.issuer.workloadId) {
      addIssue(context, ['route', 'workloadId'], 'route workload must match the issuer workload');
    }
    if (proof.workloadKeysetDigest !== proof.issuer.attestedKeysetDigest) {
      addIssue(
        context,
        ['workloadKeysetDigest'],
        'proof keyset must match the attested issuer keyset',
      );
    }
    if (proof.expiresAt <= proof.issuedAt) {
      addIssue(context, ['expiresAt'], 'proof must expire after issuance');
    }
  });

const evidenceRoleBindingSchema = z
  .object({
    role: roleSchema,
    sessionId: identifierSchema,
    model: providerModelSchema,
    modelRevision: identifierSchema,
    modelArtifactDigest: digestSchema,
    channelKeyDigest: digestSchema,
    expiresAt: timestampSchema,
  })
  .strict();

const evidenceAdmissionSchema = z
  .object({
    decision: z.enum(['admitted', 'rejected']),
    scope: identifierSchema,
    assignmentDigest: digestSchema,
    leaseExpiry: nullableTimestampSchema,
  })
  .strict();

const evidenceTrustedTimeSchema = z
  .object({
    checkpointDigest: digestSchema,
    bootEpoch: identifierSchema,
    sampledAt: timestampSchema,
  })
  .strict();

const evidenceExchangeSchema = z
  .object({
    role: roleSchema,
    servedAt: nullableTimestampSchema,
    result: z.enum(['success', 'failure']),
  })
  .strict();

const commissioningProvenanceSchema = z
  .object({
    protectedSourceCommit: sourceCommitSchema,
    eifArtifactPath: eifArtifactPathSchema,
    eifDigest: digestSchema,
    pcr0: measurementSchema,
    bootRootDigest: digestSchema,
    deploymentId: identifierSchema,
    runtimeIdentityDigest: digestSchema,
    recipientKmsReceiptDigest: digestSchema,
    assignmentAcknowledgmentDigest: digestSchema,
    routeProofDigest: digestSchema,
    admissionProofDigest: digestSchema,
    queueChecksDigest: digestSchema,
    dlqChecksDigest: digestSchema,
    aciReportSignatureDigest: digestSchema,
    releaseProvenanceDigest: digestSchema,
    finalCommitMarker: identifierSchema,
  })
  .strict();

// The evidence envelope type is derived from its strict schema; the legacy keyset high-water
// field shape is imported from the canonical generation contract so the schema and bytes stay in
// one place.
export type GatewayEvidenceEnvelopeV1 = z.infer<typeof gatewayEvidenceEnvelopeSchema>;

export const gatewayEvidenceEnvelopeSchema = z
  .object({
    evidenceId: identifierSchema,
    orgId: identifierSchema,
    deploymentId: identifierSchema,
    tenantContextDigest: digestSchema,
    eifDigest: digestSchema,
    pcr0: measurementSchema,
    bootRootDigest: digestSchema,
    gatewayBuildDigest: digestSchema,
    verifierSourceCommit: sourceCommitSchema,
    verifierArchiveSha256: digestSchema,
    dcapQvlVersion: identifierSchema,
    releaseProvenanceDigest: digestSchema,
    policyDigest: digestSchema,
    policyGeneration: timestampSchema,
    activationGeneration: timestampSchema,
    ...legacyKeysetHighWaterShape,
    routeIdentity: digestSchema,
    keysetDigest: digestSchema,
    roleBindings: z.array(evidenceRoleBindingSchema).min(1).max(MAX_ROLE_BINDINGS),
    admission: evidenceAdmissionSchema,
    trustedTime: evidenceTrustedTimeSchema,
    exchange: evidenceExchangeSchema.nullable(),
    commissioningProvenance: commissioningProvenanceSchema.nullable(),
    failureCode: identifierSchema.nullable(),
    createdAt: timestampSchema,
    signerKeyId: identifierSchema,
    signature: signatureSchema,
  })
  .strict()
  .superRefine((evidence, context) => {
    const roles = evidence.roleBindings.map((binding) => binding.role);
    if (!sortedUnique(roles)) {
      addIssue(context, ['roleBindings'], 'role bindings must be sorted and unique');
    }
    if (
      evidence.exchange !== null &&
      !evidence.roleBindings.some((binding) => binding.role === evidence.exchange?.role)
    ) {
      addIssue(context, ['exchange', 'role'], 'exchange role must have a role binding');
    }
    if (
      evidence.commissioningProvenance !== null &&
      evidence.commissioningProvenance.deploymentId !== evidence.deploymentId
    ) {
      addIssue(
        context,
        ['commissioningProvenance', 'deploymentId'],
        'commissioning provenance must use the evidence deployment',
      );
    }
  });

const cutoverGenerationSchema = timestampSchema.nullable();
const cutoverCurrentSchema = z
  .object({
    manifestDigest: digestSchema.nullable(),
    policyDigest: digestSchema.nullable(),
    policyGeneration: cutoverGenerationSchema,
    activationGeneration: cutoverGenerationSchema,
    configurationGeneration: cutoverGenerationSchema,
  })
  .strict();
const cutoverTargetSchema = z
  .object({
    manifestDigest: digestSchema,
    policyDigest: digestSchema,
    policyGeneration: timestampSchema,
    activationGeneration: timestampSchema,
    configurationGeneration: timestampSchema,
  })
  .strict();
const cutoverLegacyV1Schema = z
  .object({
    manifestDigest: digestSchema.nullable(),
    policyDigest: digestSchema.nullable(),
    generation: cutoverGenerationSchema,
  })
  .strict();
const cutoverProducerSchema = z
  .object({
    sourceCommit: sourceCommitSchema,
    sourceSha: sourceCommitSchema,
    releaseId: identifierSchema,
    releaseProvenanceDigest: digestSchema,
  })
  .strict();
const cutoverConsumerSchema = z
  .object({
    sourceCommit: sourceCommitSchema,
    sourceSha: sourceCommitSchema,
    eifDigest: digestSchema,
    pcr0: measurementSchema,
    bootRootDigest: digestSchema,
    releaseId: identifierSchema,
    releaseProvenanceDigest: digestSchema,
  })
  .strict();
const cutoverCasFenceSchema = z
  .object({
    sequence: timestampSchema,
    expectedVisibleDigest: digestSchema.nullable(),
    expectedPolicyGeneration: cutoverGenerationSchema,
    expectedActivationGeneration: cutoverGenerationSchema,
    nonce: identifierSchema,
  })
  .strict();

export interface V2CutoverRecordV1 {
  cutoverVersion: 1;
  cutoverId: string;
  orgId: string;
  deploymentId: string;
  phase: 'prepared' | 'committed' | 'aborted' | 'rolled_back';
  current: {
    manifestDigest: string | null;
    policyDigest: string | null;
    policyGeneration: number | null;
    activationGeneration: number | null;
    configurationGeneration: number | null;
  };
  target: {
    manifestDigest: string;
    policyDigest: string;
    policyGeneration: number;
    activationGeneration: number;
    configurationGeneration: number;
  };
  legacyV1: {
    manifestDigest: string | null;
    policyDigest: string | null;
    generation: number | null;
  };
  producer: {
    sourceCommit: string;
    sourceSha: string;
    releaseId: string;
    releaseProvenanceDigest: string;
  };
  consumer: {
    sourceCommit: string;
    sourceSha: string;
    eifDigest: string;
    pcr0: string;
    bootRootDigest: string;
    releaseId: string;
    releaseProvenanceDigest: string;
  };
  casFence: {
    sequence: number;
    expectedVisibleDigest: string | null;
    expectedPolicyGeneration: number | null;
    expectedActivationGeneration: number | null;
    nonce: string;
  };
  sequence: number;
  expiresAt: number;
  previousRecordDigest: string | null;
  finalCommitMarker: string;
  signerKeyId: string;
  signature: string;
}

export const v2CutoverRecordSchema = z
  .object({
    cutoverVersion: z.literal(1),
    cutoverId: identifierSchema,
    orgId: identifierSchema,
    deploymentId: identifierSchema,
    phase: z.enum(['prepared', 'committed', 'aborted', 'rolled_back']),
    current: cutoverCurrentSchema,
    target: cutoverTargetSchema,
    legacyV1: cutoverLegacyV1Schema,
    producer: cutoverProducerSchema,
    consumer: cutoverConsumerSchema,
    casFence: cutoverCasFenceSchema,
    sequence: timestampSchema,
    expiresAt: timestampSchema,
    previousRecordDigest: digestSchema.nullable(),
    finalCommitMarker: identifierSchema,
    signerKeyId: identifierSchema,
    signature: signatureSchema,
  })
  .strict()
  .superRefine((record, context) => {
    if (record.casFence.sequence !== record.sequence) {
      addIssue(
        context,
        ['casFence', 'sequence'],
        'CAS fence sequence must match the cutover sequence',
      );
    }
    if (
      record.current.policyGeneration !== null &&
      record.target.policyGeneration < record.current.policyGeneration
    ) {
      addIssue(
        context,
        ['target', 'policyGeneration'],
        'target policy generation cannot move backward',
      );
    }
    if (
      record.current.activationGeneration !== null &&
      record.target.activationGeneration < record.current.activationGeneration
    ) {
      addIssue(
        context,
        ['target', 'activationGeneration'],
        'target activation generation cannot move backward',
      );
    }
  });

const EVIDENCE_VALUE_KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EVIDENCE_VALUE_MAX_COUNT = 1_000_000_000;
const EVIDENCE_VALUE_MAX_ENTRIES = 64;

const evidenceStateSchema = z.enum([
  'admitted',
  'bound',
  'disabled',
  'failed',
  'healthy',
  'pending',
  'rejected',
  'recorded',
  'verified',
]);

const evidenceFailureCodeSchema = z.enum([
  'admission_proof_invalid',
  'digest_recomputation_failed',
  'evidence_invalid',
  'high_water_not_durable',
  'nsm_attestation_invalid',
  'nsm_attestation_missing',
  'policy_invalid',
  'recording_boundary_violation',
  'release_provenance_digest_mismatch',
  'release_provenance_mismatch',
  'route_proof_invalid',
  'route_proof_missing',
  'signer_purpose_mismatch',
  'tenant_context_mismatch',
]);

export const evidenceValueV1Schema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('identifier'), value: identifierSchema }).strict(),
  z.object({ kind: z.literal('digest'), value: digest64Schema }).strict(),
  z
    .object({
      kind: z.literal('boundedCount'),
      value: z.number().int().nonnegative().safe().max(EVIDENCE_VALUE_MAX_COUNT),
    })
    .strict(),
  z.object({ kind: z.literal('timestamp'), value: timestampSchema }).strict(),
  z.object({ kind: z.literal('boolean'), value: z.boolean() }).strict(),
  z.object({ kind: z.literal('state'), value: evidenceStateSchema }).strict(),
  z.object({ kind: z.literal('failureCode'), value: evidenceFailureCodeSchema }).strict(),
]);

export type EvidenceValueV1 = z.infer<typeof evidenceValueV1Schema>;

export const TYPED_EVIDENCE_PROVENANCE_VALUE_KEYS = Object.freeze([
  'policyDigest',
  'policyGeneration',
  'activationGeneration',
  'configurationGeneration',
  'keysetEpoch',
  'keysetDigest',
  'runtimeIdentityDigest',
  'recipientKmsReceiptDigest',
  'assignmentAcknowledgmentDigest',
  'routeProofDigest',
  'admissionProofDigest',
  'queueChecksDigest',
  'dlqChecksDigest',
  'aciReportSignatureDigest',
  'releaseProvenanceDigest',
  'finalCommitMarker',
] as const);

const forbiddenEvidenceValueKeyPattern =
  /^(?:prompt|source|fact|wiki|embedding|body|requestbody|responsebody|rawaci|quote|collateral|eventlog|wire|proof|receipt|exchange|credential|stack|callback)/i;

export const typedGatewayEvidenceValuesSchema = z
  .record(evidenceValueV1Schema)
  .refine((values) => Object.keys(values).length <= EVIDENCE_VALUE_MAX_ENTRIES, {
    message: 'evidence values exceed the bounded entry limit',
  })
  .superRefine((values, context) => {
    for (const key of Object.keys(values)) {
      if (!EVIDENCE_VALUE_KEY_PATTERN.test(key)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'invalid evidence value key',
        });
      }
      if (forbiddenEvidenceValueKeyPattern.test(key.replaceAll('_', '').replaceAll('-', ''))) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'forbidden evidence value key',
        });
      }
    }
    for (const key of TYPED_EVIDENCE_PROVENANCE_VALUE_KEYS) {
      if (!(key in values)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: [key],
          message: 'required provenance value is missing',
        });
      }
    }
  });

export type TypedGatewayEvidenceValuesV1 = Readonly<Record<string, EvidenceValueV1>>;

export interface ReleaseProvenanceContextV1 extends LegacyReleaseProvenanceKeysetHighWaterV1 {
  orgId: string;
  deploymentId: string;
  releaseId: string;
  protectedSourceCommit: GitCommit;
  eifArtifactPath: string;
  eifDigest: Digest64;
  pcr0: Measurement96;
  bootRootDigest: Digest64;
  policyDigest: Digest64;
  policyGeneration: number;
  activationGeneration: number;
}

export interface ReleaseProvenanceBindingV1 {
  protectedSourceCommit: GitCommit;
  eifArtifactPath: string;
  eifDigest: Digest64;
  pcr0: Measurement96;
  bootRootDigest: Digest64;
  deploymentId: string;
  runtimeIdentityDigest: Digest64;
  recipientKmsReceiptDigest: Digest64;
  assignmentAcknowledgmentDigest: Digest64;
  routeProofDigest: Digest64;
  admissionProofDigest: Digest64;
  queueChecksDigest: Digest64;
  dlqChecksDigest: Digest64;
  aciReportSignatureDigest: Digest64;
  releaseProvenanceDigest: Digest64;
  finalCommitMarker: Digest64;
}

export type UnsignedReleaseProvenanceBindingV1 = Omit<
  ReleaseProvenanceBindingV1,
  'releaseProvenanceDigest' | 'finalCommitMarker'
>;

const releaseProvenanceBindingShape = {
  protectedSourceCommit: gitCommitSchema,
  eifArtifactPath: eifArtifactPathSchema,
  eifDigest: digest64Schema,
  pcr0: measurement96Schema,
  bootRootDigest: digest64Schema,
  deploymentId: identifierSchema,
  runtimeIdentityDigest: digest64Schema,
  recipientKmsReceiptDigest: digest64Schema,
  assignmentAcknowledgmentDigest: digest64Schema,
  routeProofDigest: digest64Schema,
  admissionProofDigest: digest64Schema,
  queueChecksDigest: digest64Schema,
  dlqChecksDigest: digest64Schema,
  aciReportSignatureDigest: digest64Schema,
  releaseProvenanceDigest: digest64Schema,
  finalCommitMarker: digest64Schema,
} as const;

export const releaseProvenanceBindingV1Schema = z.object(releaseProvenanceBindingShape).strict();

export function releaseProvenancePayloadV1(input: {
  context: ReleaseProvenanceContextV1;
  binding: UnsignedReleaseProvenanceBindingV1;
}): readonly unknown[] {
  return [
    'folklore.release-provenance.v1',
    input.context.orgId,
    input.context.deploymentId,
    input.context.releaseId,
    input.context.protectedSourceCommit,
    input.context.eifArtifactPath,
    input.context.eifDigest,
    input.context.pcr0,
    input.context.bootRootDigest,
    input.context.policyDigest,
    input.context.policyGeneration,
    input.context.activationGeneration,
    ...releaseProvenanceLegacyKeysetHighWaterFields(input.context),
    input.binding.protectedSourceCommit,
    input.binding.eifArtifactPath,
    input.binding.eifDigest,
    input.binding.pcr0,
    input.binding.bootRootDigest,
    input.binding.deploymentId,
    input.binding.runtimeIdentityDigest,
    input.binding.recipientKmsReceiptDigest,
    input.binding.assignmentAcknowledgmentDigest,
    input.binding.routeProofDigest,
    input.binding.admissionProofDigest,
    input.binding.queueChecksDigest,
    input.binding.dlqChecksDigest,
    input.binding.aciReportSignatureDigest,
  ];
}

export function finalCommitMarkerPayloadV1(input: {
  context: ReleaseProvenanceContextV1;
  binding: UnsignedReleaseProvenanceBindingV1;
  releaseProvenanceDigest: Digest64;
}): readonly unknown[] {
  return [
    'folklore.release-provenance-final-marker.v1',
    ...releaseProvenancePayloadV1(input),
    input.releaseProvenanceDigest,
  ];
}

export interface VerifiedReleaseReceiptV1 {
  schema: 'VerifiedReleaseReceiptV1';
  releaseId: string;
  releaseProvenanceDigest: Digest64;
  finalCommitMarker: Digest64;
}

export const verifiedReleaseReceiptV1Schema = z
  .object({
    schema: z.literal('VerifiedReleaseReceiptV1'),
    releaseId: identifierSchema,
    releaseProvenanceDigest: digest64Schema,
    finalCommitMarker: digest64Schema,
  })
  .strict();

export interface GatewayEvidenceRecordRequestV2 {
  runId: string;
  nonce: Uint8Array;
  releaseReceipt: VerifiedReleaseReceiptV1;
}

export const gatewayEvidenceRecordRequestV2Schema = z
  .object({
    runId: identifierSchema,
    nonce: z
      .instanceof(Uint8Array)
      .refine((nonce) => nonce.byteLength === EVIDENCE_REQUEST_NONCE_BYTES, {
        message: 'evidence nonce must be exactly 32 bytes',
      }),
    releaseReceipt: verifiedReleaseReceiptV1Schema,
  })
  .strict();

export interface EvidenceRecorderPort {
  record(input: GatewayEvidenceRecordRequestV2): Promise<{
    evidenceDigest: Digest64;
    state: 'recorded';
  }>;
}
