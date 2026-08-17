// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

import type { InferenceModelRole, InferenceTrustPolicyV2 } from '@folklore/contracts';
import { describe, expect, it, vi } from 'vitest';

import { ACI_POLICY_FIXTURE } from '../../contracts/test/fixtures/aci-v1.js';
import { AciReceiptVerificationError } from '../src/aci/AciReceiptVerificationError.js';
import { OfficialAciExchange } from '../src/aci/OfficialAciExchange.js';
import type {
  AciTrustContext,
  ForwardAdmissionCapability,
  ForwardLease,
  OfficialAciExchangeConfig,
  OfficialAciRequest,
  VerifiedAciSessionSet,
  VerifiedAciTrustSnapshot,
} from '../src/ports.js';
import { AciReceiptVerifierDouble } from './doubles/aci/AciReceiptVerifierDouble.js';
import { AciTrustStateDouble } from './doubles/aci/AciTrustStateDouble.js';

const REQUEST_BODY = { messages: [{ content: 'hi', role: 'user' }], model: 'demo/model' };
const SESSION_ID = `${'0'.repeat(63)}1`;
const REQUEST_WIRE_BODY = {
  ...REQUEST_BODY,
  provider: { aci_verified: true, aci_session_ids: [SESSION_ID] },
};
const REQUEST_BYTES = new TextEncoder().encode(JSON.stringify(REQUEST_WIRE_BODY));
const RESPONSE_TEXT = '{"choices":[{"message":{"content":"verified"}}]}';
const RESPONSE_BYTES = new TextEncoder().encode(RESPONSE_TEXT);
const TRUST_CONTEXT: AciTrustContext = {
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  bootEpoch: 'boot-1',
  checkpointDigest: 'a'.repeat(64),
};
const ROLES: readonly InferenceModelRole[] = ['embed', 'generate', 'critique', 'judge'];
const POLICY: InferenceTrustPolicyV2 = {
  ...ACI_POLICY_FIXTURE,
  permittedModels: [{ model: 'demo/model', revision: 'revision-1' }],
  roleModels: Object.fromEntries(
    ROLES.map((role) => [role, { model: 'demo/model', revision: 'revision-1' }]),
  ) as InferenceTrustPolicyV2['roleModels'],
};

function snapshot(generation = 1): VerifiedAciTrustSnapshot {
  const sessions = Object.fromEntries(
    ROLES.map((role) => [
      role,
      {
        role,
        model: 'demo/model',
        modelRevision: 'revision-1',
        sessionId: String(generation).padStart(64, '0'),
        establishedAt: 1_750_000_000,
        expiresAt: 1_750_003_600,
        workloadKeysetDigest: `sha256:${'2'.repeat(64)}`,
        channelKeyDigest: `sha256:${'3'.repeat(64)}`,
        channelPins: [
          {
            type: 'tls_spki_sha256' as const,
            value: '4'.repeat(64),
            domain: 'inference.phala.com',
          },
        ],
        upstreamIdentityDigest: `sha256:${'5'.repeat(64)}`,
        upstreamIdentity: {
          upstreamName: 'upstream.example',
          urlOrigin: 'https://inference.phala.com',
          verifierId: 'verifier-1',
          claims: { tee_attested: { status: 'asserted' } },
        },
      },
    ]),
  ) as VerifiedAciSessionSet;
  return {
    trustContext: TRUST_CONTEXT,
    generation,
    policyGeneration: POLICY.generation,
    activationGeneration: generation,
    expiresAt: 1_750_003_600,
    keyset: {
      workloadId: `sha256:${'1'.repeat(64)}`,
      workloadKeysetDigest: `sha256:${'2'.repeat(64)}`,
      version: generation,
      notAfter: 1_750_003_600,
      receiptSigningKeys: [],
      e2eePublicKeys: [],
      tlsPublicKeys: [],
      channelPins: sessions.generate.channelPins,
      channelKeyDigest: sessions.generate.channelKeyDigest,
    },
    channelPins: sessions.generate.channelPins,
    sessions,
    supersededKeysetDigests: [],
  };
}

