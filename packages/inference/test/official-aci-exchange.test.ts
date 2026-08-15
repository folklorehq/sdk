// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

import type { InferenceModelRole, InferenceTrustPolicyV2 } from '@folklore/contracts';
import { describe, expect, it, vi } from 'vitest';

import { ACI_POLICY_FIXTURE } from '../../contracts/test/fixtures/aci-v1.js';
import { OfficialAciExchange } from '../src/aci/OfficialAciExchange.js';
import type {
  AciTrustContext,
  ForwardLease,
  OfficialAciExchangeConfig,
  OfficialAciRequest,
  VerifiedAciSessionSet,
  VerifiedAciTrustSnapshot,
} from '../src/ports.js';
import { ForwardLeaseStore } from '../src/aci/ForwardLeaseStore.js';
import { AciReceiptVerifierDouble } from './doubles/aci/AciReceiptVerifierDouble.js';
import { AciTrustStateDouble } from './doubles/aci/AciTrustStateDouble.js';

const REQUEST_BODY = { messages: [{ content: 'hi', role: 'user' }], model: 'demo/model' };
const REQUEST_BYTES = new TextEncoder().encode(JSON.stringify(REQUEST_BODY));
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
        sessionId: `as_${String(generation).padStart(64, '0')}`,
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
  const requestWireSha256 = createHash('sha256').update(bytes).digest('hex');
  const currentSnapshot = snapshot();
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
  return {
    exchange: new OfficialAciExchange({
      baseUrl: POLICY.origin,
      policy: POLICY,
      trustState: state,
      receiptVerifier,
      fetchImpl: fetchImpl as unknown as typeof fetch,
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
        'x-upstream-verification': 'required',
      },
    });
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
    const expected = new TextEncoder().encode(JSON.stringify(body));
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

  it('rejects a snapshot from another trust namespace before consuming or fetching', async () => {
    const leaseStore = new ForwardLeaseStore();
    const foreignContext: AciTrustContext = {
      ...TRUST_CONTEXT,
      deploymentId: 'deployment-2',
    };
    const { exchange, fetchImpl } = setup({
      leaseStore,
      trustState: new AciTrustStateDouble({
        ...snapshot(),
        trustContext: foreignContext,
      } as VerifiedAciTrustSnapshot),
    });
    const lease = await leaseStore.reserve(serializedLease(REQUEST_BYTES));

    await expectCode(
      exchange.executeSerialized(
        { role: 'generate', endpoint: '/v1/chat/completions', method: 'POST' },
        lease,
        () => 'decoded',
      ),
      'trust_mismatch',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('fails closed on status, missing receipt id, timeout, and oversized responses', async () => {
    await expectCode(
      setup({
        fetchImpl: vi.fn(async () => response('', { status: 503 })) as unknown as typeof fetch,
      }).exchange.execute(REQUEST, () => undefined),
      'inference_fetch_failed',
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

  it('executes only the already serialized official bytes after consuming a lease', async () => {
    const leaseStore = new ForwardLeaseStore();
    const { exchange, fetchImpl } = setup({ leaseStore });
    const wire = await exchange.serialize(REQUEST);
    const lease = await leaseStore.reserve(serializedLease(wire.bytes));

    const decoded = await exchange.executeSerialized(
      { role: 'generate', endpoint: '/v1/chat/completions', method: 'POST' },
      lease,
      (bytes) => new TextDecoder().decode(bytes),
    );

    expect(decoded).toBe(RESPONSE_TEXT);
    const [, init] = fetchImpl.mock.calls[0] as [URL, RequestInit];
    expect(new Uint8Array(init.body as ArrayBuffer)).toEqual(REQUEST_BYTES);
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).not.toContain('model_revision');
  });

  it('does not fetch until delayed consumption completes and erases the returned lease wire', async () => {
    let releaseConsume: (() => void) | undefined;
    const consumeGate = new Promise<void>((resolve) => {
      releaseConsume = resolve;
    });
    const consume = vi.fn(async () => consumeGate);
    const fetchImpl = vi.fn(async () => response());
    const { exchange } = setup({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      leaseStore: { consume } as unknown as OfficialAciExchangeConfig['leaseStore'],
    });
    const lease = {
      ...serializedLease(REQUEST_BYTES),
      leaseId: 'lease-1',
      boundedWriteValidUntil: 1_750_000_200,
    } as ForwardLease;

    const pending = exchange.executeSerialized(
      { role: 'generate', endpoint: '/v1/chat/completions', method: 'POST' },
      lease,
      () => 'decoded',
    );
    await vi.waitFor(() => expect(consume).toHaveBeenCalledOnce());
    expect(fetchImpl).not.toHaveBeenCalled();
    releaseConsume?.();

    await expect(pending).resolves.toBe('decoded');
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(lease.privateRequestWire.bytes).toEqual(new Uint8Array(REQUEST_BYTES.length));
  });

  it('does not fetch when trusted time expires while lease consumption is pending', async () => {
    let releaseConsume: (() => void) | undefined;
    const consumeGate = new Promise<void>((resolve) => {
      releaseConsume = resolve;
    });
    let consumedWire: Uint8Array | undefined;
    const consume = vi.fn(async (input: { candidateRequestWire: { bytes: Uint8Array } }) => {
      consumedWire = input.candidateRequestWire.bytes;
      return consumeGate;
    });
    const fetchImpl = vi.fn(async () => response());
    const trustedTimeAuthority = {
      read: vi
        .fn()
        .mockResolvedValueOnce(trustedTimeSample(1_750_000_100))
        .mockResolvedValueOnce(trustedTimeSample(1_750_000_100))
        .mockResolvedValueOnce(trustedTimeSample(1_750_000_201)),
    };
    const leaseBytes = new TextEncoder().encode(JSON.stringify(REQUEST_BODY));
    const expectedLeaseBytes = Uint8Array.from(leaseBytes);
    const { exchange } = setup({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      leaseStore: { consume } as unknown as OfficialAciExchangeConfig['leaseStore'],
      trustedTimeAuthority,
    });
    const lease = {
      ...serializedLease(leaseBytes),
      leaseId: 'lease-1',
    } as ForwardLease;

    const pending = exchange.executeSerialized(
      { role: 'generate', endpoint: '/v1/chat/completions', method: 'POST' },
      lease,
      () => 'decoded',
    );
    await vi.waitFor(() => expect(consume).toHaveBeenCalledOnce());
    expect(fetchImpl).not.toHaveBeenCalled();
    releaseConsume?.();

    await expectCode(pending, 'trust_expired');
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(consumedWire).toEqual(new Uint8Array(expectedLeaseBytes.length));
  });

  it('does not consume or fetch when the immediate final trusted-time check fails', async () => {
    const consume = vi.fn(async () => undefined);
    const fetchImpl = vi.fn(async () => response());
    const trustedTimeAuthority = {
      read: vi
        .fn()
        .mockResolvedValueOnce(trustedTimeSample(1_750_000_100))
        .mockResolvedValueOnce(trustedTimeSample(1_750_000_201)),
    };
    const { exchange } = setup({
      fetchImpl: fetchImpl as unknown as typeof fetch,
      leaseStore: { consume } as unknown as OfficialAciExchangeConfig['leaseStore'],
      trustedTimeAuthority,
    });
    const lease = {
      ...serializedLease(REQUEST_BYTES),
      leaseId: 'lease-1',
    } as ForwardLease;

    await expectCode(
      exchange.executeSerialized(
        { role: 'generate', endpoint: '/v1/chat/completions', method: 'POST' },
        lease,
        () => 'decoded',
      ),
      'trust_expired',
    );
    expect(consume).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rejects a trusted-time sample from a different lease boot epoch', async () => {
    const leaseStore = new ForwardLeaseStore();
    const { exchange, fetchImpl } = setup({
      leaseStore,
      trustedTimeAuthority: {
        read: async () => trustedTimeSample(1_750_000_100, { bootEpoch: 'boot-2' }),
      },
    });
    const lease = await leaseStore.reserve(serializedLease(REQUEST_BYTES));

    await expectCode(
      exchange.executeSerialized(
        { role: 'generate', endpoint: '/v1/chat/completions', method: 'POST' },
        lease,
        () => 'decoded',
      ),
      'clock_invalid',
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('revalidates every expiry bound before releasing the decoded response', async () => {
    const leaseStore = new ForwardLeaseStore();
    const decode = vi.fn(() => 'decoded');
    const { exchange } = setup({
      leaseStore,
      trustedTimeAuthority: {
        read: vi
          .fn()
          .mockResolvedValueOnce(trustedTimeSample(1_750_000_100))
          .mockResolvedValueOnce(trustedTimeSample(1_750_000_100))
          .mockResolvedValueOnce(trustedTimeSample(1_750_000_100))
          .mockResolvedValueOnce(trustedTimeSample(1_750_000_201)),
      },
    });
    const lease = await leaseStore.reserve({
      ...serializedLease(REQUEST_BYTES),
      boundedWriteValidUntil: 1_750_000_200,
    });

    await expectCode(
      exchange.executeSerialized(
        { role: 'generate', endpoint: '/v1/chat/completions', method: 'POST' },
        lease,
        decode,
      ),
      'trust_expired',
    );
    expect(decode).not.toHaveBeenCalled();
  });

  it('reads the injected trusted time before write, receipt verification, and response release', async () => {
    const leaseStore = new ForwardLeaseStore();
    const reads: number[] = [];
    const { exchange } = setup({
      leaseStore,
      trustedTimeAuthority: {
        read: async () => {
          const trustedNow = 1_750_000_100 + reads.length;
          reads.push(trustedNow);
          return trustedTimeSample(trustedNow);
        },
      },
    });
    const lease = await leaseStore.reserve(serializedLease(REQUEST_BYTES));

    await exchange.executeSerialized(
      { role: 'generate', endpoint: '/v1/chat/completions', method: 'POST' },
      lease,
      (bytes) => new TextDecoder().decode(bytes),
    );

    expect(reads).toEqual([
      1_750_000_100, 1_750_000_101, 1_750_000_102, 1_750_000_103, 1_750_000_104,
    ]);
  });

  it('propagates the lease trust context to state, every time read, and receipt verification', async () => {
    const stateContexts: unknown[] = [];
    const timeContexts: unknown[] = [];
    const leaseStore = new ForwardLeaseStore();
    const receiptVerifier = new AciReceiptVerifierDouble();
    const trustedTimeAuthority = {
      read: async (context: unknown) => {
        timeContexts.push(context);
        return trustedTimeSample(1_750_000_100);
      },
    };
    const trustState = {
      acquireWithTrustedTime: async (context: unknown) => {
        stateContexts.push(context);
        return snapshot();
      },
    };
    const { exchange } = setup({
      leaseStore,
      receiptVerifier,
      trustState,
      trustedTimeAuthority,
    });
    const lease = await leaseStore.reserve(serializedLease(REQUEST_BYTES));

    await exchange.executeSerialized(
      { role: 'generate', endpoint: '/v1/chat/completions', method: 'POST' },
      lease,
      (bytes) => new TextDecoder().decode(bytes),
    );

    expect(stateContexts).toEqual([TRUST_CONTEXT]);
    expect(timeContexts).toEqual([
      TRUST_CONTEXT,
      TRUST_CONTEXT,
      TRUST_CONTEXT,
      TRUST_CONTEXT,
      TRUST_CONTEXT,
    ]);
    expect(receiptVerifier.inputs[0]?.trustedTimeContext).toEqual(TRUST_CONTEXT);
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
