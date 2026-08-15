// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  durableGenerationHighWaterCheckpointSchema,
  gatewayEvidenceEnvelopeSchema,
  preForwardRouteProofSchema,
  v2CutoverRecordSchema,
} from '../src/inference-gateway.js';
import * as rootContracts from '../src/index.js';

const DIGEST_A = 'a'.repeat(64);
const DIGEST_B = 'b'.repeat(64);
const DIGEST_C = 'c'.repeat(64);
const DIGEST_D = 'd'.repeat(64);
const SOURCE_COMMIT = '1'.repeat(40);
const PCR0 = 'f'.repeat(96);
const SIGNATURE = `${'A'.repeat(86)}==`;
const NONCE = `${'A'.repeat(43)}=`;

const validProof = {
  proofVersion: 1,
  proofId: 'proof-1',
  requestId: 'request-1',
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  tenantContext: { tenantId: 'org-1', assignmentDigest: DIGEST_A },
  issuer: {
    workloadId: 'workload-1',
    runtimeIdentityDigest: DIGEST_B,
    workloadArtifactDigest: DIGEST_C,
    keyId: 'proof-key-1',
    attestedKeysetDigest: DIGEST_D,
  },
  pinnedTrustRootDigest: DIGEST_A,
  auth: { algorithm: 'Ed25519', signature: SIGNATURE },
  challenge: { gatewayNonce: NONCE, bootEpoch: 'boot-epoch-1' },
  connection: {
    channelKeyDigest: DIGEST_B,
    exporterLabel: 'EXPORTER-ACI-CHANNEL',
    exporterDigest: DIGEST_C,
    transcriptDigest: DIGEST_D,
  },
  route: {
    origin: 'https://model.example',
    route: '/v1/chat/completions',
    method: 'POST',
    routeIdentityDigest: DIGEST_A,
    workloadId: 'workload-1',
  },
  role: 'embed',
  sessionId: 'session-embed',
  model: 'provider/model-embed',
  modelRevision: 'revision-embed',
  modelArtifactDigest: DIGEST_B,
  snapshotDigest: DIGEST_C,
  policyDigest: DIGEST_D,
  tenantAadDigest: DIGEST_A,
  capabilityDigest: DIGEST_B,
  workloadKeysetDigest: DIGEST_D,
  policyGeneration: 7,
  activationGeneration: 3,
  issuedAt: 1_700_000_000_000,
  expiresAt: 1_700_000_060_000,
};

const validCheckpoint = {
  checkpointVersion: 1,
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  policyGeneration: 7,
  activationGeneration: 3,
  keysetHighWater: { epoch: 4, digest: DIGEST_A },
  policyDigest: DIGEST_B,
  releaseId: 'release-1',
  protectedSourceCommit: SOURCE_COMMIT,
  eifDigest: DIGEST_C,
  signerKeyId: 'checkpoint-signer-1',
  previousCheckpointDigest: null,
  issuedAt: 1_700_000_000_000,
  checkpointDigest: DIGEST_D,
  signature: SIGNATURE,
};

function evidenceRole(role: 'embed' | 'generate' | 'critique' | 'judge') {
  return {
    role,
    sessionId: `session-${role}`,
    model: `provider/model-${role}`,
    modelRevision: `revision-${role}`,
    modelArtifactDigest: DIGEST_A,
    channelKeyDigest: DIGEST_B,
    expiresAt: 1_700_000_060_000,
  };
}