const REQUEST: OfficialAciRequest = {
  role: 'generate',
  endpoint: '/v1/chat/completions',
  method: 'POST',
  body: REQUEST_BODY,
};

function serializedLease(bytes: Uint8Array): Omit<ForwardLease, 'leaseId'> {
  const requestWireSha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const currentSnapshot = snapshot();
  const observedChannelPin = currentSnapshot.sessions.generate.channelPins[0];
  if (observedChannelPin === undefined) throw new Error('missing_fixture_pin');
  return {
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    tenantId: 'org-1',
    assignmentDigest: 'a'.repeat(64),
    workloadId: currentSnapshot.keyset.workloadId,
    runtimeIdentityDigest: 'b'.repeat(64),
    workloadArtifactDigest: 'c'.repeat(64),
    pinnedTrustRootDigest: 'd'.repeat(64),
    workloadKeysetDigest: currentSnapshot.keyset.workloadKeysetDigest,
    tenantAadDigest: 'f'.repeat(64),
    bootEpoch: 'boot-1',
    trustedTimeCheckpointDigest: TRUST_CONTEXT.checkpointDigest,
    gatewayNonce: 'gateway-nonce-1',
    proofId: 'proof-1',
    requestId: 'request-1',
    snapshotDigest: 'a'.repeat(64),
    policyDigest: 'b'.repeat(64),
    role: 'generate',
    sessionId: currentSnapshot.sessions.generate.sessionId,
    model: 'demo/model',
    modelRevision: 'revision-1',
    modelArtifactDigest: 'c'.repeat(64),
    capabilityDigest: 'd'.repeat(64),
    origin: POLICY.origin,
    route: '/v1/chat/completions',
    method: 'POST',
    routeIdentityDigest: 'e'.repeat(64),
    channelKeyDigest: currentSnapshot.sessions.generate.channelKeyDigest,
    exporterLabel: 'EXPORTER-ACI-CHANNEL',
    exporterDigest: 'a'.repeat(64),
    transcriptDigest: 'b'.repeat(64),
    policyGeneration: POLICY.generation,
    activationGeneration: 1,
    contentLength: bytes.byteLength,
    commitmentNonce: 'commitment-nonce-1',
    observedChannelPin,
    requestWireSha256,
    requestWireByteLength: bytes.byteLength,
    privateRequestWire: { bytes, requestWireSha256, byteLength: bytes.byteLength },
    proofIssuedAt: 1_750_000_000,
    proofExpiresAt: 1_750_000_200,
    snapshotExpiresAt: 1_750_000_200,
    admissionExpiresAt: 1_750_000_200,
    boundedWriteValidUntil: 1_750_000_200,
  };
}

function response(
  body = RESPONSE_TEXT,
  init: ResponseInit = {},
  receiptId = 'receipt-1',
): Response {
  const result = new Response(body, {
    ...init,
    headers: { 'x-receipt-id': receiptId, ...init.headers },
  });
  Object.defineProperty(result, 'url', {
    value: 'https://inference.phala.com/v1/chat/completions',
  });
  return result;
}

