// SPDX-License-Identifier: Apache-2.0
import { createHash, createPrivateKey, createPublicKey, sign } from 'node:crypto';

import type {
  AciReceipt,
  AciSession,
  AciWorkloadReport,
  InferenceModelRole,
  InferenceTrustPolicyV2,
} from '@folklore/contracts';
import { canonicalJson } from '@folklore/utils';
import { describe, expect, it, vi } from 'vitest';

import { ACI_POLICY_FIXTURE } from '../../contracts/test/fixtures/aci-v1.js';
import { AciReceiptVerifier } from '../src/aci/AciReceiptVerifier.js';
import {
  InMemoryAciKeysetHighWaterAuthority,
  InMemoryAciReceiptReplayStore,
} from './doubles/aci/InMemoryAciStores.js';
import { AciReportBindingVerifier } from '../src/aci/AciReportBindingVerifier.js';
import { AciSessionVerifier } from '../src/aci/AciSessionVerifier.js';
import type {
  AciReceiptVerificationInput,
  AciSessionCandidate,
  AciSessionEvidenceVerifierPort,
  AciTrustContext,
  VerifiedAciChannelPin,
  VerifiedAciKeyset,
  VerifiedAciSessionSet,
  VerifiedAciTrustSnapshot,
} from '../src/ports.js';

const NOW = 1_750_000_100;
const TRUST_CONTEXT: AciTrustContext = {
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  bootEpoch: 'boot-1',
  checkpointDigest: 'a'.repeat(64),
};
const NONCE = Uint8Array.from(Array.from({ length: 32 }, (_, index) => index + 1));
const NONCE_HEX = Buffer.from(NONCE).toString('hex');
const KEYSET = {
  subject: 'dstack-app://example-app',
  not_after: NOW + 3_600,
  receipt_signing_keys: [
    {
      algo: 'ed25519',
      key_id: 'receipt-1',
      public_key: '3'.repeat(64),
    },
  ],
  e2ee_public_keys: [
    {
      algo: 'x25519-aes-256-gcm-hkdf-sha256',
      key_id: 'e2ee-1',
      public_key: '4'.repeat(64),
    },
  ],
  tls_public_keys: [{ domain: 'inference.phala.com', spki_sha256: '5'.repeat(64) }],
};
const KEYSET_DIGEST = prefixedDigest(canonicalJson(KEYSET));
const REPORT_DATA = createHash('sha256')
  .update(
    `{"keyset_digest":"${KEYSET_DIGEST}","nonce":"${NONCE_HEX}","purpose":"aci.report_data.v1"}`,
  )
  .digest('hex');
const CHANNEL_BINDING = [
  {
    origin: 'https://inference.phala.com',
    spki_sha256: '6'.repeat(64),
    type: 'tls_spki_sha256' as const,
  },
];
const CLAIMS = {
  gpu_attested: { status: 'unknown' as const },
  model_weights_provenance: { status: 'unknown' as const },
  os_known_good: { status: 'unknown' as const },
  serving_software_known_good: { status: 'unknown' as const },
  tcb_up_to_date: {
    reason: 'trusted TCB',
    source: 'hardware_proven' as const,
    status: 'asserted' as const,
  },
  tee_attested: {
    reason: 'trusted quote',
    source: 'hardware_proven' as const,
    status: 'asserted' as const,
  },
};
const SESSION_DOCUMENT = {
  api_version: 'aci/1' as const,
  upstream_name: 'demo-upstream',
  endpoint: 'https://inference.phala.com',
  verifier_id: 'example/1',
  established_at: NOW - 100,
  expires_at: NOW + 1_000,
  channel_binding: CHANNEL_BINDING,
  claims: CLAIMS,
  evidence: {
    digest: 'sha256:50d858e0985ecc7f60418aaf0cc5ab587f42c2570a884095a9e8ccacd0f6545c',
    data: 'data:application/octet-stream;base64,ZXhhbXBsZQ==',
  },
};
const SESSION_ID = sha256Jcs(SESSION_DOCUMENT);
const CHANNEL_KEY_DIGEST = prefixedDigest(canonicalJson({ channel_binding: CHANNEL_BINDING }));
const UPSTREAM_IDENTITY_DIGEST = prefixedDigest(
  canonicalJson({
    channel_bindings: CHANNEL_BINDING,
    claims: CLAIMS,
    upstream_name: SESSION_DOCUMENT.upstream_name,
    url_origin: SESSION_DOCUMENT.endpoint,
    verifier_id: SESSION_DOCUMENT.verifier_id,
  }),
);
const POLICY: InferenceTrustPolicyV2 = {
  ...ACI_POLICY_FIXTURE,
  permittedModels: [{ model: 'demo/demo-model', revision: 'revision-1' }],
  roleModels: {
    embed: { model: 'demo/demo-model', revision: 'revision-1' },
    generate: { model: 'demo/demo-model', revision: 'revision-1' },
    critique: { model: 'demo/demo-model', revision: 'revision-1' },
    judge: { model: 'demo/demo-model', revision: 'revision-1' },
  },
};
const RAW_SESSION_ID = '8'.repeat(64);
const SESSION_PINS: readonly VerifiedAciChannelPin[] = [
  { type: 'tls_spki_sha256', value: '6'.repeat(64), domain: 'inference.phala.com' },
];
const SIGNING_KEY = createPrivateKey({
  key: Buffer.from(`302e020100300506032b657004220420${'02'.repeat(32)}`, 'hex'),
  format: 'der',
  type: 'pkcs8',
});
const SIGNING_PUBLIC_KEY = createPublicKey(SIGNING_KEY)
  .export({ format: 'der', type: 'spki' })
  .subarray(12)
  .toString('hex');

