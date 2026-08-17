// SPDX-License-Identifier: Apache-2.0
import { createHash, createPrivateKey, sign } from 'node:crypto';

import type { AciReceipt, InferenceModelRole, InferenceTrustPolicyV2 } from '@folklore/contracts';
import { canonicalJson } from '@folklore/utils';
import { describe, expect, it, vi } from 'vitest';

import {
  ACI_POLICY_FIXTURE,
  ACI_RECEIPT_FIXTURE,
  ACI_REPORT_FIXTURE,
  ACI_SESSION_FIXTURE,
  ACI_SESSION_ID,
} from '../../contracts/test/fixtures/aci-v1.js';
import { AciReceiptVerifier } from '../src/aci/AciReceiptVerifier.js';
import type {
  AciTrustContext,
  AciReceiptVerificationInput,
  VerifiedAciChannelPin,
  VerifiedAciKeyset,
  VerifiedAciSessionSet,
  VerifiedAciTrustSnapshot,
} from '../src/ports.js';
import { InMemoryAciReceiptReplayStore } from './doubles/aci/InMemoryAciStores.js';

const NOW = 1_750_000_100;
const TRUST_CONTEXT: AciTrustContext = {
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  bootEpoch: 'boot-1',
  checkpointDigest: 'a'.repeat(64),
};
const REQUEST = new TextEncoder().encode(
  '{"messages":[{"content":"hi","role":"user"}],"model":"demo-model"}',
);
const RESPONSE = new TextEncoder().encode('{"choices":[],"id":"chatcmpl-123"}');
const ROLES: readonly InferenceModelRole[] = ['embed', 'generate', 'critique', 'judge'];
const SESSION_PINS: readonly VerifiedAciChannelPin[] = [
  {
    type: 'tls_spki_sha256',
    value: 'd1'.repeat(32),
    domain: 'upstream.example.com',
  },
];
const UPSTREAM_IDENTITY_DIGEST = `sha256:${createHash('sha256')
  .update(
    canonicalJson({
      upstream_name: ACI_SESSION_FIXTURE.upstream_name,
      url_origin: ACI_SESSION_FIXTURE.endpoint,
      verifier_id: ACI_SESSION_FIXTURE.verifier_id,
      channel_bindings: ACI_SESSION_FIXTURE.channel_binding,
      claims: ACI_SESSION_FIXTURE.claims,
    }),
  )
  .digest('hex')}`;