function setup(overrides: Partial<OfficialAciExchangeConfig> = {}): {
  exchange: OfficialAciExchange;
  state: AciTrustStateDouble;
  receiptVerifier: AciReceiptVerifierDouble;
  fetchImpl: ReturnType<typeof vi.fn>;
} {
  const state = new AciTrustStateDouble(snapshot());
  const receiptVerifier = new AciReceiptVerifierDouble();
  const fetchImpl = vi.fn(async () => response());
  const configuredFetch = overrides.fetchImpl ?? (fetchImpl as unknown as typeof fetch);
  const channelTransport = {
    open: async (input: { session: VerifiedAciTrustSnapshot['sessions']['generate'] }) => {
      const observedChannelPin = input.session.channelPins[0];
      if (observedChannelPin === undefined) throw new Error('missing_fixture_pin');
      return {
        channelKeyDigest: input.session.channelKeyDigest,
        observedChannelPin,
        send: async (bytes: Uint8Array) => {
          const result = await configuredFetch(
            new URL('https://inference.phala.com/v1/chat/completions'),
            {
              method: 'POST',
              headers: {
                authorization: 'Bearer secret',
                'content-type': 'application/json',
              },
              body: Buffer.from(bytes),
              redirect: 'error',
            },
          );
          if (new URL(result.url).origin !== POLICY.origin) throw new Error('origin_mismatch');
          return {
            receiptId: result.headers.get('x-receipt-id') ?? '',
            responseBytes: new Uint8Array(await result.arrayBuffer()),
            responseOk: result.ok,
          };
        },
        close: async () => undefined,
      };
    },
  };
  return {
    exchange: new OfficialAciExchange({
      baseUrl: POLICY.origin,
      policy: POLICY,
      trustState: state,
      receiptVerifier,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      channelTransport,
      testOnlyAllowUnleasedPaths: true,
      apiKey: 'secret',
      trustedTimeAuthority: {
        read: async () => trustedTimeSample(1_750_000_100),
      },
      trustedTimeContext: TRUST_CONTEXT,
      timeoutMs: 50,
      ...overrides,
    }),
    state,
    receiptVerifier,
    fetchImpl,
  };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    name: 'OfficialAciExchangeError',
    code,
    message: `Official ACI exchange failed: ${code}`,
  });
}