function prefixedDigest(value: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function sha256Jcs(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function officialReport(): AciWorkloadReport {
  return {
    api_version: 'aci/1',
    workload_keyset_digest: KEYSET_DIGEST,
    attestation: {
      tee_type: 'tdx',
      workload_keyset: KEYSET,
      report_data: REPORT_DATA,
      source_provenance: null,
      evidence: {},
    },
  } as unknown as AciWorkloadReport;
}

function sessionEvidenceVerifier(): AciSessionEvidenceVerifierPort {
  return {
    verify: vi.fn(async ({ sessionBytes }) => {
      const session = JSON.parse(new TextDecoder().decode(sessionBytes)) as typeof SESSION_DOCUMENT;
      return {
        sessionId: sha256Jcs(session),
        claims: session.claims,
        identity: session.identity ?? null,
        channelBindings: session.channel_binding,
        establishedAt: session.established_at,
        expiresAt: session.expires_at,
        channelKeyDigest: prefixedDigest(
          canonicalJson({ channel_binding: session.channel_binding }),
        ),
        upstreamIdentityDigest: prefixedDigest(
          canonicalJson({
            channel_bindings: session.channel_binding,
            claims: session.claims,
            upstream_name: session.upstream_name,
            url_origin: session.endpoint ?? null,
            verifier_id: session.verifier_id,
          }),
        ),
      };
    }),
  };
}

function sessionKeyset(): VerifiedAciKeyset {
  return {
    workloadId: KEYSET_DIGEST,
    workloadKeysetDigest: KEYSET_DIGEST,
    version: POLICY.generation,
    notAfter: KEYSET.not_after,
    receiptSigningKeys: [
      { keyId: 'receipt-1', algorithm: 'ed25519', publicKey: SIGNING_PUBLIC_KEY },
    ],
    e2eePublicKeys: [
      {
        keyId: 'e2ee-1',
        algorithm: 'x25519-aes-256-gcm-hkdf-sha256',
        publicKey: KEYSET.e2ee_public_keys[0].public_key,
      },
    ],
    tlsPublicKeys: [{ spkiSha256: '5'.repeat(64), domain: 'inference.phala.com' }],
    channelPins: SESSION_PINS,
    channelKeyDigest: CHANNEL_KEY_DIGEST,
  };
}

function sessionCandidate(role: InferenceModelRole, sessionId = SESSION_ID): AciSessionCandidate {
  const roleModel = POLICY.roleModels[role];
  return {
    role,
    model: roleModel.model,
    modelRevision: roleModel.revision,
    workloadKeysetDigest: KEYSET_DIGEST,
    channelKeyDigest: CHANNEL_KEY_DIGEST,
    policyGeneration: POLICY.generation,
    activationGeneration: 1,
    session: SESSION_DOCUMENT as unknown as AciSession,
    sessionBytes: new TextEncoder().encode(JSON.stringify(SESSION_DOCUMENT)),
    sessionId,
  } as unknown as AciSessionCandidate;
}

function sessionInput(
  candidates = (['embed', 'generate', 'critique', 'judge'] as const).map((role) =>
    sessionCandidate(role),
  ),
) {
  return {
    keyset: sessionKeyset(),
    candidates,
    highWater: {
      minimumPolicyGeneration: POLICY.generation,
      minimumActivationGeneration: 1,
      minimumKeysetVersion: POLICY.generation,
      supersededKeysetDigests: [],
    },
  };
}

function sessionAuthority(): InMemoryAciKeysetHighWaterAuthority {
  return new InMemoryAciKeysetHighWaterAuthority({
    generation: 1,
    policyGeneration: POLICY.generation,
    activationGeneration: 1,
    keysetVersion: POLICY.generation,
    currentKeysetDigest: KEYSET_DIGEST,
    supersededKeysetDigests: [],
    trustContext: TRUST_CONTEXT,
  });
}

function officialReceipt(): AciReceipt {
  const requestBytes = new TextEncoder().encode('{"model":"demo/demo-model"}');
  const responseBytes = new TextEncoder().encode('{"choices":[]}');
  const requestHash = prefixedDigest(requestBytes);
  const responseHash = prefixedDigest(responseBytes);
  const unsigned = {
    api_version: 'aci/1',
    receipt_id: 'rcpt-0001',
    chat_id: 'chatcmpl-123',
    model: 'demo/demo-model',
    workload_keyset_digest: KEYSET_DIGEST,
    endpoint: '/v1/chat/completions',
    method: 'POST',
    served_at: NOW,
    event_log: [
      { type: 'request.received', body_hash: requestHash },
      { type: 'request.forwarded', body_hash: requestHash },
      {
        type: 'upstream.verified',
        result: 'verified',
        required: true,
        model_id: 'demo/demo-model',
        session_id: RAW_SESSION_ID,
      },
      { type: 'response.returned', body_hash: responseHash },
    ],
    key_id: 'receipt-1',
  };
  return {
    ...unsigned,
    signature: sign(null, Buffer.from(canonicalJson(unsigned)), SIGNING_KEY).toString('hex'),
  } as unknown as AciReceipt;
}

function receiptSnapshot(): VerifiedAciTrustSnapshot {
  const session = {
    role: 'generate' as const,
    model: 'demo/demo-model',
    modelRevision: 'revision-1',
    sessionId: RAW_SESSION_ID,
    establishedAt: NOW - 100,
    expiresAt: NOW + 1_000,
    workloadKeysetDigest: KEYSET_DIGEST,
    channelKeyDigest: CHANNEL_KEY_DIGEST,
    channelPins: SESSION_PINS,
    upstreamIdentityDigest: UPSTREAM_IDENTITY_DIGEST,
    upstreamIdentity: {
      upstreamName: 'demo-upstream',
      urlOrigin: 'https://upstream.example.com',
      verifierId: 'example/1',
      claims: CLAIMS,
    },
  };
  const sessions = {
    embed: { ...session, role: 'embed' as const },
    generate: session,
    critique: { ...session, role: 'critique' as const },
    judge: { ...session, role: 'judge' as const },
  } satisfies VerifiedAciSessionSet;
  return {
    generation: 1,
    policyGeneration: POLICY.generation,
    activationGeneration: 1,
    expiresAt: NOW + 1_000,
    keyset: sessionKeyset(),
    channelPins: SESSION_PINS,
    sessions,
    supersededKeysetDigests: [],
  };
}

describe('official ACI V2 verifier bindings', () => {
  it('recomputes the keyset digest and binds report_data to the exact official statement', () => {
    const result = new AciReportBindingVerifier().verify(
      officialReport(),
      new TextEncoder().encode('{}'),
      NONCE,
    );

    expect(result.workloadKeysetDigest).toBe(KEYSET_DIGEST);
    expect(result.workloadId).toBe(KEYSET_DIGEST);
    expect(result.reportDataStatementDigest).toBe(REPORT_DATA);
  });

  it('uses a bare candidate-envelope sessionId for the full JCS session document', async () => {
    const verifier = new AciSessionVerifier({
      policy: POLICY,
      trustedTimeAuthority: { read: async () => ({ trustedNow: NOW, ...TRUST_CONTEXT }) },
      trustedTimeContext: TRUST_CONTEXT,
      evidenceVerifier: sessionEvidenceVerifier(),
      keysetHighWaterAuthority: sessionAuthority(),
    });

    const selected = await verifier.verifyAndSelect(sessionInput());

    expect(selected.generate.sessionId).toBe(SESSION_ID);
    expect(SESSION_ID).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a candidate whose envelope sessionId does not equal the document hash', async () => {
    const verifier = new AciSessionVerifier({
      policy: POLICY,
      trustedTimeAuthority: { read: async () => ({ trustedNow: NOW, ...TRUST_CONTEXT }) },
      trustedTimeContext: TRUST_CONTEXT,
      evidenceVerifier: sessionEvidenceVerifier(),
      keysetHighWaterAuthority: sessionAuthority(),
    });

    await expect(
      verifier.verifyAndSelect(
        sessionInput(
          (['embed', 'generate', 'critique', 'judge'] as const).map((role) =>
            sessionCandidate(role, 'f'.repeat(64)),
          ),
        ),
      ),
    ).rejects.toMatchObject({ code: 'session_id_mismatch' });
  });

  it('verifies an official receipt signed by top-level key_id and exact raw body hashes', async () => {
    const receipt = officialReceipt();
    const response = new Response(JSON.stringify(receipt), { status: 200 });
    Object.defineProperty(response, 'url', {
      value: 'https://inference.phala.com/v1/aci/receipts/rcpt-0001',
    });
    const verifier = new AciReceiptVerifier({
      baseUrl: 'https://inference.phala.com',
      policy: POLICY,
      fetchImpl: vi.fn(async () => response) as unknown as typeof fetch,
      trustedTimeAuthority: { read: async () => ({ trustedNow: NOW, ...TRUST_CONTEXT }) },
      replayStore: new InMemoryAciReceiptReplayStore(),
    });
    const input: AciReceiptVerificationInput = {
      snapshot: receiptSnapshot(),
      receiptId: 'rcpt-0001',
      requestBytes: new TextEncoder().encode('{"model":"demo/demo-model"}'),
      responseBytes: new TextEncoder().encode('{"choices":[]}'),
      role: 'generate',
      endpoint: '/v1/chat/completions',
      method: 'POST',
      trustedTimeContext: TRUST_CONTEXT,
    };

    await expect(verifier.verify(input)).resolves.toMatchObject({
      receiptId: 'rcpt-0001',
      sessionId: RAW_SESSION_ID,
    });
  });
});
