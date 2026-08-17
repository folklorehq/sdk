// SPDX-License-Identifier: Apache-2.0
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  aciReceiptSchema,
  aciSessionSchema,
  aciWorkloadReportSchema,
  ACTIVE_INFERENCE_TRUST_POLICY_V2_CANONICAL_DOMAIN,
  activeInferenceTrustPolicyV2Schema,
  inferenceReceiptV1Payload,
  inferenceReceiptV1Schema,
  inferenceTrustPolicyV1Schema,
  inferenceTrustPolicyV2Schema,
} from '../src/inference-trust.js';
import {
  ACI_POLICY_FIXTURE,
  ACI_RECEIPT_FIXTURE,
  ACI_REPORT_FIXTURE,
  ACI_SESSION_FIXTURE,
} from './fixtures/aci-v1.js';

function receiptFixture(): Record<string, unknown> {
  return {
    version: 1,
    requestSha256: 'a'.repeat(64),
    responseSha256: 'b'.repeat(64),
    model: 'z-ai/glm-5.2',
    modelRevision: '2026-08-09',
    nonce: 'A'.repeat(43) + '=',
    channelKeyDigest: 'c'.repeat(64),
    workloadId: 'workload-1',
    route: '/v1/inference',
    trustPolicyGeneration: 2,
    sequence: 3,
    signerKeyId: 'receipt-key-1',
    algorithm: 'Ed25519',
    signature: 'A'.repeat(86) + '==',
  };
}

function policyV1Fixture(): Record<string, unknown> {
  const model = { model: 'z-ai/glm-5.2', revision: '2026-08-09' };
  return {
    version: 1,
    generation: 2,
    origin: 'https://inference.example',
    route: '/v1/inference',
    redirectOrigins: [],
    tlsSpkiSha256: ['a'.repeat(64)],
    workloadId: 'workload-1',
    quoteRootDigests: ['a'.repeat(64)],
    workloadMeasurements: ['b'.repeat(96)],
    attestationKeys: [
      { keyId: 'attestation-key-1', algorithm: 'Ed25519', publicKey: 'A'.repeat(43) + '=' },
    ],
    receiptKeys: [
      { keyId: 'receipt-key-1', algorithm: 'Ed25519', publicKey: 'A'.repeat(43) + '=' },
    ],
    permittedModels: [model],
    roleModels: {
      embed: model,
      generate: model,
      judge: model,
      critique: model,
    },
  };
}

function policyV2Fixture(): Record<string, unknown> {
  const model = { model: 'z-ai/glm-5.2', revision: '2026-08-09' };
  return {
    version: 2,
    generation: 3,
    origin: 'https://inference.phala.com',
    route: '/v1/chat/completions',
    channelPolicy: {
      acceptedBindings: [{ type: 'tls_spki_sha256', domains: ['inference.phala.com'] }],
    },
    evidence: {
      teeTypes: ['tdx'],
      quoteRootDigests: ['a'.repeat(64)],
      tcbStatuses: ['up_to_date'],
      runtimeMeasurements: ['b'.repeat(96)],
      runtimeRtmrs: ['c'.repeat(96)],
      runtimeIdentities: ['runtime:inference'],
      dstackAppIdentities: ['app:inference'],
      measuredComposeDigests: ['sha256:' + 'd'.repeat(64)],
      imageDigests: [],
      dstackKmsRoots: ['e'.repeat(64)],
    },
    sourceProvenance: {
      repositories: [
        {
          repoUrl: 'https://github.com/example/inference',
          commits: ['0123456789abcdef0123456789abcdef01234567'],
        },
      ],
      imageDigests: [],
    },
    requiredSessionClaims: ['tcb_up_to_date', 'tee_attested'],
    permittedClaimSources: ['hardware_proven', 'verifier_derived'],
    permittedModels: [model],
    roleModels: { embed: model, generate: model, critique: model, judge: model },
    maxKeysetLifetimeSeconds: 86_400,
    maxSessionLifetimeSeconds: 3_600,
    clockSkewSeconds: 60,
  };
}

function activeRoleFixture(
  role: 'embed' | 'generate' | 'critique' | 'judge',
  model: string,
  modelRevision: string,
  modelArtifactDigest: string,
): Record<string, unknown> {
  return {
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    tenantContextDigest: 'a'.repeat(64),
    role,
    sessionId: `session-${role}`,
    model,
    modelRevision,
    modelArtifactDigest,
    upstreamIdentityDigest: 'b'.repeat(64),
    workloadKeysetDigest: 'c'.repeat(64),
    channelKeyDigest: 'd'.repeat(64),
    channelPins: ['e'.repeat(64)],
    routeIdentityDigest: 'f'.repeat(64),
    requiredSessionClaims: ['tcb_up_to_date', 'tee_attested'],
    permittedClaimSources: ['hardware_proven', 'verifier_derived'],
    capabilities: {
      embeddingDimension: role === 'embed' ? 4096 : null,
      maxOutputTokens: role === 'embed' ? null : 8192,
      temperature: 0,
      structuredOutput: role !== 'embed',
    },
    establishedAt: 1_700_000_000_000,
    expiresAt: 1_700_000_060_000,
  };
}