describe('OfficialAciExchange', () => {
  it('binds the official provider controls to the verified session before serialization', async () => {
    const { exchange } = setup();

    const wire = await exchange.serialize({
      ...REQUEST,
      body: {
        ...REQUEST_BODY,
        provider: { order: ['phala'] },
      },
    });

    expect(JSON.parse(new TextDecoder().decode(wire.bytes))).toEqual({
      ...REQUEST_BODY,
      provider: {
        order: ['phala'],
        aci_verified: true,
        aci_session_ids: [snapshot().sessions.generate.sessionId],
      },
    });
  });

  it.each([
    { aci_verified: false },
    { aci_session_ids: ['f'.repeat(64)] },
    { aci_provider_nonce: 'caller-controlled' },
    { aci_future_control: 'caller-controlled' },
  ])('rejects caller-controlled official provider trust fields %#', async (provider) => {
    const { exchange, fetchImpl } = setup();

    await expectCode(
      exchange.execute({ ...REQUEST, body: { ...REQUEST_BODY, provider } }, () => undefined),
      'trust_mismatch',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects oversized requests before parsing provider trust fields', async () => {
    const { exchange, fetchImpl } = setup({ maxRequestBytes: 64 });

    await expectCode(
      exchange.execute(
        {
          ...REQUEST,
          body: {
            ...REQUEST_BODY,
            padding: 'x'.repeat(128),
            provider: { aci_verified: false },
          },
        },
        () => undefined,
      ),
      'request_too_large',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a request that exceeds the bound only after provider controls are injected', async () => {
    const callerBytes = new TextEncoder().encode(JSON.stringify(REQUEST_BODY)).byteLength;
    const { exchange, fetchImpl } = setup({ maxRequestBytes: callerBytes + 1 });

    await expectCode(
      exchange.execute(REQUEST, () => undefined),
      'request_too_large',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('sends one exact official request and releases only receipt-verified response bytes', async () => {
    const { exchange, fetchImpl, receiptVerifier } = setup();
    const decoded = await exchange.execute(REQUEST, (bytes) =>
      JSON.parse(new TextDecoder().decode(bytes)),
    );

    expect(decoded).toEqual({ choices: [{ message: { content: 'verified' } }] });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(url.href).toBe('https://inference.phala.com/v1/chat/completions');
    expect(init).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        authorization: 'Bearer secret',
        'content-type': 'application/json',
      },
    });
    expect(init.headers).not.toHaveProperty('x-upstream-verification');
    expect(new TextEncoder().encode(init.body as string)).toEqual(REQUEST_BYTES);
    expect(receiptVerifier.inputs).toHaveLength(1);
    expect(receiptVerifier.inputs[0]).toMatchObject({
      receiptId: 'receipt-1',
      role: 'generate',
      endpoint: '/v1/chat/completions',
      method: 'POST',
    });
    expect(receiptVerifier.inputs[0]?.requestBytes).toEqual(REQUEST_BYTES);
    expect(receiptVerifier.inputs[0]?.responseBytes).toEqual(RESPONSE_BYTES);
  });

  it('uses injected trusted-time acquisition instead of a synchronous host clock', async () => {
    const current = snapshot();
    const trustState = {
      acquire: () => {
        throw new Error('host wall clock must not be used');
      },
      acquireWithTrustedTime: async () => current,
    };
    const { exchange } = setup({ trustState });

    await expect(exchange.execute(REQUEST, () => 'decoded')).resolves.toBe('decoded');
  });

  it('fails closed for V2 freshness when trusted time is absent', async () => {
    const { exchange } = setup({ trustedTimeAuthority: undefined });

    await expectCode(
      exchange.execute(REQUEST, () => 'decoded'),
      'clock_invalid',
    );
  });

  it('does not invoke decode until receipt verification succeeds', async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const verifier = new AciReceiptVerifierDouble(async (input) => {
      await gate;
      return {
        receiptId: 'receipt-1',
        servedAt: 1,
        sessionId: input.snapshot.sessions.generate.sessionId,
      };
    });
    const decode = vi.fn(() => 'decoded');
    const { exchange } = setup({ receiptVerifier: verifier });

    const pending = exchange.execute(REQUEST, decode);
    await vi.waitFor(() => expect(verifier.inputs).toHaveLength(1));
    expect(decode).not.toHaveBeenCalled();
    release?.();
    await expect(pending).resolves.toBe('decoded');
    expect(decode).toHaveBeenCalledOnce();
  });

  it('withholds response bytes on every receipt verification failure', async () => {
    const verifier = new AciReceiptVerifierDouble(async () => {
      throw new Error('untrusted receipt details');
    });
    const decode = vi.fn();
    const { exchange } = setup({ receiptVerifier: verifier });
    await expectCode(exchange.execute(REQUEST, decode), 'receipt_verification_failed');
    expect(decode).not.toHaveBeenCalled();
  });

  it('retains one snapshot while a post-response rotation occurs', async () => {
    const original = snapshot(1);
    const rotated = snapshot(2);
    const state = new AciTrustStateDouble(original);
    const verifier = new AciReceiptVerifierDouble();
    const fetchImpl = vi.fn(async () => {
      state.replace(rotated);
      return response();
    }) as unknown as typeof fetch;
    const { exchange } = setup({ trustState: state, receiptVerifier: verifier, fetchImpl });

    await exchange.execute(REQUEST, () => 'decoded');
    expect(verifier.inputs[0]?.snapshot).toBe(original);
    expect(verifier.inputs[0]?.snapshot).not.toBe(rotated);
  });

  it('keeps receipt ids request-local across concurrent exchanges', async () => {
    let releaseFirst: (() => void) | undefined;
    const firstBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(RESPONSE_BYTES);
        releaseFirst = () => controller.close();
      },
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        (() => {
          const result = new Response(firstBody, { headers: { 'x-receipt-id': 'receipt-first' } });
          Object.defineProperty(result, 'url', {
            value: 'https://inference.phala.com/v1/chat/completions',
          });
          return result;
        })(),
      )
      .mockResolvedValueOnce(response(RESPONSE_TEXT, {}, 'receipt-second'));
    const verifier = new AciReceiptVerifierDouble();
    const { exchange } = setup({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      receiptVerifier: verifier,
    });

    const first = exchange.execute(REQUEST, () => 'first');
    const second = exchange.execute(REQUEST, () => 'second');
    await expect(second).resolves.toBe('second');
    releaseFirst?.();
    await expect(first).resolves.toBe('first');
    expect(verifier.inputs.map((input) => input.receiptId).sort()).toEqual([
      'receipt-first',
      'receipt-second',
    ]);
  });

  it('serializes the request body exactly once and verifies those exact bytes', async () => {
    let serializations = 0;
    const body = {
      toJSON() {
        serializations += 1;
        return REQUEST_BODY;
      },
    };
    const { exchange, receiptVerifier } = setup();
    await exchange.execute({ ...REQUEST, body }, () => 'decoded');
    expect(serializations).toBe(1);
    expect(receiptVerifier.inputs[0]?.requestBytes).toEqual(REQUEST_BYTES);
  });

  it('preserves valid fractional inference parameters in the exact request', async () => {
    const body = { ...REQUEST_BODY, temperature: 0.7 };
    const expected = new TextEncoder().encode(
      JSON.stringify({ ...body, provider: REQUEST_WIRE_BODY.provider }),
    );
    const { exchange, receiptVerifier } = setup();
    await exchange.execute({ ...REQUEST, body }, () => 'decoded');
    expect(receiptVerifier.inputs[0]?.requestBytes).toEqual(expected);
  });

  it('does not let a verifier substitute the response passed to decode', async () => {
    const verifier = new AciReceiptVerifierDouble(async (input) => {
      input.responseBytes.fill(0);
      return {
        receiptId: 'receipt-1',
        servedAt: 1,
        sessionId: input.snapshot.sessions.generate.sessionId,
      };
    });
    const { exchange } = setup({ receiptVerifier: verifier });
    const decoded = await exchange.execute(REQUEST, (bytes) => new TextDecoder().decode(bytes));
    expect(decoded).toBe(RESPONSE_TEXT);
  });

  it('fails before transport without a snapshot or with a mismatched model', async () => {
    const fetchImpl = vi.fn(async () => response());
    const { exchange } = setup({
      trustState: new AciTrustStateDouble(undefined),
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await expectCode(
      exchange.execute(REQUEST, () => undefined),
      'trust_unavailable',
    );
    expect(fetchImpl).not.toHaveBeenCalled();

    const configured = setup();
    await expectCode(
      configured.exchange.execute(
        { ...REQUEST, body: { ...REQUEST_BODY, model: 'other/model' } },
        () => undefined,
      ),
      'model_mismatch',
    );
    expect(configured.fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed on status, missing receipt id, timeout, and oversized responses', async () => {
    await expectCode(
      setup({
        fetchImpl: vi.fn(async () => response('', { status: 503 })) as unknown as typeof fetch,
      }).exchange.execute(REQUEST, () => undefined),
      'receipt_verification_failed',
    );
    await expectCode(
      setup({
        fetchImpl: vi.fn(async () => {
          const result = new Response(RESPONSE_TEXT);
          Object.defineProperty(result, 'url', {
            value: 'https://inference.phala.com/v1/chat/completions',
          });
          return result;
        }) as unknown as typeof fetch,
      }).exchange.execute(REQUEST, () => undefined),
      'receipt_id_missing',
    );
    await expectCode(
      setup({
        fetchImpl: vi.fn(() => new Promise<Response>(() => undefined)) as unknown as typeof fetch,
        timeoutMs: 5,
      }).exchange.execute(REQUEST, () => undefined),
      'inference_timeout',
    );
    await expectCode(
      setup({ maxResponseBytes: 10 }).exchange.execute(REQUEST, () => undefined),
      'response_too_large',
    );
  });

  it('fetches and verifies a non-2xx payload before surfacing a verified refusal', async () => {
    const refusalVerifier = {
      verify: vi.fn(async () => ({
        outcome: 'refused' as const,
        receiptId: 'receipt-refused',
        servedAt: 1_750_000_100,
      })),
    } as unknown as OfficialAciExchangeConfig['receiptVerifier'];
    const refusalBody = '{"error":"provider refused"}';
    const fetchImpl = vi.fn(async () => response(refusalBody, { status: 403 }, 'receipt-refused'));
    const decode = vi.fn();
    const { exchange } = setup({ receiptVerifier: refusalVerifier, fetchImpl });

    await expectCode(exchange.execute(REQUEST, decode), 'inference_refused');
    expect(refusalVerifier.verify).toHaveBeenCalledWith(
      expect.objectContaining({
        receiptId: 'receipt-refused',
        requestBytes: REQUEST_BYTES,
        responseBytes: new TextEncoder().encode(refusalBody),
      }),
    );
    expect(decode).not.toHaveBeenCalled();
  });

  it('fails closed when a non-2xx response has a malformed refusal receipt', async () => {
    const refusalVerifier = {
      verify: vi.fn(async () => {
        throw new AciReceiptVerificationError('receipt_malformed');
      }),
    } as unknown as OfficialAciExchangeConfig['receiptVerifier'];
    const { exchange } = setup({
      receiptVerifier: refusalVerifier,
      fetchImpl: vi.fn(async () => response('{"error":"provider refused"}', { status: 403 })),
    });

    await expectCode(
      exchange.execute(REQUEST, () => undefined),
      'receipt_verification_failed',
    );
  });

  it('fails closed when a non-2xx response has no receipt id', async () => {
    const result = new Response('{"error":"provider refused"}', { status: 403 });
    Object.defineProperty(result, 'url', {
      value: 'https://inference.phala.com/v1/chat/completions',
    });
    const fetchImpl = vi.fn(async () => result) as unknown as typeof fetch;
    const { exchange } = setup({ fetchImpl });

    await expectCode(
      exchange.execute(REQUEST, () => undefined),
      'receipt_id_missing',
    );
  });

  it('rejects successful serving evidence for a non-2xx response', async () => {
    const successfulVerifier = {
      verify: vi.fn(async (input: { snapshot: VerifiedAciTrustSnapshot; role: 'generate' }) => ({
        outcome: 'served' as const,
        receiptId: 'receipt-success',
        servedAt: 1_750_000_100,
        sessionId: input.snapshot.sessions[input.role].sessionId,
      })),
    } as unknown as OfficialAciExchangeConfig['receiptVerifier'];
    const { exchange } = setup({
      receiptVerifier: successfulVerifier,
      fetchImpl: vi.fn(async () => response('{"error":"provider refused"}', { status: 403 })),
    });

    await expectCode(
      exchange.execute(REQUEST, () => undefined),
      'receipt_verification_failed',
    );
  });

  it('surfaces a refusal only when verified evidence has no serving session', async () => {
    const refusalVerifier = {
      verify: vi.fn(async () => ({
        outcome: 'refused' as const,
        receiptId: 'receipt-refused',
        servedAt: 1_750_000_100,
      })),
    } as unknown as OfficialAciExchangeConfig['receiptVerifier'];
    const { exchange } = setup({
      receiptVerifier: refusalVerifier,
      fetchImpl: vi.fn(async () => response('{"error":"provider refused"}', { status: 403 })),
    });

    await expectCode(
      exchange.execute(REQUEST, () => undefined),
      'inference_refused',
    );
  });

  it('rejects an inference response whose final origin differs from the pinned origin', async () => {
    const fetchImpl = vi.fn(async () => {
      const finalResponse = response();
      Object.defineProperty(finalResponse, 'url', {
        value: 'https://evil.example/v1/chat/completions',
      });
      return finalResponse;
    }) as unknown as typeof fetch;

    await expectCode(
      setup({ fetchImpl }).exchange.execute(REQUEST, () => undefined),
      'inference_fetch_failed',
    );
  });

  it('rejects an inference response with no final URL', async () => {
    await expectCode(
      setup({
        fetchImpl: vi.fn(
          async () => new Response(RESPONSE_TEXT, { headers: { 'x-receipt-id': 'receipt-1' } }),
        ) as unknown as typeof fetch,
      }).exchange.execute(REQUEST, () => undefined),
      'inference_fetch_failed',
    );
  });

  it('requires an opaque post-admission capability for serialized execution', async () => {
    const { exchange } = setup();
    const lease = serializedLease(REQUEST_BYTES) as ForwardLease;

    await expectCode(
      exchange.executeSerialized(
        { role: 'generate', endpoint: '/v1/chat/completions', method: 'POST' },
        lease,
        {} as ForwardAdmissionCapability,
        () => 'unreachable',
      ),
      'admission_required',
    );
  });
});

function trustedTimeSample(
  trustedNow: number,
  overrides: Partial<{
    orgId: string;
    deploymentId: string;
    bootEpoch: string;
    checkpointDigest: string;
  }> = {},
) {
  return {
    trustedNow,
    checkpointDigest: 'a'.repeat(64),
    bootEpoch: 'boot-1',
    orgId: 'org-1',
    deploymentId: 'deployment-1',
    ...overrides,
  };
}
