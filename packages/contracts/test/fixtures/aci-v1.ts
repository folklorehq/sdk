// SPDX-License-Identifier: Apache-2.0
const PINNED_COMMIT = 'ed312b94c97d1efd1d4db6a8a166196dbd46c861';

// Official source provenance, verified at PINNED_COMMIT:
// spec/aci.md sha256:206176c517b59a5714e280100356d0de6c272182fd2766df081d066215705b24
// spec/test-vectors.md sha256:deab05b8f256ed259c2c5388cb730862b580f0c357d08d23174625f201134755
// clients/verifier-ts/test/fixtures.ts sha256:38a72fc1c8ba54bd1a5b6b273e4a7833b85fea7483c59a875dd16202d6e18522
// clients/verifier-ts/src/receipt.ts sha256:f8ccaaafeb2661b45d662160740d5094962f43668ab85266553730118ea9ab32
// src/aci/receipt.rs sha256:a89bab994d970224f602c8de7f9b678a7d65322467854d08a8241bee7a07196f
// src/aggregator/session.rs sha256:e2f5d60f3d9942a1eb2d86bd1999ebf4d8d9f14f04126665f0d05ab545d4b85e

const WORKLOAD_ID = 'sha256:57c2c8fa98bcf11441f1eff9ef087db67a5560a026082e96903e15365677b8c0';
const KEYSET_DIGEST = 'sha256:f2fba7e1b1451e0c0231df624f293407692ef939d3e0e55bca723131bea3f1ff';
const REPORT_DATA = '0b8cc28d7e989a88b1e969af20aa2b224afdc2c99f24c97c31a4af330c964ecf';
const RECEIPT_SIGNATURE =
  '0861f62296f57a120620e79fc0e91008a187e3793b65be4a0ed355d4617f305e00a19b32463e1feb464f7220bcd37debd892facddc068eebf5ef02202c31910f';
const SESSION_ID = 'as_2e9011abafe00fc2902aaa5dedf8373f14e2c4f1a456b854ddb475413547188e';
const EVIDENCE_DIGEST = 'sha256:80d70e44d0ae1e829fd5f37c3ee4a60dfbea8d3aa18407ea3f34cf7ec91da34d';

const KEYSET = {
  workload_identity: {
    public_key: {
      algo: 'ed25519',
      public_key: '8a88e3dd7409f195fd52db2d3cba5d72ca6709bf1d94121bf3748801b40f6f5c',
    },
    subject: null,
  },
  keyset_epoch: { version: 1, not_after: 1_800_000_000 },
  receipt_signing_keys: [
    {
      key_id: 'receipt-1',
      algo: 'ed25519',
      public_key: '8139770ea87d175f56a35466c34c7ecccb8d8a91b4ee37a25df60f5b8fc9b394',
    },
  ],
  e2ee_public_keys: [
    {
      key_id: 'e2ee-1',
      algo: 'x25519-aes-256-gcm-hkdf-sha256',
      public_key: 'ab'.repeat(32),
    },
  ],
  tls_public_keys: [{ spki_sha256: 'c0'.repeat(32), domain: 'api.example.com' }],
};

const CLAIMS = {
  gpu_attested: { status: 'unknown' },
  model_weights_provenance: { status: 'unknown' },
  os_known_good: { status: 'unknown' },
  serving_software_known_good: { status: 'unknown' },
  tcb_up_to_date: { status: 'unknown' },
  tee_attested: {
    reason: 'example quote verified',
    source: 'hardware_proven',
    status: 'asserted',
  },
};

const CHANNEL_BINDING = [
  {
    origin: 'https://upstream.example.com',
    spki_sha256: 'd1'.repeat(32),
    type: 'tls_spki_sha256',
  },
];

// Redacted report shape from spec/aci.md at the pinned commit above. The evidence object is empty
// because the native quote and custody material are not needed by a contract test and must not be
// copied into this repository.
export const ACI_REPORT_FIXTURE = {
  api_version: 'aci/1',
  workload_id: WORKLOAD_ID,
  workload_keyset_digest: KEYSET_DIGEST,
  attestation: {
    vendor: 'example-provider',
    tee_type: 'tdx',
    workload_keyset: KEYSET,
    report_data: REPORT_DATA,
    keyset_endorsement: {
      algo: 'ed25519',
      value:
        '64e0a4f5d7af28dfdacc102d14c13470b4ddbd90708e190fc0e787f07b36f20eda0ef1f42ea96b8a7f290eb64a918574dc914ce06b6ea023d2153275f06fd201',
    },
    source_provenance: {
      repo_url:
        'https://github.com/Phala-Network/private-ai-gateway-with-vllm-router-as-middleware',
      repo_commit: PINNED_COMMIT,
      image_digest: null,
      image_provenance: null,
    },
    freshness: { fetched_at: 1_750_000_000, stale_after: 1_750_003_600 },
    evidence: {},
  },
  service_capabilities: {
    supported_e2ee_versions: ['2'],
  },
} as const;