function activePolicyFixture(): Record<string, unknown> {
  const models = [
    {
      model: 'provider/model-critique',
      modelRevision: 'revision-critique',
      modelArtifactDigest: '1'.repeat(64),
    },
    {
      model: 'provider/model-embed',
      modelRevision: 'revision-embed',
      modelArtifactDigest: '2'.repeat(64),
    },
    {
      model: 'provider/model-generate',
      modelRevision: 'revision-generate',
      modelArtifactDigest: '3'.repeat(64),
    },
    {
      model: 'provider/model-judge',
      modelRevision: 'revision-judge',
      modelArtifactDigest: '4'.repeat(64),
    },
  ];
  return {
    schema: 'active-inference-trust-policy-v2',
    canonicalDomain: 'folklore.inference-trust-policy-v2-active',
    version: 2,
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    policyGeneration: 7,
    activationGeneration: 3,
    configurationGeneration: 11,
    policyAuthorityKeyId: 'policy-authority-1',
    authorizationEnvelopeDigest: '5'.repeat(64),
    policyDigest: '6'.repeat(64),
    route: {
      origin: 'https://model.example',
      path: '/v1/chat/completions',
      method: 'POST',
      redirectOrigins: [],
    },
    channel: {
      tlsSpkiSha256: ['7'.repeat(64)],
      e2eeKeyId: 'e2ee-key-1',
      channelKeyDigest: '8'.repeat(64),
      exporterLabel: 'EXPORTER-ACI-CHANNEL',
    },
    verifier: {
      dstackSourceCommit: 'a'.repeat(40),
      dstackArchiveSha256: '9'.repeat(64),
      verifierSourceCommit: 'b'.repeat(40),
      verifierArchiveSha256: 'a'.repeat(64),
      quoteRootDigests: ['b'.repeat(64)],
      acceptedTcbStatuses: ['up_to_date'],
      runtimeIdentityDigest: 'c'.repeat(64),
      workloadIdentityDigest: 'd'.repeat(64),
      workloadArtifactDigest: 'e'.repeat(64),
      routeIdentityDigest: 'f'.repeat(64),
    },
    permittedModels: models,
    roles: {
      embed: activeRoleFixture(
        'embed',
        models[1].model,
        models[1].modelRevision,
        models[1].modelArtifactDigest,
      ),
      generate: activeRoleFixture(
        'generate',
        models[2].model,
        models[2].modelRevision,
        models[2].modelArtifactDigest,
      ),
      critique: activeRoleFixture(
        'critique',
        models[0].model,
        models[0].modelRevision,
        models[0].modelArtifactDigest,
      ),
      judge: activeRoleFixture(
        'judge',
        models[3].model,
        models[3].modelRevision,
        models[3].modelArtifactDigest,
      ),
    },
    proof: {
      version: 'pre-forward-route-proof.v1',
      issuerWorkloadId: 'workload-1',
      pinnedTrustRootDigest: '1'.repeat(64),
      proofKeysetDigest: '2'.repeat(64),
      maximumLifetimeMs: 60_000,
    },
    minimumHighWater: {
      policyGeneration: 7,
      activationGeneration: 3,
      keysetEpoch: 4,
      keysetDigest: '3'.repeat(64),
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
      sourceArchiveSha256: '4'.repeat(64),
      releaseId: 'release-1',
      eifDigest: '5'.repeat(64),
      pcr0: 'd'.repeat(96),
      releaseProvenanceDigest: '6'.repeat(64),
    },
    rollbackFloor: {
      minimumPolicyGeneration: 7,
      minimumActivationGeneration: 3,
      priorPolicyDigest: null,
    },
  };
}

function policyDigests(count: number): string[] {
  return Array.from({ length: count }, (_, index) => index.toString(16).padStart(64, '0'));
}

function policyModels(count: number): Array<{ model: string; revision: string }> {
  return Array.from({ length: count }, (_, index) => ({
    model: `provider/model-${index.toString().padStart(2, '0')}`,
    revision: '2026-08-09',
  }));
}

function policyBindings(count: number): Array<{
  type: 'tls_spki_sha256';
  domains: string[];
}> {
  return Array.from({ length: count }, (_, index) => ({
    type: 'tls_spki_sha256',
    domains: [`${index.toString().padStart(2, '0')}.example.com`],
  }));
}