const validEvidence = {
  evidenceId: 'evidence-1',
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  tenantContextDigest: DIGEST_A,
  eifDigest: DIGEST_B,
  pcr0: PCR0,
  bootRootDigest: DIGEST_C,
  gatewayBuildDigest: DIGEST_D,
  verifierSourceCommit: SOURCE_COMMIT,
  verifierArchiveSha256: DIGEST_A,
  dcapQvlVersion: '0.5.2',
  releaseProvenanceDigest: DIGEST_B,
  policyDigest: DIGEST_C,
  policyGeneration: 7,
  activationGeneration: 3,
  keysetHighWater: { epoch: 4, digest: DIGEST_D },
  routeIdentity: DIGEST_A,
  keysetDigest: DIGEST_B,
  roleBindings: [
    evidenceRole('critique'),
    evidenceRole('embed'),
    evidenceRole('generate'),
    evidenceRole('judge'),
  ],
  admission: {
    decision: 'admitted',
    scope: 'tenant:org-1',
    assignmentDigest: DIGEST_C,
    leaseExpiry: 1_700_000_060_000,
  },
  trustedTime: {
    checkpointDigest: DIGEST_D,
    bootEpoch: 'boot-epoch-1',
    sampledAt: 1_700_000_000_000,
  },
  exchange: { role: 'embed', servedAt: 1_700_000_030_000, result: 'success' },
  commissioningProvenance: {
    protectedSourceCommit: SOURCE_COMMIT,
    eifArtifactPath: 'artifacts/release-1/enclave.eif',
    eifDigest: DIGEST_A,
    pcr0: PCR0,
    bootRootDigest: DIGEST_B,
    deploymentId: 'deployment-1',
    runtimeIdentityDigest: DIGEST_C,
    recipientKmsReceiptDigest: DIGEST_D,
    assignmentAcknowledgmentDigest: DIGEST_A,
    routeProofDigest: DIGEST_B,
    admissionProofDigest: DIGEST_C,
    queueChecksDigest: DIGEST_D,
    dlqChecksDigest: DIGEST_A,
    aciReportSignatureDigest: DIGEST_B,
    releaseProvenanceDigest: DIGEST_C,
    finalCommitMarker: 'commit-marker-1',
  },
  failureCode: null,
  createdAt: 1_700_000_000_000,
  signerKeyId: 'evidence-signer-1',
  signature: SIGNATURE,
};

const validCutover = {
  cutoverVersion: 1,
  cutoverId: 'cutover-1',
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  phase: 'prepared',
  current: {
    manifestDigest: DIGEST_A,
    policyDigest: DIGEST_B,
    policyGeneration: 6,
    activationGeneration: 2,
    configurationGeneration: 10,
  },
  target: {
    manifestDigest: DIGEST_C,
    policyDigest: DIGEST_D,
    policyGeneration: 7,
    activationGeneration: 3,
    configurationGeneration: 11,
  },
  legacyV1: { manifestDigest: null, policyDigest: null, generation: null },
  producer: {
    sourceCommit: SOURCE_COMMIT,
    sourceSha: SOURCE_COMMIT,
    releaseId: 'release-1',
    releaseProvenanceDigest: DIGEST_A,
  },
  consumer: {
    sourceCommit: SOURCE_COMMIT,
    sourceSha: SOURCE_COMMIT,
    eifDigest: DIGEST_B,
    pcr0: PCR0,
    bootRootDigest: DIGEST_C,
    releaseId: 'release-1',
    releaseProvenanceDigest: DIGEST_D,
  },
  casFence: {
    sequence: 2,
    expectedVisibleDigest: DIGEST_A,
    expectedPolicyGeneration: 6,
    expectedActivationGeneration: 2,
    nonce: 'cas-nonce-1',
  },
  sequence: 2,
  expiresAt: 1_700_000_060_000,
  previousRecordDigest: null,
  finalCommitMarker: 'commit-marker-1',
  signerKeyId: 'cutover-signer-1',
  signature: SIGNATURE,
};

