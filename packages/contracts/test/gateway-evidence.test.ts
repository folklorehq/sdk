// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  gatewayEvidenceRecordRequestV2Schema,
  releaseProvenanceBindingV1Schema,
  verifiedReleaseReceiptV1Schema,
} from '../src/inference-gateway.js';

const SOURCE_COMMIT = '1'.repeat(40);
const DIGESTS = Array.from({ length: 16 }, (_, index) => index.toString(16).repeat(64));
const PCR0 = 'f'.repeat(96);

const provenance = {
  protectedSourceCommit: SOURCE_COMMIT,
  eifArtifactPath: 'artifacts/release-1/enclave.eif',
  eifDigest: DIGESTS[0],
  pcr0: PCR0,
  bootRootDigest: DIGESTS[1],
  deploymentId: 'deployment-1',
  runtimeIdentityDigest: DIGESTS[2],
  recipientKmsReceiptDigest: DIGESTS[3],
  assignmentAcknowledgmentDigest: DIGESTS[4],
  routeProofDigest: DIGESTS[5],
  admissionProofDigest: DIGESTS[6],
  queueChecksDigest: DIGESTS[7],
  dlqChecksDigest: DIGESTS[8],
  aciReportSignatureDigest: DIGESTS[9],
  releaseProvenanceDigest: DIGESTS[10],
  finalCommitMarker: DIGESTS[11],
};

const validReceipt = {
  schema: 'VerifiedReleaseReceiptV1' as const,
  releaseId: 'release-1',
  releaseProvenanceDigest: provenance.releaseProvenanceDigest,
  finalCommitMarker: provenance.finalCommitMarker,
};

const validRequest = {
  runId: 'run-1',
  nonce: new Uint8Array(32).fill(7),
  releaseReceipt: validReceipt,
};

describe('typed gateway evidence contracts', () => {
  it('accepts only the closed content-free evidence request', () => {
    expect(gatewayEvidenceRecordRequestV2Schema.parse(validRequest)).toEqual(validRequest);
    expect(verifiedReleaseReceiptV1Schema.parse(validReceipt)).toEqual(validReceipt);
    expect(releaseProvenanceBindingV1Schema.parse(provenance)).toEqual(provenance);
  });

  it('rejects caller context, provenance fields, and signer material', () => {
    const callerFields = [
      'schema',
      'canonicalDomain',
      'orgId',
      'deploymentId',
      'releaseId',
      'protectedSourceCommit',
      'eifArtifactPath',
      'eifDigest',
      'pcr0',
      'bootRootDigest',
      'policyDigest',
      'policyGeneration',
      'activationGeneration',
      'configurationGeneration',
      'keysetEpoch',
      'keysetDigest',
      'keysetHighWaterEpoch',
      'keysetHighWaterDigest',
      'runtimeIdentityDigest',
      'recipientKmsReceiptDigest',
      'assignmentAcknowledgmentDigest',
      'routeProofDigest',
      'admissionProofDigest',
      'queueChecksDigest',
      'dlqChecksDigest',
      'aciReportSignatureDigest',
      'sessionId',
      'bootEpoch',
      'contextDigest',
      'values',
      'signerPurpose',
      'signerKeyId',
      'canonicalBytes',
      'signature',
    ];

    for (const field of callerFields) {
      expect(
        gatewayEvidenceRecordRequestV2Schema.safeParse({
          ...validRequest,
          [field]: 'sentinel',
        }).success,
      ).toBe(false);
    }
  });

  it('rejects malformed run ids, nonces, and release receipts', () => {
    expect(
      gatewayEvidenceRecordRequestV2Schema.safeParse({
        ...validRequest,
        runId: '',
      }).success,
    ).toBe(false);
    expect(
      gatewayEvidenceRecordRequestV2Schema.safeParse({
        ...validRequest,
        runId: 'x'.repeat(129),
      }).success,
    ).toBe(false);
    expect(
      gatewayEvidenceRecordRequestV2Schema.safeParse({
        ...validRequest,
        nonce: new Uint8Array(31),
      }).success,
    ).toBe(false);
    expect(
      gatewayEvidenceRecordRequestV2Schema.safeParse({
        ...validRequest,
        nonce: new Uint8Array(33),
      }).success,
    ).toBe(false);
    expect(
      gatewayEvidenceRecordRequestV2Schema.safeParse({
        ...validRequest,
        nonce: 'not-bytes',
      }).success,
    ).toBe(false);
    expect(
      gatewayEvidenceRecordRequestV2Schema.safeParse({
        ...validRequest,
        releaseReceipt: {
          ...validReceipt,
          releaseProvenanceDigest: 'not-a-digest',
        },
      }).success,
    ).toBe(false);
    expect(
      gatewayEvidenceRecordRequestV2Schema.safeParse({
        ...validRequest,
        releaseReceipt: {
          ...validReceipt,
          schema: 'VerifiedReleaseReceiptV2',
        },
      }).success,
    ).toBe(false);
    expect(
      gatewayEvidenceRecordRequestV2Schema.safeParse({
        ...validRequest,
        releaseReceipt: {
          ...validReceipt,
          deploymentId: 'deployment-1',
        },
      }).success,
    ).toBe(false);
    expect(
      gatewayEvidenceRecordRequestV2Schema.safeParse({
        ...validRequest,
        releaseReceipt: undefined,
      }).success,
    ).toBe(false);
  });
});