describe('inferenceTrustPolicyV1Schema', () => {
  it('requires offline-authorized TLS SPKI pins alongside attestation keys and role bindings', () => {
    expect(() =>
      inferenceTrustPolicyV1Schema.parse({
        version: 1,
        generation: 2,
        origin: 'https://inference.example',
        route: '/v1/inference',
        redirectOrigins: [],
        workloadId: 'workload-1',
        quoteRootDigests: ['a'.repeat(64)],
        workloadMeasurements: ['b'.repeat(96)],
        attestationKeys: [
          { keyId: 'attestation-key-1', algorithm: 'Ed25519', publicKey: 'A'.repeat(43) + '=' },
        ],
        receiptKeys: [
          { keyId: 'receipt-key-1', algorithm: 'Ed25519', publicKey: 'A'.repeat(43) + '=' },
        ],
        permittedModels: [{ model: 'z-ai/glm-5.2', revision: '2026-08-09' }],
        roleModels: {
          embed: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
          generate: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
          judge: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
          critique: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        },
      }),
    ).toThrow();
  });

  it('accepts only offline-pinned exact origins, routes, roots, measurements, keys, and models', () => {
    const policy = inferenceTrustPolicyV1Schema.parse({
      version: 1,
      generation: 2,
      origin: 'https://inference.example',
      route: '/v1/inference',
      redirectOrigins: ['https://backup.example'],
      tlsSpkiSha256: ['a'.repeat(64)],
      workloadId: 'workload-1',
      quoteRootDigests: ['a'.repeat(64)],
      workloadMeasurements: ['b'.repeat(96)],
      attestationKeys: [
        { keyId: 'attestation-key-1', algorithm: 'Ed25519', publicKey: 'A'.repeat(43) + '=' },
      ],
      receiptKeys: [
        { keyId: 'receipt-key-1', algorithm: 'Ed25519', publicKey: 'A'.repeat(43) + '=' },
      ],
      permittedModels: [{ model: 'z-ai/glm-5.2', revision: '2026-08-09' }],
      roleModels: {
        embed: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        generate: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        judge: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        critique: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
      },
    });

    expect(policy.origin).toBe('https://inference.example');
    expect(() =>
      inferenceTrustPolicyV1Schema.parse({ ...policy, origin: 'https://inference.example/path' }),
    ).toThrow();
    expect(() =>
      inferenceTrustPolicyV1Schema.parse({ ...policy, origin: 'https://user@inference.example' }),
    ).toThrow();
    expect(() =>
      inferenceTrustPolicyV1Schema.parse({ ...policy, route: 'https://inference.example/v1' }),
    ).toThrow();
    expect(() =>
      inferenceTrustPolicyV1Schema.parse({
        ...policy,
        redirectOrigins: ['https://z.example', 'https://a.example'],
      }),
    ).toThrow();
    expect(() =>
      inferenceTrustPolicyV1Schema.parse({
        ...policy,
        providerKeyUrl: 'https://provider.example/keys',
      }),
    ).toThrow();
    expect(
      inferenceTrustPolicyV1Schema.parse({
        ...policy,
        permittedModels: [
          { model: 'qwen/qwen3-32b', revision: '2026-08-09' },
          { model: 'qwen/qwen3-embedding-8b', revision: '2026-08-10' },
          { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        ],
      }).permittedModels,
    ).toHaveLength(3);
    for (const model of ['glm-5.2', 'z-ai/', '/glm-5.2', 'z-ai//glm-5.2', 'z-ai/glm\u00005.2']) {
      expect(() =>
        inferenceTrustPolicyV1Schema.parse({
          ...policy,
          permittedModels: [{ model, revision: '2026-08-09' }],
        }),
      ).toThrow();
    }
  });

  it('accepts only canonical non-empty route segments', () => {
    const policy = inferenceTrustPolicyV1Schema.parse({
      version: 1,
      generation: 2,
      origin: 'https://inference.example',
      route: '/v1/inference',
      redirectOrigins: [],
      tlsSpkiSha256: ['a'.repeat(64)],
      workloadId: 'workload-1',
      quoteRootDigests: ['a'.repeat(64)],
      workloadMeasurements: ['b'.repeat(96)],
      attestationKeys: [
        { keyId: 'attestation-key-1', algorithm: 'Ed25519', publicKey: 'A'.repeat(43) + '=' },
      ],
      receiptKeys: [
        { keyId: 'receipt-key-1', algorithm: 'Ed25519', publicKey: 'A'.repeat(43) + '=' },
      ],
      permittedModels: [{ model: 'z-ai/glm-5.2', revision: '2026-08-09' }],
      roleModels: {
        embed: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        generate: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        judge: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        critique: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
      },
    });

    for (const route of ['/v1/inference', '/v1/chat/completions', '/v1/embeddings']) {
      expect(inferenceTrustPolicyV1Schema.parse({ ...policy, route }).route).toBe(route);
    }
    for (const route of [
      '/v1/%2f',
      '/v1/%2F',
      '/v1/%',
      '/v1/a%00b',
      '/v1/%2e',
      '/v1/%2E%2E',
      '/v1/.',
      '/v1/..',
      '/v1//a',
    ]) {
      expect(() => inferenceTrustPolicyV1Schema.parse({ ...policy, route })).toThrow();
    }
  });
});

describe('inferenceReceiptV1Schema', () => {
  it('canonically binds every exchange claim and the receipt signer to a real Ed25519 signature', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyBytes = publicKey
      .export({ format: 'der', type: 'spki' })
      .subarray(-32)
      .toString('base64');
    const unsigned = inferenceReceiptV1Schema.parse({
      ...receiptFixture(),
      signerKeyId: 'receipt-key-1',
    });
    const signature = sign(
      null,
      Buffer.from(inferenceReceiptV1Payload(unsigned)),
      privateKey,
    ).toString('base64');
    const receipt = inferenceReceiptV1Schema.parse({ ...unsigned, signature });
    const payload = Buffer.from(inferenceReceiptV1Payload(receipt));

    expect(inferenceReceiptV1Payload(receipt)).toBe(
      `folklore.inference-receipt.v1\u00001\u0000${'a'.repeat(64)}\u0000${'b'.repeat(64)}\u0000z-ai/glm-5.2\u00002026-08-09\u0000${'A'.repeat(43)}=\u0000${'c'.repeat(64)}\u0000workload-1\u0000/v1/inference\u00002\u00003\u0000receipt-key-1\u0000Ed25519`,
    );
    expect(verify(null, payload, publicKey, Buffer.from(receipt.signature, 'base64'))).toBe(true);
    expect(publicKeyBytes).toHaveLength(44);

    const changes: ReadonlyArray<Record<string, unknown>> = [
      { ...receipt, requestSha256: 'd'.repeat(64) },
      { ...receipt, responseSha256: 'e'.repeat(64) },
      { ...receipt, model: 'qwen/qwen3-32b' },
      { ...receipt, modelRevision: '2026-08-10' },
      { ...receipt, nonce: 'B'.repeat(43) + '=' },
      { ...receipt, channelKeyDigest: 'f'.repeat(64) },
      { ...receipt, workloadId: 'workload-2' },
      { ...receipt, route: '/v1/other' },
      { ...receipt, trustPolicyGeneration: 4 },
      { ...receipt, sequence: 4 },
      { ...receipt, signerKeyId: 'receipt-key-2' },
    ];
    for (const changed of changes) {
      const changedPayload = Buffer.from(
        inferenceReceiptV1Payload(inferenceReceiptV1Schema.parse(changed)),
      );
      expect(
        verify(null, changedPayload, publicKey, Buffer.from(receipt.signature, 'base64')),
      ).toBe(false);
    }
    for (const field of Object.keys(receipt)) {
      expect(() =>
        inferenceReceiptV1Schema.parse(
          Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== field)),
        ),
      ).toThrow();
    }
  });

  it('rejects malformed or content-bearing receipt claims', () => {
    const receipt = receiptFixture();
    expect(() =>
      inferenceReceiptV1Schema.parse({ ...receipt, requestSha256: 'A'.repeat(64) }),
    ).toThrow();
    expect(() => inferenceReceiptV1Schema.parse({ ...receipt, nonce: 'A'.repeat(44) })).toThrow();
    expect(() => inferenceReceiptV1Schema.parse({ ...receipt, model: 'm'.repeat(129) })).toThrow();
    expect(() => inferenceReceiptV1Schema.parse({ ...receipt, model: 'z-ai//glm-5.2' })).toThrow();
    expect(() => inferenceReceiptV1Schema.parse({ ...receipt, sequence: 0 })).toThrow();
    expect(() =>
      inferenceReceiptV1Schema.parse({ ...receipt, response: 'customer content' }),
    ).toThrow();
  });
});