describe('controlled inference gateway contracts', () => {
  it('accepts only the strict Ed25519 proof shape', () => {
    expect(preForwardRouteProofSchema.safeParse(validProof).success).toBe(true);
    const { deploymentId: _deploymentId, ...proofWithoutDeploymentId } = validProof;

    const invalidProofs: unknown[] = [
      { ...validProof, auth: { algorithm: 'HMAC-SHA-256', signature: 'x' } },
      { ...validProof, prompt: 'sentinel' },
      { ...validProof, proofId: '' },
      { ...validProof, issuedAt: 1.5 },
      { ...validProof, route: { ...validProof.route, workloadId: 'other-workload' } },
      { ...validProof, tenantContext: { ...validProof.tenantContext, tenantId: 'other-org' } },
      { ...validProof, workloadKeysetDigest: DIGEST_A },
      { ...validProof, expiresAt: validProof.issuedAt },
      {
        ...validProof,
        connection: { ...validProof.connection, exporterLabel: 'provider generated narrative' },
      },
      proofWithoutDeploymentId,
    ];

    for (const candidate of invalidProofs) {
      expect(preForwardRouteProofSchema.safeParse(candidate).success).toBe(false);
    }
    expect(
      preForwardRouteProofSchema.safeParse({
        ...validProof,
        auth: { algorithm: 'Ed25519', signature: SIGNATURE },
      }).success,
    ).toBe(true);
  });

  it('rejects proof content-bearing and unknown fields', () => {
    for (const field of ['body', 'response', 'rawReport', 'requestWireSha256', 'stack']) {
      expect(
        preForwardRouteProofSchema.safeParse({ ...validProof, [field]: 'sentinel' }).success,
      ).toBe(false);
    }
  });

  it('accepts and exports the complete durable high-water checkpoint shape', () => {
    expect(durableGenerationHighWaterCheckpointSchema.safeParse(validCheckpoint).success).toBe(
      true,
    );
    expect(rootContracts.durableGenerationHighWaterCheckpointSchema).toBe(
      durableGenerationHighWaterCheckpointSchema,
    );
    expect(
      durableGenerationHighWaterCheckpointSchema.safeParse({
        ...validCheckpoint,
        deploymentId: '',
      }).success,
    ).toBe(false);
    expect(
      durableGenerationHighWaterCheckpointSchema.safeParse({
        ...validCheckpoint,
        policyGeneration: 0,
      }).success,
    ).toBe(false);
    expect(
      durableGenerationHighWaterCheckpointSchema.safeParse({
        ...validCheckpoint,
        signerKeyId: '',
      }).success,
    ).toBe(false);
  });

  it('rejects evidence content, raw artifacts, generic fields, and duplicate roles', () => {
    expect(gatewayEvidenceEnvelopeSchema.safeParse(validEvidence).success).toBe(true);
    const forbiddenFields = [
      'prompt',
      'response',
      'body',
      'rawReceipt',
      'rawReport',
      'requestWireSha256',
      'stack',
      'arbitraryGenericField',
    ];
    for (const field of forbiddenFields) {
      expect(
        gatewayEvidenceEnvelopeSchema.safeParse({ ...validEvidence, [field]: 'sentinel' }).success,
      ).toBe(false);
    }
    const invalidContentFreeFields = [
      {
        ...validEvidence,
        admission: { ...validEvidence.admission, scope: 'customer admission scope' },
      },
      {
        ...validEvidence,
        commissioningProvenance: {
          ...validEvidence.commissioningProvenance,
          eifArtifactPath: 'raw provider report',
        },
      },
    ];
    for (const candidate of invalidContentFreeFields) {
      expect(gatewayEvidenceEnvelopeSchema.safeParse(candidate).success).toBe(false);
    }
    expect(
      gatewayEvidenceEnvelopeSchema.safeParse({
        ...validEvidence,
        roleBindings: [validEvidence.roleBindings[0], validEvidence.roleBindings[0]],
      }).success,
    ).toBe(false);
  });

  it('requires complete cutover current, target, and CAS fences', () => {
    expect(v2CutoverRecordSchema.safeParse(validCutover).success).toBe(true);
    const incompleteCutovers: unknown[] = [
      { ...validCutover, current: undefined },
      { ...validCutover, target: undefined },
      { ...validCutover, casFence: undefined },
    ];
    for (const candidate of incompleteCutovers) {
      expect(v2CutoverRecordSchema.safeParse(candidate).success).toBe(false);
    }
    expect(
      v2CutoverRecordSchema.safeParse({ ...validCutover, rawReceipt: 'sentinel' }).success,
    ).toBe(false);
    expect(rootContracts.v2CutoverRecordSchema).toBe(v2CutoverRecordSchema);
  });
});