// Redacted session shape from spec/aci.md §9.2 and the pinned
// clients/verifier-ts/test/fixtures.ts, src/aggregator/session.rs sources.
export const ACI_SESSION_FIXTURE = {
  api_version: 'aci/1',
  session_id: SESSION_ID,
  upstream_name: 'demo-upstream',
  endpoint: 'https://upstream.example.com',
  verifier_id: 'example/1',
  established_at: 1_750_000_000,
  expires_at: 1_750_003_600,
  channel_binding: CHANNEL_BINDING,
  claims: CLAIMS,
  evidence: {
    digest: EVIDENCE_DIGEST,
    data: 'data:text/plain;base64,ZXhhbXBsZS1ldmlkZW5jZQ==',
  },
} as const;

// Redacted receipt shape from the pinned clients/verifier-ts/test/fixtures.ts,
// clients/verifier-ts/src/receipt.ts, and src/aci/receipt.rs sources. It carries hashes only, not
// the request or response bodies.
export const ACI_RECEIPT_FIXTURE = {
  api_version: 'aci/1',
  receipt_id: 'rcpt-0001',
  chat_id: 'chatcmpl-123',
  model: 'demo-model',
  workload_id: WORKLOAD_ID,
  workload_keyset_digest: KEYSET_DIGEST,
  endpoint: '/v1/chat/completions',
  method: 'POST',
  served_at: 1_750_000_000,
  event_log: [
    {
      seq: 0,
      type: 'request.received',
      body_hash: 'sha256:94d809bf47380d8a2eab0eb6e126d4dda9364b0b4725cdf7ead52dd70b2aa87b',
    },
    {
      seq: 1,
      type: 'request.forwarded',
      body_hash: 'sha256:94d809bf47380d8a2eab0eb6e126d4dda9364b0b4725cdf7ead52dd70b2aa87b',
    },
    {
      seq: 2,
      type: 'upstream.verified',
      upstream_name: 'demo-upstream',
      provider_type: null,
      model_id: 'demo-model',
      url_origin: 'https://upstream.example.com',
      verifier_id: 'example/1',
      result: 'verified',
      required: true,
      reason: null,
      channel_bindings: CHANNEL_BINDING,
      provider_claims: null,
      session_id: SESSION_ID,
      claims: CLAIMS,
    },
    {
      seq: 3,
      type: 'response.returned',
      cleartext_hash: 'sha256:dedfffe5b14d031b8e2c01996d021a15293cb7c63b56be7e4be9e89b6f0a5f61',
      wire_hash: 'sha256:dedfffe5b14d031b8e2c01996d021a15293cb7c63b56be7e4be9e89b6f0a5f61',
    },
  ],
  signature: {
    algo: 'ed25519',
    key_id: 'receipt-1',
    value: RECEIPT_SIGNATURE,
  },
} as const;

// Redacted Folklore policy shape for the additive V2 contract. Its anchors are review inputs, not
// provider observations; no workload id or ephemeral keyset digest is present.
export const ACI_POLICY_FIXTURE = {
  version: 2,
  generation: 3,
  origin: 'https://inference.phala.com',
  route: '/v1/chat/completions',
  channelPolicy: {
    acceptedBindings: [
      {
        type: 'e2ee_public_key_sha256',
        domains: ['inference.phala.com'],
        algorithms: ['x25519-aes-256-gcm-hkdf-sha256'],
      },
      {
        type: 'tls_spki_sha256',
        domains: ['inference.phala.com'],
      },
    ],
  },
  evidence: {
    teeTypes: ['tdx'],
    quoteRootDigests: ['a'.repeat(64)],
    tcbStatuses: ['up_to_date'],
    runtimeMeasurements: ['b'.repeat(96)],
    runtimeRtmrs: ['b'.repeat(96)],
    runtimeIdentities: ['runtime:inference'],
    dstackAppIdentities: ['app:inference'],
    measuredComposeDigests: ['sha256:' + 'c'.repeat(64)],
    imageDigests: [],
    dstackKmsRoots: ['d'.repeat(64)],
  },
  sourceProvenance: {
    repositories: [
      {
        repoUrl:
          'https://github.com/Phala-Network/private-ai-gateway-with-vllm-router-as-middleware',
        commits: [PINNED_COMMIT],
      },
    ],
    imageDigests: [],
  },
  requiredSessionClaims: ['tcb_up_to_date', 'tee_attested'],
  permittedClaimSources: ['hardware_proven', 'verifier_derived'],
  permittedModels: [{ model: 'z-ai/glm-5.2', revision: '2026-08-09' }],
  roleModels: {
    embed: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
    generate: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
    critique: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
    judge: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
  },
  maxKeysetLifetimeSeconds: 86_400,
  maxSessionLifetimeSeconds: 3_600,
  clockSkewSeconds: 60,
} as const;
