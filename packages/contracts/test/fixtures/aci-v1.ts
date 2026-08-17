// SPDX-License-Identifier: Apache-2.0
const PINNED_COMMIT = '30296dd9a0dbaf06e520f2ed1be01eab75c3c287';

export const ACI_OFFICIAL_FIXTURE_PROVENANCE = {
  repository: 'Dstack-TEE/private-ai-gateway',
  commit: PINNED_COMMIT,
  path: 'clients/verifier-ts/test/fixtures.ts',
  sha256: 'fb75ac5bc7ffa9e02a144a472ddb86a9cde61d5821cded6ea25f74010c15b01f',
} as const;

const KEYSET_DIGEST = 'sha256:53a5cd44b30dcc51999754c719f2628a041f174ecbf9662a6f8e898a10cd9371';
const REPORT_DATA = 'df2174d28130852b413646a3786927b93e94c11d770268b65def8bdba45cb49e';
const OFFICIAL_REPO_COMMIT = 'f9706ad89220b5d033e38a6a9f1d94121bf37488';
const RECEIPT_SIGNATURE =
  '69ff178b1ac3cd41a7250bba818c243ce0793a7a040162252a0ec27a41a74ccdcd6ffecd8252adce23198416aa2377c9b2278b146353e2722e3668882a7b290f';
const SESSION_ID = '8d8d6d831647fdf9c7642587f684cc4193610635529d00c8a86ab6909936ba1f';
const EVIDENCE_DIGEST = 'sha256:80d70e44d0ae1e829fd5f37c3ee4a60dfbea8d3aa18407ea3f34cf7ec91da34d';

const KEYSET = {
  subject: 'dstack-app://example-app',
  not_after: 1_800_000_000,
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
      public_key: '5dfedd3b6bd47f6fa28ee15d969d5bb0ea53774d488bdaf9df1c6e0124b3ef22',
    },
  ],
  tls_public_keys: [{ spki_sha256: 'c0'.repeat(32), domain: 'api.example.com' }],
};

const CLAIMS = {
  gpu_attested: { status: 'unknown' },
  tee_attested: {
    reason: 'example quote verified',
    source: 'hardware_proven',
    status: 'asserted',
  },
  extra: { tcb_status: 'UpToDate' },
};

const CHANNEL_BINDING = [
  {
    origin: 'https://upstream.example.com',
    spki_sha256: 'd1'.repeat(32),
    type: 'tls_spki_sha256',
  },
];

// Derived values mirror clients/verifier-ts/test/fixtures.ts at the pinned commit.
export const ACI_REPORT_FIXTURE = {
  api_version: 'aci/1',
  workload_keyset_digest: KEYSET_DIGEST,
  attestation: {
    tee_type: 'tdx',
    workload_keyset: KEYSET,
    report_data: REPORT_DATA,
    source_provenance: {
      repo_url: 'https://github.com/Dstack-TEE/private-ai-gateway',
      repo_commit: OFFICIAL_REPO_COMMIT,
      image_digest: null,
      image_provenance: null,
    },
    evidence: { quote_b64: 'AA==' },
  },
  service_capabilities: {
    supported_e2ee_versions: ['2'],
  },
} as const;

// Derived values mirror clients/verifier-ts/test/fixtures.ts at the pinned commit.
export const ACI_SESSION_FIXTURE = {
  api_version: 'aci/1',
  upstream_name: 'demo-upstream',
  endpoint: 'https://upstream.example.com',
  verifier_id: 'example/1',
  established_at: 1_750_000_000,
  expires_at: 1_750_003_600,
  identity: { signing_address: '0x1234' },
  channel_binding: CHANNEL_BINDING,
  claims: CLAIMS,
  evidence: {
    digest: EVIDENCE_DIGEST,
    data: 'data:application/octet-stream;base64,ZXhhbXBsZS1ldmlkZW5jZQ==',
  },
} as const;

export const ACI_SESSION_ID = SESSION_ID;

// Derived values mirror clients/verifier-ts/test/fixtures.ts at the pinned commit.
export const ACI_RECEIPT_FIXTURE = {
  api_version: 'aci/1',
  receipt_id: 'rcpt-0001',
  chat_id: 'chatcmpl-123',
  model: 'demo-model',
  workload_keyset_digest: KEYSET_DIGEST,
  endpoint: '/v1/chat/completions',
  method: 'POST',
  served_at: 1_750_000_000,
  event_log: [
    {
      type: 'request.received',
      body_hash: 'sha256:94d809bf47380d8a2eab0eb6e126d4dda9364b0b4725cdf7ead52dd70b2aa87b',
    },
    {
      type: 'request.forwarded',
      body_hash: 'sha256:94d809bf47380d8a2eab0eb6e126d4dda9364b0b4725cdf7ead52dd70b2aa87b',
    },
    {
      type: 'upstream.verified',
      model_id: 'demo-model',
      result: 'verified',
      required: true,
      session_id: SESSION_ID,
    },
    {
      type: 'response.returned',
      body_hash: 'sha256:dedfffe5b14d031b8e2c01996d021a15293cb7c63b56be7e4be9e89b6f0a5f61',
    },
  ],
  key_id: 'receipt-1',
  signature: RECEIPT_SIGNATURE,
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
        repoUrl: 'https://github.com/Dstack-TEE/private-ai-gateway',
        commits: [OFFICIAL_REPO_COMMIT],
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