const POLICY: InferenceTrustPolicyV2 = {
  ...ACI_POLICY_FIXTURE,
  permittedModels: [{ model: 'demo/demo-model', revision: 'revision-1' }],
  roleModels: Object.fromEntries(
    ROLES.map((role) => [role, { model: 'demo/demo-model', revision: 'revision-1' }]),
  ) as InferenceTrustPolicyV2['roleModels'],
};
const KEYSET: VerifiedAciKeyset = {
  workloadId: ACI_RECEIPT_FIXTURE.workload_keyset_digest,
  workloadKeysetDigest: ACI_RECEIPT_FIXTURE.workload_keyset_digest,
  version: POLICY.generation,
  notAfter: ACI_REPORT_FIXTURE.attestation.workload_keyset.not_after,
  receiptSigningKeys: ACI_REPORT_FIXTURE.attestation.workload_keyset.receipt_signing_keys.map(
    (key) => ({ keyId: key.key_id, algorithm: key.algo, publicKey: key.public_key }),
  ),
  e2eePublicKeys: ACI_REPORT_FIXTURE.attestation.workload_keyset.e2ee_public_keys.map((key) => ({
    keyId: key.key_id,
    algorithm: key.algo,
    publicKey: key.public_key,
  })),
  tlsPublicKeys: ACI_REPORT_FIXTURE.attestation.workload_keyset.tls_public_keys.map((key) => ({
    spkiSha256: key.spki_sha256,
    domain: key.domain,
  })),
  channelPins: [{ type: 'tls_spki_sha256', value: 'c0'.repeat(32), domain: 'api.example.com' }],
  channelKeyDigest: `sha256:${'5'.repeat(64)}`,
};
const SESSIONS = Object.fromEntries(
  ROLES.map((role) => [
    role,
    {
      role,
      model: 'demo-model',
      modelRevision: 'revision-1',
      sessionId: ACI_SESSION_ID,
      establishedAt: ACI_SESSION_FIXTURE.established_at,
      expiresAt: ACI_SESSION_FIXTURE.expires_at,
      workloadKeysetDigest: KEYSET.workloadKeysetDigest,
      channelKeyDigest: `sha256:${'9'.repeat(64)}`,
      channelPins: SESSION_PINS,
      upstreamIdentityDigest: UPSTREAM_IDENTITY_DIGEST,
      upstreamIdentity: {
        upstreamName: ACI_SESSION_FIXTURE.upstream_name,
        urlOrigin: ACI_SESSION_FIXTURE.endpoint,
        verifierId: ACI_SESSION_FIXTURE.verifier_id,
        claims: ACI_SESSION_FIXTURE.claims,
      },
    },
  ]),
) as VerifiedAciSessionSet;
const SNAPSHOT: VerifiedAciTrustSnapshot = {
  generation: 1,
  policyGeneration: POLICY.generation,
  activationGeneration: 1,
  expiresAt: ACI_SESSION_FIXTURE.expires_at,
  keyset: KEYSET,
  channelPins: KEYSET.channelPins,
  sessions: SESSIONS,
  supersededKeysetDigests: [],
};
const INPUT: AciReceiptVerificationInput = {
  snapshot: SNAPSHOT,
  receiptId: ACI_RECEIPT_FIXTURE.receipt_id,
  requestBytes: REQUEST,
  responseBytes: RESPONSE,
  role: 'generate',
  endpoint: '/v1/chat/completions',
  method: 'POST',
  trustedTimeContext: TRUST_CONTEXT,
};
function signedReceipt(overrides: Record<string, unknown> = {}): AciReceipt {
  const receipt = structuredClone({ ...ACI_RECEIPT_FIXTURE, ...overrides }) as AciReceipt;
  const { signature: _signature, ...unsigned } = receipt;
  const bytes = Buffer.from(canonicalJson(unsigned));
  const key = createPrivateKey({
    key: Buffer.from(`302e020100300506032b657004220420${'02'.repeat(32)}`, 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
  return {
    ...receipt,
    signature: sign(null, bytes, key).toString('hex'),
  };
}

function receiptResponse(receipt: unknown): Response {
  const response = Response.json(receipt);
  Object.defineProperty(response, 'url', {
    value: 'https://inference.phala.com/v1/aci/receipts/rcpt-0001',
  });
  return response;
}

function receiptResponseBytes(bytes: Uint8Array): Response {
  const response = new Response(bytes, { headers: { 'content-type': 'application/json' } });
  Object.defineProperty(response, 'url', {
    value: 'https://inference.phala.com/v1/aci/receipts/rcpt-0001',
  });
  return response;
}

function fixtureEvent(index: number): AciReceipt['event_log'][number] {
  const event = ACI_RECEIPT_FIXTURE.event_log[index];
  if (event === undefined) throw new Error('aci_fixture_event_missing');
  return event;
}

function verifier(
  receipt: unknown,
  overrides: Partial<ConstructorParameters<typeof AciReceiptVerifier>[0]> = {},
) {
  const { replayCapacity, replayStore, ...verifierOverrides } = overrides;
  const fetchImpl = vi.fn(async () => receiptResponse(receipt)) as unknown as typeof fetch;
  return new AciReceiptVerifier({
    baseUrl: 'https://inference.phala.com',
    policy: POLICY,
    fetchImpl,
    trustedTimeAuthority: {
      read: async () => ({
        trustedNow: NOW,
        checkpointDigest: 'a'.repeat(64),
        bootEpoch: 'boot-1',
        orgId: 'org-1',
        deploymentId: 'deployment-1',
      }),
    },
    replayStore: replayStore ?? new InMemoryAciReceiptReplayStore(replayCapacity),
    fetchTimeoutMs: 50,
    ...verifierOverrides,
  });
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: 'AciReceiptVerificationError',
    code,
    message: `ACI receipt verification failed: ${code}`,
  });
}

describe('AciReceiptVerifier', () => {
  it('fails closed when V2 trusted time is not configured', async () => {
    await expectCode(
      verifier(ACI_RECEIPT_FIXTURE, { trustedTimeAuthority: undefined }).verify(INPUT),
      'clock_invalid',
    );
  });
  it('accepts the pinned upstream receipt vector', async () => {
    const result = await verifier(ACI_RECEIPT_FIXTURE).verify(INPUT);
    expect(result).toEqual({
      outcome: 'served',
      receiptId: ACI_RECEIPT_FIXTURE.receipt_id,
      servedAt: ACI_RECEIPT_FIXTURE.served_at,
      sessionId: ACI_SESSION_ID,
    });
  });

  it('rejects non-ASCII member names in the official receipt artifact', async () => {
    const receipt = signedReceipt({
      event_log: ACI_RECEIPT_FIXTURE.event_log.map((event, index) =>
        index === 0 ? { ...event, ['é']: 'not-an-official-member' } : event,
      ),
    });
    const receiptBytes = new TextEncoder().encode(JSON.stringify(receipt));
    const fetchImpl = vi.fn(async () =>
      receiptResponseBytes(receiptBytes),
    ) as unknown as typeof fetch;
    await expectCode(
      verifier(ACI_RECEIPT_FIXTURE, { fetchImpl }).verify(INPUT),
      'receipt_malformed',
    );
  });

  it('rejects a served receipt without upstream verification', async () => {
    const receipt = signedReceipt({
      event_log: [fixtureEvent(0), fixtureEvent(3)],
    });

    await expectCode(verifier(receipt).verify(INPUT), 'upstream_session_mismatch');
  });

  it('accepts a failed upstream attempt before a later required successful verification', async () => {
    const eventLog = [...ACI_RECEIPT_FIXTURE.event_log];
    eventLog.splice(2, 0, {
      type: 'upstream.verified',
      model_id: 'demo-model',
      result: 'failed',
      required: true,
      reason: 'transient upstream failure',
    });

    await expect(
      verifier(signedReceipt({ event_log: eventLog })).verify(INPUT),
    ).resolves.toMatchObject({
      outcome: 'served',
      sessionId: ACI_SESSION_ID,
    });
  });

  it('accepts a signed provider-rewritten forwarded hash without equating it to request.received', async () => {
    const receipt = signedReceipt({
      event_log: ACI_RECEIPT_FIXTURE.event_log.map((event) =>
        event.type === 'request.forwarded'
          ? { ...event, body_hash: `sha256:${'f'.repeat(64)}` }
          : event,
      ),
    });

    await expect(verifier(receipt).verify(INPUT)).resolves.toMatchObject({
      outcome: 'served',
      receiptId: ACI_RECEIPT_FIXTURE.receipt_id,
    });
  });

  it('rejects request, response, identity, route, and model mutations', async () => {
    const cases: readonly [
      Record<string, unknown>,
      Partial<AciReceiptVerificationInput>,
      string,
    ][] = [
      [{}, { requestBytes: new TextEncoder().encode('other') }, 'request_hash_mismatch'],
      [{}, { responseBytes: new TextEncoder().encode('other') }, 'response_hash_mismatch'],
      [{ workload_keyset_digest: `sha256:${'f'.repeat(64)}` }, {}, 'keyset_mismatch'],
      [{ model: 'other-model' }, {}, 'model_mismatch'],
      [{ endpoint: '/v1/other' }, {}, 'endpoint_mismatch'],
      [{ method: 'PUT' }, {}, 'method_mismatch'],
    ];
    for (const [receiptOverrides, inputOverrides, code] of cases) {
      await expectCode(
        verifier(signedReceipt(receiptOverrides)).verify({ ...INPUT, ...inputOverrides }),
        code,
      );
    }
  });

  it('requires response.returned.body_hash to equal exact response bytes', async () => {
    const eventLog = ACI_RECEIPT_FIXTURE.event_log.map((event) =>
      event.type === 'response.returned'
        ? { ...event, body_hash: `sha256:${'f'.repeat(64)}` }
        : event,
    );

    await expectCode(
      verifier(signedReceipt({ event_log: eventLog })).verify(INPUT),
      'response_hash_mismatch',
    );
  });

  it('rejects signature, signer, receipt id, and replay failures', async () => {
    await expectCode(
      verifier({
        ...ACI_RECEIPT_FIXTURE,
        signature: '00'.repeat(64),
      }).verify(INPUT),
      'signature_invalid',
    );
    await expectCode(
      verifier(ACI_RECEIPT_FIXTURE).verify({ ...INPUT, receiptId: null }),
      'receipt_id_missing',
    );
    await expectCode(
      verifier(ACI_RECEIPT_FIXTURE).verify({ ...INPUT, receiptId: 'other-receipt' }),
      'receipt_id_mismatch',
    );
    const replayVerifier = verifier(ACI_RECEIPT_FIXTURE);
    await replayVerifier.verify(INPUT);
    await expectCode(replayVerifier.verify(INPUT), 'receipt_replay');
  });

  it('retains a verified replay claim across verifier restart', async () => {
    const replayStore = new InMemoryAciReceiptReplayStore();
    await verifier(ACI_RECEIPT_FIXTURE, { replayStore }).verify(INPUT);
    await expectCode(
      verifier(ACI_RECEIPT_FIXTURE, { replayStore }).verify(INPUT),
      'receipt_replay',
    );
  });

  it('namespaces receipt replay by the organization, deployment, boot, and checkpoint context', async () => {
    const contextAware = verifier(ACI_RECEIPT_FIXTURE, {
      trustedTimeAuthority: {
        read: async (context) => ({
          trustedNow: NOW,
          checkpointDigest: context?.checkpointDigest ?? TRUST_CONTEXT.checkpointDigest,
          bootEpoch: context?.bootEpoch ?? TRUST_CONTEXT.bootEpoch,
          orgId: context?.orgId ?? TRUST_CONTEXT.orgId,
          deploymentId: context?.deploymentId ?? TRUST_CONTEXT.deploymentId,
        }),
      },
    });

    await contextAware.verify(INPUT);
    await expect(
      contextAware.verify({
        ...INPUT,
        trustedTimeContext: {
          ...TRUST_CONTEXT,
          deploymentId: 'deployment-2',
        },
      }),
    ).resolves.toMatchObject({ receiptId: ACI_RECEIPT_FIXTURE.receipt_id });
    await expectCode(contextAware.verify(INPUT), 'receipt_replay');
  });

  it('fails closed when bounded replay history reaches capacity instead of evicting', async () => {
    const secondReceipt = signedReceipt({ receipt_id: 'rcpt-0002' });
    const thirdReceipt = signedReceipt({ receipt_id: 'rcpt-0003' });
    const firstReceipt = ACI_RECEIPT_FIXTURE;
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(receiptResponse(firstReceipt))
      .mockResolvedValueOnce(receiptResponse(secondReceipt))
      .mockResolvedValueOnce(receiptResponse(thirdReceipt));
    const replayVerifier = verifier(firstReceipt, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      replayStore: new InMemoryAciReceiptReplayStore(1),
    });

    await replayVerifier.verify(INPUT);
    await expectCode(
      replayVerifier.verify({ ...INPUT, receiptId: secondReceipt.receipt_id }),
      'replay_capacity_exhausted',
    );
    await expectCode(replayVerifier.verify(INPUT), 'receipt_replay');
  });

  it('requires one exact verified upstream session and serving-time validity', async () => {
    const upstream = ACI_RECEIPT_FIXTURE.event_log[2];
    await expectCode(
      verifier(
        signedReceipt({
          event_log: ACI_RECEIPT_FIXTURE.event_log.map((event) =>
            event.type === 'upstream.verified' ? { ...event, session_id: 'f'.repeat(64) } : event,
          ),
        }),
      ).verify(INPUT),
      'upstream_session_mismatch',
    );
    await expectCode(
      verifier(signedReceipt({ served_at: ACI_SESSION_FIXTURE.expires_at })).verify(INPUT),
      'served_at_invalid',
    );
    expect(upstream.type).toBe('upstream.verified');
  });

  it('accepts a signed refusal without request.forwarded', async () => {
    const refusalEvent: Extract<AciReceipt['event_log'][number], { type: 'upstream.verified' }> = {
      type: 'upstream.verified',
      result: 'failed',
      required: true,
      model_id: 'demo-model',
      reason: 'upstream verification refused the request',
    };
    const receipt = signedReceipt({
      event_log: [fixtureEvent(0), refusalEvent, fixtureEvent(3)],
    });

    await expect(verifier(receipt).verify(INPUT)).resolves.toEqual({
      outcome: 'refused',
      receiptId: ACI_RECEIPT_FIXTURE.receipt_id,
      servedAt: ACI_RECEIPT_FIXTURE.served_at,
    });
  });

  it('rejects a refusal receipt whose exact request hash does not match', async () => {
    const refusalEvent: Extract<AciReceipt['event_log'][number], { type: 'upstream.verified' }> = {
      type: 'upstream.verified',
      result: 'failed',
      required: true,
      model_id: 'demo-model',
      reason: 'upstream verification refused the request',
    };
    const receipt = signedReceipt({
      event_log: [
        { ...fixtureEvent(0), body_hash: `sha256:${'f'.repeat(64)}` },
        refusalEvent,
        fixtureEvent(3),
      ],
    });

    await expectCode(verifier(receipt).verify(INPUT), 'request_hash_mismatch');
  });

  it('rejects a malformed refusal receipt instead of treating it as a refusal', async () => {
    const receipt = signedReceipt({
      event_log: [
        fixtureEvent(0),
        {
          type: 'upstream.verified',
          result: 'failed',
          required: true,
          model_id: 'demo-model',
        },
        fixtureEvent(3),
      ],
    });

    await expectCode(verifier(receipt).verify(INPUT), 'receipt_malformed');
  });

  it('rejects an unexpected successful upstream event in a refusal receipt', async () => {
    const refusalEvent: Extract<AciReceipt['event_log'][number], { type: 'upstream.verified' }> = {
      type: 'upstream.verified',
      result: 'failed',
      required: true,
      model_id: 'demo-model',
      reason: 'upstream verification refused the request',
    };
    const receipt = signedReceipt({
      event_log: [
        fixtureEvent(0),
        refusalEvent,
        { ...fixtureEvent(2), required: false },
        fixtureEvent(3),
      ],
    });

    await expectCode(verifier(receipt).verify(INPUT), 'receipt_malformed');
  });

  it('accepts partial optional upstream identity fields while rejecting changed present fields', async () => {
    const eventLog = ACI_RECEIPT_FIXTURE.event_log.map((event) =>
      event.type === 'upstream.verified'
        ? {
            ...event,
            upstream_name: ACI_SESSION_FIXTURE.upstream_name,
          }
        : event,
    ) as AciReceipt['event_log'];

    await expect(
      verifier(signedReceipt({ event_log: eventLog })).verify(INPUT),
    ).resolves.toMatchObject({ outcome: 'served' });
    const changed = eventLog.map((event) =>
      event.type === 'upstream.verified' ? { ...event, upstream_name: 'other-upstream' } : event,
    ) as AciReceipt['event_log'];
    await expectCode(
      verifier(signedReceipt({ event_log: changed })).verify(INPUT),
      'upstream_session_mismatch',
    );
  });

  it('accepts a provider-rewritten forwarded hash while preserving the received hash check', async () => {
    const eventLog = [
      fixtureEvent(0),
      { ...fixtureEvent(1), body_hash: `sha256:${'f'.repeat(64)}` },
      fixtureEvent(2),
      fixtureEvent(3),
    ] as AciReceipt['event_log'];

    await expect(
      verifier(signedReceipt({ event_log: eventLog })).verify(INPUT),
    ).resolves.toMatchObject({ outcome: 'served' });
  });

  it('rejects an upstream verification event that occurs after the response was returned', async () => {
    const eventLog = [
      fixtureEvent(0),
      fixtureEvent(1),
      fixtureEvent(3),
      fixtureEvent(2),
    ] as AciReceipt['event_log'];

    await expectCode(
      verifier(signedReceipt({ event_log: eventLog })).verify(INPUT),
      'receipt_malformed',
    );
  });

  it('rejects upstream verification before request.forwarded', async () => {
    const eventLog = [
      fixtureEvent(0),
      fixtureEvent(2),
      fixtureEvent(1),
      fixtureEvent(3),
    ] as AciReceipt['event_log'];

    await expectCode(
      verifier(signedReceipt({ event_log: eventLog })).verify(INPUT),
      'receipt_malformed',
    );
  });

  it('accepts additional upstream verification attempts when exactly one serves the response', async () => {
    const serving = fixtureEvent(2);
    const alternate = {
      ...serving,
      upstream_name: 'other-upstream',
      session_id: 'f'.repeat(64),
    };
    const eventLog = [
      fixtureEvent(0),
      fixtureEvent(1),
      alternate,
      serving,
      fixtureEvent(3),
    ] as AciReceipt['event_log'];

    await expect(
      verifier(signedReceipt({ event_log: eventLog })).verify(INPUT),
    ).resolves.toMatchObject({ receiptId: ACI_RECEIPT_FIXTURE.receipt_id });
  });

  it('binds the receipt upstream event to every official session identity field', async () => {
    const mutations: readonly Record<string, unknown>[] = [
      { upstream_name: 'other-upstream' },
      { model_id: 'other-model' },
      { url_origin: 'https://other.example.com' },
      { verifier_id: 'other-verifier' },
      { claims: { ...ACI_SESSION_FIXTURE.claims, tee_attested: { status: 'unknown' } } },
    ];

    for (const mutation of mutations) {
      const eventLog = ACI_RECEIPT_FIXTURE.event_log.map((event) =>
        event.type === 'upstream.verified' ? { ...event, ...mutation } : event,
      ) as AciReceipt['event_log'];
      await expectCode(
        verifier(signedReceipt({ event_log: eventLog })).verify(INPUT),
        'upstream_session_mismatch',
      );
    }
  });

  it('normalizes E2EE receipt bindings with the provider identity and no derived domain', async () => {
    const binding = {
      type: 'e2ee_public_key_sha256' as const,
      provider: 'upstream-provider',
      key_id: 'e2ee-1',
      algorithm: 'x25519-aes-256-gcm-hkdf-sha256',
      public_key_sha256: 'e2'.repeat(32),
    };
    const snapshot = {
      ...SNAPSHOT,
      sessions: {
        ...SESSIONS,
        generate: {
          ...SESSIONS.generate,
          channelPins: [
            {
              type: 'e2ee_public_key_sha256' as const,
              value: binding.public_key_sha256,
              provider: binding.provider,
              keyId: binding.key_id,
              algorithm: binding.algorithm,
            },
          ] as unknown as VerifiedAciSessionSet['generate']['channelPins'],
          upstreamIdentityDigest: SESSIONS.generate.upstreamIdentityDigest,
        },
      },
    };
    const eventLog = ACI_RECEIPT_FIXTURE.event_log.map((event) =>
      event.type === 'upstream.verified' ? { ...event, channel_bindings: [binding] } : event,
    ) as AciReceipt['event_log'];

    await expect(
      verifier(signedReceipt({ event_log: eventLog })).verify({ ...INPUT, snapshot }),
    ).resolves.toMatchObject({ receiptId: ACI_RECEIPT_FIXTURE.receipt_id });
  });

  it('ignores documented future receipt channel-binding extensions after matching known pins', async () => {
    const extension = {
      type: 'future_channel_binding_v1',
      binding_digest: `sha256:${'6'.repeat(64)}`,
      purpose: 'extension compatibility',
    };
    const eventLog = ACI_RECEIPT_FIXTURE.event_log.map((event) =>
      event.type === 'upstream.verified'
        ? { ...event, channel_bindings: [...ACI_SESSION_FIXTURE.channel_binding, extension] }
        : event,
    ) as AciReceipt['event_log'];

    await expect(verifier(signedReceipt({ event_log: eventLog })).verify(INPUT)).resolves.toEqual({
      outcome: 'served',
      receiptId: ACI_RECEIPT_FIXTURE.receipt_id,
      servedAt: ACI_RECEIPT_FIXTURE.served_at,
      sessionId: ACI_SESSION_ID,
    });
  });

  it('rejects legacy receipt fields and nonofficial response hashes', async () => {
    const signed = signedReceipt();
    const responseEvent = fixtureEvent(3);
    const cases: readonly unknown[] = [
      { ...signed, workload_id: 'legacy-workload' },
      {
        ...signed,
        signature: { key_id: 'receipt-1', algo: 'ed25519', value: signed.signature },
      },
      {
        ...signed,
        signature: 'AA'.repeat(64),
      },
      {
        ...signed,
        event_log: signed.event_log.map((event) =>
          event.type === 'upstream.verified' ? { ...event, seq: 1 } : event,
        ),
      },
      {
        ...signed,
        event_log: signed.event_log.map((event) =>
          event.type === 'response.returned'
            ? { ...event, wire_hash: responseEvent.body_hash }
            : event,
        ),
      },
      {
        ...signed,
        event_log: signed.event_log.map((event) =>
          event.type === 'response.returned'
            ? { ...event, cleartext_hash: responseEvent.body_hash }
            : event,
        ),
      },
    ];

    for (const receipt of cases) {
      await expectCode(verifier(receipt).verify(INPUT), 'receipt_malformed');
    }
  });

  it('rejects an unknown signer and a mutation after signing', async () => {
    await expectCode(
      verifier(signedReceipt({ key_id: 'unknown-receipt-key' })).verify(INPUT),
      'signer_not_found',
    );

    const signed = signedReceipt();
    await expectCode(
      verifier({ ...signed, chat_id: 'mutated-chat-id' }).verify(INPUT),
      'signature_invalid',
    );
  });

  it('fails closed on malformed, duplicate-key, status, timeout, and oversized receipts', async () => {
    const malformedFetch = vi.fn(async () =>
      receiptResponse('{"api_version":"aci/1","api_version":"aci/1"}'),
    ) as unknown as typeof fetch;
    await expectCode(
      verifier({}, { fetchImpl: malformedFetch }).verify(INPUT),
      'receipt_malformed',
    );
    const statusFetch = vi.fn(
      async () => new Response('', { status: 404 }),
    ) as unknown as typeof fetch;
    await expectCode(
      verifier({}, { fetchImpl: statusFetch }).verify(INPUT),
      'receipt_fetch_failed',
    );
    const timeoutFetch = vi.fn(
      () => new Promise<Response>(() => undefined),
    ) as unknown as typeof fetch;
    await expectCode(
      verifier({}, { fetchImpl: timeoutFetch, fetchTimeoutMs: 5 }).verify(INPUT),
      'receipt_timeout',
    );
    await expectCode(
      verifier(ACI_RECEIPT_FIXTURE, { maxReceiptBytes: 10 }).verify(INPUT),
      'receipt_too_large',
    );
  });

  it('bounds declared and streamed receipt bodies before parsing', async () => {
    const declaredFetch = vi.fn(async () => {
      const response = new Response(null, { headers: { 'content-length': '1000' } });
      Object.defineProperty(response, 'url', {
        value: 'https://inference.phala.com/v1/aci/receipts/rcpt-0001',
      });
      return response;
    }) as unknown as typeof fetch;
    await expectCode(
      verifier({}, { fetchImpl: declaredFetch, maxReceiptBytes: 10 }).verify(INPUT),
      'receipt_too_large',
    );

    const streamedFetch = vi.fn(async () =>
      (() => {
        const response = new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new Uint8Array(8));
              controller.enqueue(new Uint8Array(8));
              controller.close();
            },
          }),
        );
        Object.defineProperty(response, 'url', {
          value: 'https://inference.phala.com/v1/aci/receipts/rcpt-0001',
        });
        return response;
      })(),
    ) as unknown as typeof fetch;
    await expectCode(
      verifier({}, { fetchImpl: streamedFetch, maxReceiptBytes: 10 }).verify(INPUT),
      'receipt_too_large',
    );
  });

  it('reserves in-flight receipt ids and permits retry after a failed verification', async () => {
    let release: ((response: Response) => void) | undefined;
    const pending = new Promise<Response>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(() => pending) as unknown as typeof fetch;
    const concurrent = verifier({}, { fetchImpl });
    const first = concurrent.verify(INPUT);
    await expectCode(concurrent.verify(INPUT), 'receipt_replay');
    release?.(receiptResponse(ACI_RECEIPT_FIXTURE));
    await expect(first).resolves.toMatchObject({ receiptId: ACI_RECEIPT_FIXTURE.receipt_id });

    const retry = verifier({ ...ACI_RECEIPT_FIXTURE, receipt_id: 'wrong' });
    await expectCode(retry.verify(INPUT), 'receipt_id_mismatch');
    await expectCode(retry.verify(INPUT), 'receipt_id_mismatch');
  });

  it('uses the configured credential only for the bounded receipt request', async () => {
    const fetchImpl = vi.fn(async () =>
      receiptResponse(ACI_RECEIPT_FIXTURE),
    ) as unknown as typeof fetch;
    const result = await verifier(ACI_RECEIPT_FIXTURE, { fetchImpl, apiKey: 'secret' }).verify(
      INPUT,
    );
    expect(result.receiptId).toBe(ACI_RECEIPT_FIXTURE.receipt_id);
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.href).toBe(
      `https://inference.phala.com/v1/aci/receipts/${ACI_RECEIPT_FIXTURE.receipt_id}`,
    );
    expect(init).toMatchObject({
      headers: { authorization: 'Bearer secret' },
      method: 'GET',
      redirect: 'error',
    });
  });

  it('rejects a receipt response that reports a different final origin', async () => {
    const fetchImpl = vi.fn(async () => {
      const response = Response.json(ACI_RECEIPT_FIXTURE);
      Object.defineProperty(response, 'url', {
        value: 'https://evil.example/v1/aci/receipts/rcpt-0001',
      });
      return response;
    }) as unknown as typeof fetch;

    await expectCode(
      verifier(ACI_RECEIPT_FIXTURE, { fetchImpl }).verify(INPUT),
      'receipt_fetch_failed',
    );
  });

  it('rejects a receipt response with no final URL', async () => {
    const fetchImpl = vi.fn(async () =>
      Response.json(ACI_RECEIPT_FIXTURE),
    ) as unknown as typeof fetch;

    await expectCode(
      verifier(ACI_RECEIPT_FIXTURE, { fetchImpl }).verify(INPUT),
      'receipt_fetch_failed',
    );
  });
});
