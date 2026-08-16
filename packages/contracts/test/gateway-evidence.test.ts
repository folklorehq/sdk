// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  releaseProvenanceBindingV1Schema,
  typedGatewayEvidenceEnvelopeSchema,
  typedGatewayEvidenceInputV1Schema,
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

const values = {
  policyDigest: { kind: 'digest', value: DIGESTS[12] },
  policyGeneration: { kind: 'boundedCount', value: 7 },
  activationGeneration: { kind: 'boundedCount', value: 3 },
  keysetHighWaterEpoch: { kind: 'boundedCount', value: 4 },
  keysetHighWaterDigest: { kind: 'digest', value: DIGESTS[13] },
  runtimeIdentityDigest: { kind: 'digest', value: provenance.runtimeIdentityDigest },
  recipientKmsReceiptDigest: { kind: 'digest', value: provenance.recipientKmsReceiptDigest },
  assignmentAcknowledgmentDigest: {
    kind: 'digest',
    value: provenance.assignmentAcknowledgmentDigest,
  },
  routeProofDigest: { kind: 'digest', value: provenance.routeProofDigest },
  admissionProofDigest: { kind: 'digest', value: provenance.admissionProofDigest },
  queueChecksDigest: { kind: 'digest', value: provenance.queueChecksDigest },
  dlqChecksDigest: { kind: 'digest', value: provenance.dlqChecksDigest },
  aciReportSignatureDigest: { kind: 'digest', value: provenance.aciReportSignatureDigest },
  releaseProvenanceDigest: { kind: 'digest', value: provenance.releaseProvenanceDigest },
  finalCommitMarker: { kind: 'digest', value: provenance.finalCommitMarker },
} as const;

const validInput = {
  schema: 'GatewayEvidenceEnvelopeV1' as const,
  canonicalDomain: 'folklore.aci-gateway-evidence.v1' as const,
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  releaseId: 'release-1',
  protectedSourceCommit: SOURCE_COMMIT,
  eifArtifactPath: provenance.eifArtifactPath,
  eifDigest: provenance.eifDigest,
  pcr0: PCR0,
  bootRootDigest: provenance.bootRootDigest,
  values,
};

describe('typed gateway evidence contracts', () => {
  it('accepts the closed content-free evidence envelope', () => {
    expect(typedGatewayEvidenceInputV1Schema.parse(validInput)).toEqual(validInput);
    expect(
      typedGatewayEvidenceEnvelopeSchema.parse({
        ...validInput,
        signerPurpose: 'evidence-envelope',
        signerKeyId: 'evidence-key-1',
        signature: `${'A'.repeat(86)}==`,
      }),
    ).toMatchObject({ schema: 'GatewayEvidenceEnvelopeV1' });
    expect(releaseProvenanceBindingV1Schema.parse(provenance)).toEqual(provenance);
  });

  it('rejects forbidden content, raw provider material, and callbacks', () => {
    const forbiddenFields = [
      'prompt',
      'source',
      'fact',
      'wiki',
      'embedding',
      'body',
      'rawAciReport',
      'quoteBytes',
      'collateralBytes',
      'eventLogBytes',
      'requestWireSha256',
      'proofId',
      'receiptId',
      'exchangeId',
      'credential',
      'stackTrace',
      'bodyCallback',
    ];

    for (const field of forbiddenFields) {
      expect(
        typedGatewayEvidenceInputV1Schema.safeParse({ ...validInput, [field]: 'sentinel' }).success,
      ).toBe(false);
    }

    expect(
      typedGatewayEvidenceInputV1Schema.safeParse({
        ...validInput,
        values: { ...validInput.values, prompt: { kind: 'identifier', value: 'sentinel' } },
      }).success,
    ).toBe(false);
    expect(
      typedGatewayEvidenceInputV1Schema.safeParse({
        ...validInput,
        values: { ...validInput.values, callback: () => 'sentinel' },
      }).success,
    ).toBe(false);
  });
});
