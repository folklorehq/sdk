// SPDX-License-Identifier: Apache-2.0
import {
  ECDH,
  createHash,
  createPrivateKey,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import { secp256k1 } from '@noble/curves/secp256k1.js';

import type { AciReceipt, InferenceModelRole, InferenceTrustPolicyV2 } from '@folklore/contracts';
import { canonicalJson } from '@folklore/utils';
import { describe, expect, it, vi } from 'vitest';

import {
  ACI_POLICY_FIXTURE,
  ACI_RECEIPT_FIXTURE,
  ACI_REPORT_FIXTURE,
  ACI_SESSION_FIXTURE,
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
  workloadId: ACI_RECEIPT_FIXTURE.workload_id,
  workloadKeysetDigest: ACI_RECEIPT_FIXTURE.workload_keyset_digest,
  version: ACI_REPORT_FIXTURE.attestation.workload_keyset.keyset_epoch.version,
  notAfter: ACI_REPORT_FIXTURE.attestation.workload_keyset.keyset_epoch.not_after,
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
      sessionId: ACI_SESSION_FIXTURE.session_id,
      establishedAt: ACI_SESSION_FIXTURE.established_at,
      expiresAt: ACI_SESSION_FIXTURE.expires_at,
      workloadKeysetDigest: KEYSET.workloadKeysetDigest,
      channelKeyDigest: `sha256:${'9'.repeat(64)}`,
      channelPins: SESSION_PINS,
      upstreamIdentityDigest: UPSTREAM_IDENTITY_DIGEST,
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
const SECP256K1_KEY_PAIR = generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
const SECP256K1_SNAPSHOT: VerifiedAciTrustSnapshot = {
  ...SNAPSHOT,
  keyset: {
    ...SNAPSHOT.keyset,
    receiptSigningKeys: [
      {
        keyId: 'receipt-secp256k1',
        algorithm: 'ecdsa-secp256k1',
        publicKey: secp256k1PublicKey(SECP256K1_KEY_PAIR.publicKey),
      },
    ],
  },
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
function secp256k1PublicKey(publicKey: KeyObject): string {
  const jwk = publicKey.export({ format: 'jwk' });
  if (typeof jwk.x !== 'string' || typeof jwk.y !== 'string') {
    throw new Error('secp256k1_public_key_missing_coordinates');
  }
  const x = Buffer.from(jwk.x, 'base64url');
  const y = Buffer.from(jwk.y, 'base64url');
  const lastYByte = y.at(-1);
  if (x.length !== 32 || y.length !== 32 || lastYByte === undefined) {
    throw new Error('secp256k1_public_key_invalid_coordinates');
  }
  return Buffer.concat([Buffer.from([lastYByte % 2 === 0 ? 0x02 : 0x03]), x]).toString('hex');
}

function signedReceipt(overrides: Record<string, unknown> = {}): AciReceipt {
  const receipt = structuredClone({ ...ACI_RECEIPT_FIXTURE, ...overrides }) as AciReceipt;
  const { value: _value, ...signature } = receipt.signature;
  const bytes = Buffer.from(canonicalJson({ ...receipt, signature }));
  const key = createPrivateKey({
    key: Buffer.from(`302e020100300506032b657004220420${'02'.repeat(32)}`, 'hex'),
    format: 'der',
    type: 'pkcs8',
  });
  return {
    ...receipt,
    signature: { ...receipt.signature, value: sign(null, bytes, key).toString('hex') },
  };
}

function signedSecp256k1Receipt(recoveryId?: number): AciReceipt {
  const receipt = structuredClone(ACI_RECEIPT_FIXTURE) as AciReceipt;
  receipt.signature = {
    algo: 'ecdsa-secp256k1',
    key_id: 'receipt-secp256k1',
    value: '0'.repeat(130),
  };
  const { value: _value, ...signature } = receipt.signature;
  const bytes = Buffer.from(canonicalJson({ ...receipt, signature }));
  const signatureBytes = sign('sha256', bytes, {
    dsaEncoding: 'ieee-p1363',
    key: SECP256K1_KEY_PAIR.privateKey,
  });
  const expectedPublicKey = SECP256K1_SNAPSHOT.keyset.receiptSigningKeys[0]?.publicKey;
  const digest = createHash('sha256').update(bytes).digest();
  const selectedRecoveryId =
    recoveryId ??
    [0, 1, 2, 3].find((candidate) => {
      try {
        return (
          secp256k1.Signature.fromCompact(signatureBytes)
            .addRecoveryBit(candidate)
            .recoverPublicKey(digest)
            .toHex(true) === expectedPublicKey
        );
      } catch {
        return false;
      }
    });
  if (selectedRecoveryId === undefined) throw new Error('secp256k1_recovery_id_not_found');
  receipt.signature.value = Buffer.concat([
    signatureBytes,
    Buffer.from([selectedRecoveryId]),
  ]).toString('hex');
  return receipt;
}

function eventLogWithSequence(events: readonly AciReceipt['event_log'][number][]) {
  return events.map((event, seq) => ({ ...event, seq })) as AciReceipt['event_log'];
}

function receiptResponse(receipt: unknown): Response {
  const response = Response.json(receipt);
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
    fetchTimeoutMs: 50,
    ...overrides,
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
      receiptId: ACI_RECEIPT_FIXTURE.receipt_id,
      servedAt: ACI_RECEIPT_FIXTURE.served_at,
      sessionId: ACI_SESSION_FIXTURE.session_id,
    });
  });

  it('verifies a secp256k1 receipt signature with a compressed public point', async () => {
    await expect(
      verifier(signedSecp256k1Receipt()).verify({ ...INPUT, snapshot: SECP256K1_SNAPSHOT }),
    ).resolves.toMatchObject({ receiptId: ACI_RECEIPT_FIXTURE.receipt_id });
  });

  it('rejects a secp256k1 receipt signature with an invalid recovery id', async () => {
    await expectCode(
      verifier(signedSecp256k1Receipt(4)).verify({ ...INPUT, snapshot: SECP256K1_SNAPSHOT }),
      'signature_invalid',
    );
  });

  it('rejects a secp256k1 receipt signature whose recovery byte names another public key', async () => {
    const receipt = signedSecp256k1Receipt();
    const { value: signatureValue } = receipt.signature;
    const signatureBytes = Buffer.from(signatureValue, 'hex');
    const { value: _value, ...signature } = receipt.signature;
    const signedBytes = Buffer.from(canonicalJson({ ...receipt, signature }));
    const digest = createHash('sha256').update(signedBytes).digest();
    const compact = signatureBytes.subarray(0, 64);
    const signerPoint = Buffer.from(
      ECDH.convertKey(
        Buffer.from(SECP256K1_SNAPSHOT.keyset.receiptSigningKeys[0]?.publicKey ?? '', 'hex'),
        'secp256k1',
        undefined,
        undefined,
        'uncompressed',
      ),
    );
    const validRecoveryId = [0, 1, 2, 3].find((recoveryId) => {
      try {
        const recovered = secp256k1.Signature.fromCompact(compact)
          .addRecoveryBit(recoveryId)
          .recoverPublicKey(digest)
          .toRawBytes(false);
        return Buffer.from(recovered).equals(signerPoint);
      } catch {
        return false;
      }
    });
    if (validRecoveryId === undefined) throw new Error('aci_recovery_id_missing');
    const wrongRecoveryId = (validRecoveryId + 1) % 4;
    receipt.signature.value = Buffer.concat([compact, Buffer.from([wrongRecoveryId])]).toString(
      'hex',
    );

    await expectCode(
      verifier(receipt).verify({ ...INPUT, snapshot: SECP256K1_SNAPSHOT }),
      'signature_invalid',
    );
  });

  it('rejects a secp256k1 receipt signature whose compressed signer point is invalid', async () => {
    const snapshot = {
      ...SECP256K1_SNAPSHOT,
      keyset: {
        ...SECP256K1_SNAPSHOT.keyset,
        receiptSigningKeys: [
          {
            keyId: 'receipt-secp256k1',
            algorithm: 'ecdsa-secp256k1' as const,
            publicKey: `02${'00'.repeat(32)}`,
          },
        ],
      },
    };

    await expectCode(
      verifier(signedSecp256k1Receipt()).verify({ ...INPUT, snapshot }),
      'signature_invalid',
    );
  });

  it('rejects request, response, identity, route, and model mutations', async () => {
    const cases: readonly [
      Record<string, unknown>,
      Partial<AciReceiptVerificationInput>,
      string,
    ][] = [
      [{}, { requestBytes: new TextEncoder().encode('other') }, 'request_hash_mismatch'],
      [{}, { responseBytes: new TextEncoder().encode('other') }, 'response_hash_mismatch'],
      [{ workload_id: `sha256:${'f'.repeat(64)}` }, {}, 'workload_mismatch'],
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

  it('requires returned cleartext hash to equal exact plaintext response bytes', async () => {
    const eventLog = ACI_RECEIPT_FIXTURE.event_log.map((event) =>
      event.type === 'response.returned'
        ? { ...event, cleartext_hash: `sha256:${'f'.repeat(64)}` }
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
        signature: { ...ACI_RECEIPT_FIXTURE.signature, value: '00'.repeat(64) },
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
      replayCapacity: 1,
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
            event.type === 'upstream.verified'
              ? { ...event, session_id: `as_${'f'.repeat(64)}` }
              : event,
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

  it('rejects a forwarded request hash that differs even when transparency records the mutation', async () => {
    const eventLog = eventLogWithSequence([
      fixtureEvent(0),
      { ...fixtureEvent(1), body_hash: `sha256:${'f'.repeat(64)}` },
      { seq: 2, type: 'transparency.request_modified' },
      fixtureEvent(2),
      fixtureEvent(3),
    ]);

    await expectCode(
      verifier(signedReceipt({ event_log: eventLog })).verify(INPUT),
      'request_hash_mismatch',
    );
  });

  it('rejects an upstream verification event that occurs after the response was returned', async () => {
    const eventLog = eventLogWithSequence([
      fixtureEvent(0),
      fixtureEvent(1),
      fixtureEvent(3),
      fixtureEvent(2),
    ]);

    await expectCode(
      verifier(signedReceipt({ event_log: eventLog })).verify(INPUT),
      'receipt_malformed',
    );
  });

  it('rejects response transparency after response.returned', async () => {
    const eventLog = eventLogWithSequence([
      fixtureEvent(0),
      fixtureEvent(1),
      fixtureEvent(2),
      fixtureEvent(3),
      { seq: 4, type: 'transparency.response_modified' },
    ]);

    await expectCode(
      verifier(signedReceipt({ event_log: eventLog })).verify(INPUT),
      'receipt_malformed',
    );
  });

  it('rejects a second response transparency event after response.returned', async () => {
    const eventLog = eventLogWithSequence([
      fixtureEvent(0),
      fixtureEvent(1),
      fixtureEvent(2),
      { seq: 3, type: 'response.received' },
      { seq: 4, type: 'transparency.response_modified' },
      fixtureEvent(3),
      { seq: 6, type: 'transparency.response_modified' },
    ]);

    await expectCode(
      verifier(signedReceipt({ event_log: eventLog })).verify(INPUT),
      'receipt_malformed',
    );
  });

  it('rejects upstream verification before request.forwarded', async () => {
    const eventLog = eventLogWithSequence([
      fixtureEvent(0),
      fixtureEvent(2),
      fixtureEvent(1),
      fixtureEvent(3),
    ]);

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
      session_id: `as_${'f'.repeat(64)}`,
    };
    const eventLog = eventLogWithSequence([
      fixtureEvent(0),
      fixtureEvent(1),
      alternate,
      serving,
      fixtureEvent(3),
    ]);

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
    const upstreamEvent = ACI_RECEIPT_FIXTURE.event_log.find(
      (event): event is Extract<AciReceipt['event_log'][number], { type: 'upstream.verified' }> =>
        event.type === 'upstream.verified',
    );
    if (upstreamEvent === undefined) throw new Error('aci_fixture_upstream_event_missing');
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
          upstreamIdentityDigest: `sha256:${createHash('sha256')
            .update(
              canonicalJson({
                upstream_name: upstreamEvent.upstream_name,
                url_origin: upstreamEvent.url_origin,
                verifier_id: upstreamEvent.verifier_id,
                channel_bindings: [binding],
                claims: upstreamEvent.claims,
              }),
            )
            .digest('hex')}`,
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
