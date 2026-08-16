// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  ACTIVE_INFERENCE_TRUST_POLICY_V2_CANONICAL_DOMAIN,
  activeInferenceTrustPolicyV2Schema,
  activePolicyAuthorizationEnvelopeV1Schema,
} from '../src/inference-trust.js';

const digest = 'a'.repeat(64);

function roleBinding(role: 'critique' | 'embed' | 'generate' | 'judge'): Record<string, unknown> {
  return {
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    tenantContextDigest: digest,
    role,
    sessionId: `session-${role}`,
    model: `provider/model-${role}`,
    modelRevision: `revision-${role}`,
    modelArtifactDigest: digest,
    upstreamIdentityDigest: digest,
    workloadKeysetDigest: digest,
    channelKeyDigest: digest,
    channelPins: [digest],
    routeIdentityDigest: digest,
    requiredSessionClaims: ['tcb_up_to_date'],
    permittedClaimSources: ['hardware_proven'],
    capabilities: {
      embeddingDimension: role === 'embed' ? 4096 : null,
      maxOutputTokens: role === 'embed' ? null : 8192,
      temperature: role === 'embed' ? 0 : 0.2,
      structuredOutput: role !== 'embed',
    },
    establishedAt: 1_700_000_000_000,
    expiresAt: 1_700_000_060_000,
  };
}

function activePolicy(): Record<string, unknown> {
  return {
    schema: 'active-inference-trust-policy-v2',
    canonicalDomain: ACTIVE_INFERENCE_TRUST_POLICY_V2_CANONICAL_DOMAIN,
    version: 2,
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    policyGeneration: 7,
    activationGeneration: 3,
    configurationGeneration: 11,
    policyAuthorityKeyId: 'policy-authority-1',
    authorizationEnvelopeDigest: digest,
    policyDigest: digest,
    route: {
      origin: 'https://model.example',
      path: '/v1/chat/completions',
      method: 'POST',
      redirectOrigins: [],
    },
    channel: {
      tlsSpkiSha256: [digest],
      e2eeKeyId: 'e2ee-key-1',
      channelKeyDigest: digest,
      exporterLabel: 'EXPORTER-ACI-CHANNEL',
    },
    verifier: {
      dstackSourceCommit: 'a'.repeat(40),
      dstackArchiveSha256: digest,
      verifierSourceCommit: 'b'.repeat(40),
      verifierArchiveSha256: digest,
      quoteRootDigests: [digest],
      acceptedTcbStatuses: ['up_to_date'],
      runtimeIdentityDigest: digest,
      workloadIdentityDigest: digest,
      workloadArtifactDigest: digest,
      routeIdentityDigest: digest,
    },
    permittedModels: ['critique', 'embed', 'generate', 'judge'].map((role) => ({
      model: `provider/model-${role}`,
      modelRevision: `revision-${role}`,
      modelArtifactDigest: digest,
    })),
    roles: {
      critique: roleBinding('critique'),
      embed: roleBinding('embed'),
      generate: roleBinding('generate'),
      judge: roleBinding('judge'),
    },
    proof: {
      version: 'pre-forward-route-proof.v1',
      issuerWorkloadId: 'workload-1',
      pinnedTrustRootDigest: digest,
      proofKeysetDigest: digest,
      maximumLifetimeMs: 60_000,
    },
    minimumHighWater: {
      policyGeneration: 7,
      activationGeneration: 3,
      keysetEpoch: 4,
      keysetDigest: digest,
    },
    lifetime: {
      snapshotExpiresAt: 1_700_000_060_000,
      maximumSessionLifetimeMs: 3_600_000,
      maximumKeysetLifetimeMs: 86_400_000,
      admissionLeaseLifetimeMs: 60_000,
      clockSkewMs: 60_000,
    },
    sourceProvenance: {
      protectedSourceCommit: 'c'.repeat(40),
      sourceArchiveSha256: digest,
      releaseId: 'release-1',
      eifDigest: digest,
      pcr0: 'd'.repeat(96),
      releaseProvenanceDigest: digest,
    },
    rollbackFloor: {
      minimumPolicyGeneration: 7,
      minimumActivationGeneration: 3,
      priorPolicyDigest: null,
    },
  };
}

function envelope(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    schema: 'active-inference-trust-policy-v2-authorization',
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    policyDigest: digest,
    protectedPolicyReference: 's3://policy/org-1/deployment-1/policy.cbor',
    policyGeneration: 7,
    activationGeneration: 3,
    configurationGeneration: 11,
    keysetHighWater: { epoch: 4, digest },
    signerPurpose: 'policy-authority',
    signerKeyId: 'policy-authority-1',
    signatureAlgorithm: 'Ed25519',
    policySignature: 'A'.repeat(86) + '==',
    signature: 'B'.repeat(86) + '==',
    ...overrides,
  };
}

describe('active trust policy authority contracts', () => {
  it('accepts the strict complete active policy domain and signed role bindings', () => {
    const parsed = activeInferenceTrustPolicyV2Schema.parse(activePolicy());

    expect(parsed).toMatchObject({
      canonicalDomain: ACTIVE_INFERENCE_TRUST_POLICY_V2_CANONICAL_DOMAIN,
      policyGeneration: 7,
      activationGeneration: 3,
      configurationGeneration: 11,
      roles: { embed: { capabilities: { temperature: 0 } } },
    });
  });

  it('rejects raw parent policy JSON and caller-owned tuning fields', () => {
    expect(() =>
      activeInferenceTrustPolicyV2Schema.parse({ ...activePolicy(), rawParentPolicyJson: '{}' }),
    ).toThrow();
    expect(() =>
      activeInferenceTrustPolicyV2Schema.parse({ ...activePolicy(), temperature: 0.4 }),
    ).toThrow();
    expect(() =>
      activeInferenceTrustPolicyV2Schema.parse({
        ...activePolicy(),
        roles: {
          ...(activePolicy().roles as Record<string, unknown>),
          embed: {
            ...(activePolicy().roles as Record<string, Record<string, unknown>>).embed,
            temperature: 0.4,
          },
        },
      }),
    ).toThrow();
  });

  it('rejects the reduced authority payload instead of treating it as active policy', () => {
    expect(
      activeInferenceTrustPolicyV2Schema.safeParse({
        schema: 'active-inference-trust-policy-v2',
        canonicalDomain: ACTIVE_INFERENCE_TRUST_POLICY_V2_CANONICAL_DOMAIN,
        orgId: 'org-1',
        deploymentId: 'deployment-1',
        policyGeneration: 7,
        activationGeneration: 3,
        configurationGeneration: 11,
        keysetHighWater: { epoch: 4, digest },
        roleBindings: [],
        legacyAuthorities: [],
      }).success,
    ).toBe(false);
  });

  it('keeps the authorization envelope strict and purpose-bound', () => {
    expect(activePolicyAuthorizationEnvelopeV1Schema.parse(envelope())).toMatchObject({
      signerPurpose: 'policy-authority',
    });
    expect(() =>
      activePolicyAuthorizationEnvelopeV1Schema.parse(envelope({ signerPurpose: 'boot-manifest' })),
    ).toThrow();
  });

  it('requires tenant and keyset high-water context plus the policy signature', () => {
    expect(activePolicyAuthorizationEnvelopeV1Schema.parse(envelope())).toMatchObject({
      orgId: 'org-1',
      deploymentId: 'deployment-1',
      keysetHighWater: { epoch: 4, digest },
      policySignature: expect.any(String),
    });
  });
});