describe('inferenceTrustPolicyV2Schema', () => {
  it('keeps TLS certificate bindings bounded but excludes them from enforceable policy', () => {
    expect(
      aciSessionSchema.safeParse({
        ...ACI_SESSION_FIXTURE,
        channel_binding: [
          {
            type: 'tls_certificate_sha256',
            origin: 'https://upstream.example.com',
            certificate_sha256: 'a'.repeat(64),
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      inferenceTrustPolicyV2Schema.safeParse({
        ...ACI_POLICY_FIXTURE,
        channelPolicy: {
          acceptedBindings: [{ type: 'tls_certificate_sha256', domains: ['upstream.example.com'] }],
        },
      }).success,
    ).toBe(false);
  });

  it('accepts reviewed evidence, provenance, channel, model, and role bindings', () => {
    const policy = inferenceTrustPolicyV2Schema.parse(ACI_POLICY_FIXTURE);

    expect(policy.version).toBe(2);
    expect(policy.origin).toBe('https://inference.phala.com');
    expect(policy.route).toBe('/v1/chat/completions');
    expect(policy.roleModels.judge).toEqual({ model: 'z-ai/glm-5.2', revision: '2026-08-09' });
  });

  it('rejects unsorted or duplicate anchors and unpermitted role models', () => {
    expect(() =>
      inferenceTrustPolicyV2Schema.parse({
        ...ACI_POLICY_FIXTURE,
        evidence: {
          ...ACI_POLICY_FIXTURE.evidence,
          quoteRootDigests: ['b'.repeat(64), 'a'.repeat(64)],
        },
      }),
    ).toThrow();
    expect(() =>
      inferenceTrustPolicyV2Schema.parse({
        ...ACI_POLICY_FIXTURE,
        roleModels: {
          ...ACI_POLICY_FIXTURE.roleModels,
          judge: { model: 'qwen/qwen3-32b', revision: '2026-08-09' },
        },
      }),
    ).toThrow();
  });

  it('rejects duplicates across shared policy anchor refinements', () => {
    const duplicateCases: unknown[] = [
      {
        ...ACI_POLICY_FIXTURE,
        requiredSessionClaims: ['tee_attested', 'tee_attested'],
      },
      {
        ...ACI_POLICY_FIXTURE,
        permittedClaimSources: ['hardware_proven', 'hardware_proven'],
      },
      {
        ...ACI_POLICY_FIXTURE,
        evidence: {
          ...ACI_POLICY_FIXTURE.evidence,
          runtimeMeasurements: ['b'.repeat(96), 'b'.repeat(96)],
        },
      },
      {
        ...ACI_POLICY_FIXTURE,
        evidence: {
          ...ACI_POLICY_FIXTURE.evidence,
          runtimeRtmrs: ['b'.repeat(96), 'b'.repeat(96)],
        },
      },
      {
        ...ACI_POLICY_FIXTURE,
        evidence: {
          ...ACI_POLICY_FIXTURE.evidence,
          runtimeIdentities: ['runtime:inference', 'runtime:inference'],
        },
      },
      {
        ...ACI_POLICY_FIXTURE,
        sourceProvenance: {
          ...ACI_POLICY_FIXTURE.sourceProvenance,
          repositories: [
            {
              ...ACI_POLICY_FIXTURE.sourceProvenance.repositories[0],
              commits: [
                ACI_POLICY_FIXTURE.sourceProvenance.repositories[0].commits[0],
                ACI_POLICY_FIXTURE.sourceProvenance.repositories[0].commits[0],
              ],
            },
          ],
        },
      },
      {
        ...ACI_POLICY_FIXTURE,
        permittedModels: [
          ACI_POLICY_FIXTURE.permittedModels[0],
          ACI_POLICY_FIXTURE.permittedModels[0],
        ],
      },
      {
        ...ACI_POLICY_FIXTURE,
        channelPolicy: {
          acceptedBindings: [
            {
              type: 'tls_spki_sha256',
              domains: ['inference.phala.com', 'inference.phala.com'],
            },
          ],
        },
      },
      {
        ...ACI_POLICY_FIXTURE,
        channelPolicy: {
          acceptedBindings: [
            {
              type: 'e2ee_public_key_sha256',
              domains: ['inference.phala.com'],
              algorithms: ['x25519-aes-256-gcm-hkdf-sha256', 'x25519-aes-256-gcm-hkdf-sha256'],
            },
          ],
        },
      },
      {
        ...ACI_POLICY_FIXTURE,
        channelPolicy: {
          acceptedBindings: [
            ACI_POLICY_FIXTURE.channelPolicy.acceptedBindings[0],
            ACI_POLICY_FIXTURE.channelPolicy.acceptedBindings[0],
          ],
        },
      },
    ];

    for (const duplicate of duplicateCases) {
      expect(inferenceTrustPolicyV2Schema.safeParse(duplicate).success).toBe(false);
    }
  });

  it('enforces representative array minima and maxima', () => {
    const digestsAtMaximum = policyDigests(32);
    const modelsAtMaximum = policyModels(32);
    const bindingsAtMaximum = policyBindings(32);
    const roleModel = modelsAtMaximum[0];

    expect(() =>
      inferenceTrustPolicyV2Schema.parse({
        ...ACI_POLICY_FIXTURE,
        evidence: { ...ACI_POLICY_FIXTURE.evidence, quoteRootDigests: digestsAtMaximum },
        permittedModels: modelsAtMaximum,
        roleModels: {
          embed: roleModel,
          generate: roleModel,
          critique: roleModel,
          judge: roleModel,
        },
        channelPolicy: { acceptedBindings: bindingsAtMaximum },
      }),
    ).not.toThrow();

    const rejectedCases: unknown[] = [
      { ...ACI_POLICY_FIXTURE, requiredSessionClaims: [] },
      { ...ACI_POLICY_FIXTURE, permittedClaimSources: [] },
      { ...ACI_POLICY_FIXTURE, permittedModels: [] },
      { ...ACI_POLICY_FIXTURE, channelPolicy: { acceptedBindings: [] } },
      {
        ...ACI_POLICY_FIXTURE,
        evidence: { ...ACI_POLICY_FIXTURE.evidence, quoteRootDigests: policyDigests(33) },
      },
      {
        ...ACI_POLICY_FIXTURE,
        permittedModels: policyModels(33),
        roleModels: {
          embed: policyModels(33)[0],
          generate: policyModels(33)[0],
          critique: policyModels(33)[0],
          judge: policyModels(33)[0],
        },
      },
      { ...ACI_POLICY_FIXTURE, channelPolicy: { acceptedBindings: policyBindings(33) } },
      {
        ...ACI_POLICY_FIXTURE,
        channelPolicy: {
          acceptedBindings: [{ type: 'tls_spki_sha256', domains: [] }],
        },
      },
      {
        ...ACI_POLICY_FIXTURE,
        channelPolicy: {
          acceptedBindings: [
            {
              type: 'tls_spki_sha256',
              domains: policyBindings(33).map(({ domains }) => domains[0]),
            },
          ],
        },
      },
    ];

    for (const rejected of rejectedCases) {
      expect(inferenceTrustPolicyV2Schema.safeParse(rejected).success).toBe(false);
    }
  });

  it('enforces representative string, domain, and lifetime boundaries', () => {
    const maximumDomain = ['a'.repeat(63), 'b'.repeat(63), 'c'.repeat(63), 'd'.repeat(61)].join(
      '.',
    );
    const maximumModel = `p/${'m'.repeat(254)}`;
    const maximumRoute = `/${'a'.repeat(2_047)}`;
    const boundaryModel = { model: maximumModel, revision: 'r' };
    const boundaryPolicy = {
      ...ACI_POLICY_FIXTURE,
      route: maximumRoute,
      channelPolicy: {
        acceptedBindings: [{ type: 'tls_spki_sha256', domains: [maximumDomain] }],
      },
      permittedModels: [boundaryModel],
      roleModels: {
        embed: boundaryModel,
        generate: boundaryModel,
        critique: boundaryModel,
        judge: boundaryModel,
      },
      maxKeysetLifetimeSeconds: 1,
      maxSessionLifetimeSeconds: 31_536_000,
      clockSkewSeconds: 0,
    };

    expect(() => inferenceTrustPolicyV2Schema.parse(boundaryPolicy)).not.toThrow();
    expect(() =>
      inferenceTrustPolicyV2Schema.parse({ ...boundaryPolicy, clockSkewSeconds: 3_600 }),
    ).not.toThrow();

    const rejectedCases: unknown[] = [
      { ...boundaryPolicy, route: `${maximumRoute}a` },
      {
        ...boundaryPolicy,
        permittedModels: [{ model: `${maximumModel}m`, revision: 'r' }],
        roleModels: {
          embed: { model: `${maximumModel}m`, revision: 'r' },
          generate: { model: `${maximumModel}m`, revision: 'r' },
          critique: { model: `${maximumModel}m`, revision: 'r' },
          judge: { model: `${maximumModel}m`, revision: 'r' },
        },
      },
      {
        ...boundaryPolicy,
        channelPolicy: {
          acceptedBindings: [{ type: 'tls_spki_sha256', domains: [`${maximumDomain}d`] }],
        },
      },
      { ...boundaryPolicy, maxKeysetLifetimeSeconds: 0 },
      { ...boundaryPolicy, maxSessionLifetimeSeconds: 31_536_001 },
      { ...boundaryPolicy, clockSkewSeconds: -1 },
      { ...boundaryPolicy, clockSkewSeconds: 3_601 },
    ];

    for (const rejected of rejectedCases) {
      expect(inferenceTrustPolicyV2Schema.safeParse(rejected).success).toBe(false);
    }
  });

  it('rejects V1 identity fields, unknown fields, and incomplete provenance', () => {
    expect(() =>
      inferenceTrustPolicyV2Schema.parse({ ...ACI_POLICY_FIXTURE, workloadId: 'workload-1' }),
    ).toThrow();
    expect(() =>
      inferenceTrustPolicyV2Schema.parse({
        ...ACI_POLICY_FIXTURE,
        workloadKeysetDigest: 'sha256:' + 'a'.repeat(64),
      }),
    ).toThrow();
    expect(() =>
      inferenceTrustPolicyV2Schema.parse({
        ...ACI_POLICY_FIXTURE,
        providerKeyUrl: 'https://example.com',
      }),
    ).toThrow();
    expect(() =>
      inferenceTrustPolicyV2Schema.parse({
        ...ACI_POLICY_FIXTURE,
        sourceProvenance: { repositories: [], imageDigests: [] },
      }),
    ).toThrow();
    expect(() =>
      inferenceTrustPolicyV2Schema.parse({
        ...ACI_POLICY_FIXTURE,
        origin: 'https://inference.phala.com/path',
      }),
    ).toThrow();
  });
});

describe('activeInferenceTrustPolicyV2Schema', () => {
  it('accepts the exact active tag, four roles, ownership, provenance, and artifact tuples', () => {
    const policy = activeInferenceTrustPolicyV2Schema.parse(activePolicyFixture());

    expect(ACTIVE_INFERENCE_TRUST_POLICY_V2_CANONICAL_DOMAIN).toBe(
      'folklore.inference-trust-policy-v2-active',
    );
    expect(policy.schema).toBe('active-inference-trust-policy-v2');
    expect(Object.keys(policy.roles).sort()).toEqual(['critique', 'embed', 'generate', 'judge']);
    expect(policy.roles.embed.modelArtifactDigest).toBe('2'.repeat(64));
    expect(policy.sourceProvenance.pcr0).toBe('d'.repeat(96));
  });

  it('rejects dormant or content-bearing fields and incomplete artifact bindings', () => {
    const policy = activePolicyFixture();
    const rejected: unknown[] = [
      { ...policy, inferenceAttestation: {} },
      {
        ...policy,
        permittedModels: policy.permittedModels.map((model, index) =>
          index === 1 ? { ...model, modelArtifactDigest: undefined } : model,
        ),
      },
      {
        ...policy,
        roles: {
          ...policy.roles,
          embed: {
            ...policy.roles.embed,
            modelArtifactDigest: 'f'.repeat(64),
          },
        },
      },
      { ...policy, prompt: 'sentinel' },
      { ...policy, schema: 'inference-trust-policy-v2' },
      {
        ...policy,
        channel: { ...policy.channel, exporterLabel: 'provider generated narrative' },
      },
    ];

    for (const candidate of rejected) {
      expect(activeInferenceTrustPolicyV2Schema.safeParse(candidate).success).toBe(false);
    }
  });

  it('rejects cross-namespace role bindings and unsorted active anchors', () => {
    const policy = activePolicyFixture();
    expect(
      activeInferenceTrustPolicyV2Schema.safeParse({
        ...policy,
        roles: {
          ...policy.roles,
          embed: { ...policy.roles.embed, deploymentId: 'other-deployment' },
        },
      }).success,
    ).toBe(false);
    expect(
      activeInferenceTrustPolicyV2Schema.safeParse({
        ...policy,
        channel: { ...policy.channel, tlsSpkiSha256: ['b'.repeat(64), 'a'.repeat(64)] },
      }).success,
    ).toBe(false);
  });
});

describe('aciWorkloadReportSchema', () => {
  it('accepts the pinned official ACI/1 report shape and policy-defined extensions', () => {
    const report = aciWorkloadReportSchema.parse({
      ...ACI_REPORT_FIXTURE,
      attestation: {
        ...ACI_REPORT_FIXTURE.attestation,
        evidence: { provider_extension: { status: 'redacted' } },
      },
      service_capabilities: {
        ...ACI_REPORT_FIXTURE.service_capabilities,
        provider_extension: 'ignored-by-generic-verifiers',
      },
    });

    expect(report.api_version).toBe('aci/1');
    expect(report.attestation.workload_keyset.not_after).toBe(1_800_000_000);
    expect(report.attestation.evidence.provider_extension).toEqual({ status: 'redacted' });
    expect(report.service_capabilities.provider_extension).toBe('ignored-by-generic-verifiers');
  });

  it('accepts the optional subject and TLS public-key list without a legacy identity block', () => {
    const keyset = ACI_REPORT_FIXTURE.attestation.workload_keyset;

    expect(
      aciWorkloadReportSchema.parse({
        ...ACI_REPORT_FIXTURE,
        attestation: {
          ...ACI_REPORT_FIXTURE.attestation,
          workload_keyset: {
            ...keyset,
            tls_public_keys: undefined,
          },
        },
      }).attestation.workload_keyset.subject,
    ).toBe('dstack-app://example-app');
  });

  it('rejects removed report, attestation, and keyset fields', () => {
    const keyset = ACI_REPORT_FIXTURE.attestation.workload_keyset;
    const attestation = ACI_REPORT_FIXTURE.attestation;
    const legacyCases: unknown[] = [
      { ...ACI_REPORT_FIXTURE, workload_id: 'sha256:' + 'a'.repeat(64) },
      {
        ...ACI_REPORT_FIXTURE,
        attestation: {
          ...attestation,
          vendor: 'legacy-provider',
        },
      },
      {
        ...ACI_REPORT_FIXTURE,
        attestation: {
          ...attestation,
          freshness: { fetched_at: 1, stale_after: 2 },
        },
      },
      {
        ...ACI_REPORT_FIXTURE,
        attestation: {
          ...attestation,
          keyset_endorsement: { algo: 'ed25519', value: 'a'.repeat(128) },
        },
      },
      {
        ...ACI_REPORT_FIXTURE,
        attestation: {
          ...attestation,
          workload_keyset: {
            ...keyset,
            workload_identity: { public_key: { algo: 'ed25519', public_key: 'a'.repeat(64) } },
          },
        },
      },
    ];

    for (const legacy of legacyCases) {
      expect(aciWorkloadReportSchema.safeParse(legacy).success).toBe(false);
    }
  });

  it('rejects malformed report data, invalid expiry, and unknown top-level fields', () => {
    expect(() => aciWorkloadReportSchema.parse({ ...ACI_REPORT_FIXTURE, version: 1 })).toThrow();
    expect(() =>
      aciWorkloadReportSchema.parse({
        ...ACI_REPORT_FIXTURE,
        attestation: { ...ACI_REPORT_FIXTURE.attestation, report_data: 'A'.repeat(64) },
      }),
    ).toThrow();
    expect(() =>
      aciWorkloadReportSchema.parse({
        ...ACI_REPORT_FIXTURE,
        unexpected: true,
      }),
    ).toThrow();
  });

  it('allows absent source provenance because it is policy-checked separately', () => {
    expect(
      aciWorkloadReportSchema.parse({
        ...ACI_REPORT_FIXTURE,
        attestation: { ...ACI_REPORT_FIXTURE.attestation, source_provenance: null },
      }).attestation.source_provenance,
    ).toBeNull();
  });

  it('enforces algorithm-specific E2EE public-key lengths', () => {
    const keyset = ACI_REPORT_FIXTURE.attestation.workload_keyset;
    const invalidX25519 = {
      ...ACI_REPORT_FIXTURE,
      attestation: {
        ...ACI_REPORT_FIXTURE.attestation,
        workload_keyset: {
          ...keyset,
          e2ee_public_keys: [{ ...keyset.e2ee_public_keys[0], public_key: 'ab'.repeat(31) }],
        },
      },
    };
    expect(() => aciWorkloadReportSchema.parse(invalidX25519)).toThrow();

    const invalidSecp256k1 = {
      ...ACI_REPORT_FIXTURE,
      attestation: {
        ...ACI_REPORT_FIXTURE.attestation,
        workload_keyset: {
          ...keyset,
          e2ee_public_keys: [
            {
              ...keyset.e2ee_public_keys[0],
              algo: 'secp256k1-aes-256-gcm-hkdf-sha256',
              public_key: 'ab'.repeat(33),
            },
          ],
        },
      },
    };
    expect(() => aciWorkloadReportSchema.parse(invalidSecp256k1)).toThrow();
  });
});

describe('aciSessionSchema', () => {
  it('accepts official null session endpoint', () => {
    expect(
      aciSessionSchema.parse({
        ...ACI_SESSION_FIXTURE,
        endpoint: null,
      }).endpoint,
    ).toBeNull();
  });

  it('accepts the official session claims extension and evidence reference', () => {
    const session = aciSessionSchema.parse({
      ...ACI_SESSION_FIXTURE,
      claims: { ...ACI_SESSION_FIXTURE.claims, extra: { tcb_status: 'redacted' } },
    });

    expect(session.api_version).toBe('aci/1');
    expect(session.claims.tee_attested.status).toBe('asserted');
    expect(session.claims.extra?.tcb_status).toBe('redacted');
    expect('session_id' in session).toBe(false);
  });

  it('accepts bounded verifier-specific session identity fields', () => {
    const session = aciSessionSchema.parse({
      ...ACI_SESSION_FIXTURE,
      identity: { provider_key: 'redacted', nested: { tier: 'hardware' } },
    });

    expect(session.identity?.provider_key).toBe('redacted');
  });

  it('fails safely instead of recursing on deeply nested identity fields', () => {
    let identity: Record<string, unknown> = { value: 'leaf' };
    for (let index = 0; index < 12_000; index += 1) {
      identity = { nested: identity };
    }

    const parsed = aciSessionSchema.safeParse({ ...ACI_SESSION_FIXTURE, identity });

    expect(parsed.success).toBe(false);
  });

  it('requires claim source and reason only for known claim outcomes', () => {
    expect(() =>
      aciSessionSchema.parse({
        ...ACI_SESSION_FIXTURE,
        claims: {
          ...ACI_SESSION_FIXTURE.claims,
          tee_attested: { status: 'asserted' },
        },
      }),
    ).toThrow();
    expect(() =>
      aciSessionSchema.parse({
        ...ACI_SESSION_FIXTURE,
        claims: {
          ...ACI_SESSION_FIXTURE.claims,
          tee_attested: {
            status: 'unknown',
            source: 'hardware_proven',
            reason: 'must be omitted for unknown',
          },
        },
      }),
    ).toThrow();
    const parsed = aciSessionSchema.parse({
      ...ACI_SESSION_FIXTURE,
      claims: { ...ACI_SESSION_FIXTURE.claims, unknown_claim: { status: 'unknown' } },
    });
    expect(parsed.claims.unknown_claim).toEqual({ status: 'unknown' });
  });

  it('requires valid expiry and channel bindings while accepting bounded evidence extensions', () => {
    expect(() =>
      aciSessionSchema.parse({
        ...ACI_SESSION_FIXTURE,
        expires_at: ACI_SESSION_FIXTURE.established_at,
      }),
    ).toThrow();
    expect(() =>
      aciSessionSchema.parse({
        ...ACI_SESSION_FIXTURE,
        channel_binding: [
          {
            type: 'tls_spki_sha256',
            origin: 'http://upstream.example.com',
            spki_sha256: 'd1'.repeat(32),
          },
        ],
      }),
    ).toThrow();
    expect(
      aciSessionSchema.parse({
        ...ACI_SESSION_FIXTURE,
        evidence: { digest: ACI_SESSION_FIXTURE.evidence.digest },
      }).evidence,
    ).toEqual({ digest: ACI_SESSION_FIXTURE.evidence.digest });
    expect(
      aciSessionSchema.parse({
        ...ACI_SESSION_FIXTURE,
        evidence: { ...ACI_SESSION_FIXTURE.evidence, unexpected: true },
      }).evidence.unexpected,
    ).toBe(true);
    expect(() => aciSessionSchema.parse({ ...ACI_SESSION_FIXTURE, unexpected: true })).toThrow();
  });
});

describe('aciReceiptSchema', () => {
  it('accepts official receipt events and unknown extension events', () => {
    const receipt = aciReceiptSchema.parse({
      ...ACI_RECEIPT_FIXTURE,
      event_log: [
        { ...ACI_RECEIPT_FIXTURE.event_log[0], verifier_extension: 'preserved' },
        ...ACI_RECEIPT_FIXTURE.event_log.slice(1),
        { type: 'router.decision', decision: 'redacted' },
      ],
    });

    expect(receipt.event_log[0]?.verifier_extension).toBe('preserved');
    expect(receipt.event_log[2]?.type).toBe('upstream.verified');
    expect(receipt.event_log[4]?.decision).toBe('redacted');
  });

  it('accepts a required verification refusal without request.forwarded', () => {
    const receipt = aciReceiptSchema.parse({
      ...ACI_RECEIPT_FIXTURE,
      event_log: [
        ACI_RECEIPT_FIXTURE.event_log[0],
        {
          type: 'upstream.verified',
          model_id: 'demo-model',
          result: 'failed',
          required: true,
          reason: 'upstream_verification_failed',
        },
        ACI_RECEIPT_FIXTURE.event_log[3],
      ],
    });

    expect(receipt.event_log).toHaveLength(3);
  });

  it('rejects response reordering, sequence fields, legacy session IDs, and nested signatures', () => {
    const responseBeforeUpstream = [
      ACI_RECEIPT_FIXTURE.event_log[0],
      ACI_RECEIPT_FIXTURE.event_log[3],
      ACI_RECEIPT_FIXTURE.event_log[2],
    ];

    expect(() =>
      aciReceiptSchema.parse({
        ...ACI_RECEIPT_FIXTURE,
        event_log: responseBeforeUpstream,
      }),
    ).toThrow();
    expect(() =>
      aciReceiptSchema.parse({
        ...ACI_RECEIPT_FIXTURE,
        event_log: [
          { ...ACI_RECEIPT_FIXTURE.event_log[0], seq: 0 },
          ...ACI_RECEIPT_FIXTURE.event_log.slice(1),
        ],
      }),
    ).toThrow();
    expect(() =>
      aciReceiptSchema.parse({
        ...ACI_RECEIPT_FIXTURE,
        event_log: ACI_RECEIPT_FIXTURE.event_log.map((event) =>
          event.type === 'upstream.verified'
            ? { ...event, session_id: `as_${'a'.repeat(64)}` }
            : event,
        ),
      }),
    ).toThrow();
    expect(() =>
      aciReceiptSchema.parse({
        ...ACI_RECEIPT_FIXTURE,
        signature: { value: ACI_RECEIPT_FIXTURE.signature },
      }),
    ).toThrow();
    expect(() =>
      aciReceiptSchema.parse({
        ...ACI_RECEIPT_FIXTURE,
        event_log: ACI_RECEIPT_FIXTURE.event_log.map((event) =>
          event.type === 'response.returned'
            ? { ...event, cleartext_hash: event.body_hash }
            : event,
        ),
      }),
    ).toThrow();
    expect(() =>
      aciReceiptSchema.parse({
        ...ACI_RECEIPT_FIXTURE,
        workload_id: 'sha256:' + 'a'.repeat(64),
      }),
    ).toThrow();
  });

  it('requires forwarding for a successful upstream verification', () => {
    expect(() =>
      aciReceiptSchema.parse({
        ...ACI_RECEIPT_FIXTURE,
        event_log: ACI_RECEIPT_FIXTURE.event_log.filter(
          (event) => event.type !== 'request.forwarded',
        ),
      }),
    ).toThrow();
  });

  it('rejects top-level V1 fields while allowing explicitly permitted event extensions', () => {
    expect(() => aciReceiptSchema.parse({ ...ACI_RECEIPT_FIXTURE, version: 1 })).toThrow();
    expect(() =>
      aciReceiptSchema.parse({ ...ACI_RECEIPT_FIXTURE, model_revision: 'revision-1' }),
    ).toThrow();
    expect(
      aciReceiptSchema.parse({
        ...ACI_RECEIPT_FIXTURE,
        event_log: ACI_RECEIPT_FIXTURE.event_log.map((event) =>
          event.type === 'request.received' ? { ...event, verifier_extension: 'preserved' } : event,
        ),
      }).event_log[0]?.verifier_extension,
    ).toBe('preserved');
    expect(() =>
      aciReceiptSchema.parse({ ...ACI_RECEIPT_FIXTURE, response: 'customer content' }),
    ).toThrow();
  });
});

describe('official ACI parsers reject V1 objects', () => {
  it('rejects complete legacy objects that their corresponding V1 schemas accept', () => {
    const legacyPolicy = inferenceTrustPolicyV1Schema.parse(policyV1Fixture());
    const legacyReceipt = inferenceReceiptV1Schema.parse(receiptFixture());

    expect(inferenceTrustPolicyV2Schema.safeParse(legacyPolicy).success).toBe(false);
    expect(aciReceiptSchema.safeParse(legacyReceipt).success).toBe(false);
  });
});
