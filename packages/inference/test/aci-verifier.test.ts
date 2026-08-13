// SPDX-License-Identifier: Apache-2.0
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  inferenceAttestationV1Payload,
  inferenceReceiptKeysetV1Payload,
} from '@folklore/contracts';
import { AciReceiptVerifier, InferenceAttestationError } from '../src/aci-verifier.js';
const BASE_URL = 'https://inference.example.com';
const WORKLOAD_ID = 'wl-123';
const KEYSET_DIGEST = 'd'.repeat(64);
const CHANNEL_KEY_DIGEST = 'e'.repeat(64);
const SESSION_ID = 'sess-42';
const ATTESTATION_PAIR = generateKeyPairSync('ed25519');
const RECEIPT_PAIR = generateKeyPairSync('ed25519');

const EVIDENCE = {
  requestSha256: 'a'.repeat(64),
  responseSha256: 'b'.repeat(64),
  model: 'provider/model',
  modelRevision: 'revision-1',
  modelRole: 'generate' as const,
  nonce: Buffer.alloc(32, 7).toString('base64'),
};

function rawPublicKeyBase64(
  publicKey: ReturnType<typeof generateKeyPairSync>['publicKey'],
): string {
  const spki = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return spki.subarray(spki.length - 32).toString('base64');
}

const ATTESTATION_PUBLIC_KEY = rawPublicKeyBase64(ATTESTATION_PAIR.publicKey);
const RECEIPT_PUBLIC_KEY = rawPublicKeyBase64(RECEIPT_PAIR.publicKey);

function trustPolicy() {
  return {
    version: 1 as const,
    generation: 1,
    origin: BASE_URL,
    route: '/v1',
    redirectOrigins: [],
    tlsSpkiSha256: ['a'.repeat(64)],
    workloadId: WORKLOAD_ID,
    quoteRootDigests: ['1'.repeat(64)],
    workloadMeasurements: ['2'.repeat(96)],
    attestationKeys: [
      {
        keyId: 'attestation-key-1',
        algorithm: 'Ed25519' as const,
        publicKey: ATTESTATION_PUBLIC_KEY,
      },
    ],
    receiptKeys: [
      { keyId: 'receipt-key-1', algorithm: 'Ed25519' as const, publicKey: RECEIPT_PUBLIC_KEY },
    ],
    permittedModels: [{ model: 'provider/model', revision: 'revision-1' }],
    roleModels: {
      embed: { model: 'provider/model', revision: 'revision-1' },
      generate: { model: 'provider/model', revision: 'revision-1' },
      judge: { model: 'provider/model', revision: 'revision-1' },
      critique: { model: 'provider/model', revision: 'revision-1' },
    },
  };
}

function receiptKeysetDigest(): string {
  return createHash('sha256')
    .update(inferenceReceiptKeysetV1Payload(trustPolicy().receiptKeys), 'utf8')
    .digest('hex');
}

function unsignedAttestation(overrides: Record<string, unknown> = {}) {
  return {
    workload_id: WORKLOAD_ID,
    workload_keyset_digest: KEYSET_DIGEST,
    channel_key_digest: CHANNEL_KEY_DIGEST,
    quote_root_digest: '1'.repeat(64),
    workload_measurement: '2'.repeat(96),
    receipt_keyset_digest: receiptKeysetDigest(),
    policy_generation: 1,
    route: '/v1',
    signer_key_id: 'attestation-key-1',
    ...overrides,
  };
}

function attestation(overrides: Record<string, unknown> = {}) {
  const unsigned = unsignedAttestation(overrides);
  const signature = sign(
    null,
    Buffer.from(
      inferenceAttestationV1Payload({
        workloadId: String(unsigned.workload_id),
        workloadKeysetDigest: String(unsigned.workload_keyset_digest),
        quoteRootDigest: String(unsigned.quote_root_digest),
        workloadMeasurement: String(unsigned.workload_measurement),
        receiptKeysetDigest: String(unsigned.receipt_keyset_digest),
        channelKeyDigest: String(unsigned.channel_key_digest),
        trustPolicyGeneration: Number(unsigned.policy_generation),
        route: String(unsigned.route),
        signerKeyId: String(unsigned.signer_key_id),
      }),
      'utf8',
    ),
    ATTESTATION_PAIR.privateKey,
  );
  return { ...unsigned, signature: signature.toString('base64') };
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function verifiedReceipt(overrides: Record<string, unknown> = {}) {
  return {
    workload_id: WORKLOAD_ID,
    workload_keyset_digest: KEYSET_DIGEST,
    receipt_keyset_digest: receiptKeysetDigest(),
    channel_key_digest: CHANNEL_KEY_DIGEST,
    event_log: [
      { type: 'upstream.verified', result: 'verified', required: true, session_id: SESSION_ID },
    ],
    request_sha256: EVIDENCE.requestSha256,
    response_sha256: EVIDENCE.responseSha256,
    model: EVIDENCE.model,
    model_revision: EVIDENCE.modelRevision,
    nonce: EVIDENCE.nonce,
    route: '/v1',
    policy_generation: 1,
    sequence: 1,
    signer_key_id: 'receipt-key-1',
    algorithm: 'Ed25519' as const,
    ...overrides,
  };
}

function signedReceipt(overrides: Record<string, unknown> = {}) {
  const unsigned = verifiedReceipt(overrides);
  const signature = sign(null, Buffer.from(canonical(unsigned), 'utf8'), RECEIPT_PAIR.privateKey);
  return { ...unsigned, signature: signature.toString('base64') };
}

function responseBody(body: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    status: 200,
    arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer),
  };
}

function mockFetch(attestationBody: unknown, receiptBody: unknown | ((url: string) => unknown)) {
  return vi.fn((url: string) => {
    const body = url.includes('/aci/attestation')
      ? attestationBody
      : typeof receiptBody === 'function'
        ? receiptBody(url)
        : receiptBody;
    return Promise.resolve(responseBody(body));
  });
}

function unsignedConfig(fetchImpl: typeof fetch) {
  return {
    baseUrl: BASE_URL,
    fetchImpl,
    trustPolicy: trustPolicy(),
    testOnlyAllowUnsignedReceipts: true,
  };
}

describe('AciReceiptVerifier', () => {
  it('fails closed when a pinned transport is not supplied', () => {
    expect(
      () =>
        new AciReceiptVerifier({
          baseUrl: BASE_URL,
          trustPolicy: trustPolicy(),
          fetchImpl: undefined as never,
        }),
    ).toThrow(/pinned transport is required/);
  });

  it('rejects self-reported attestation JSON without a valid signature', async () => {
    const fetchImpl = mockFetch(unsignedAttestation(), verifiedReceipt());
    const verifier = new AciReceiptVerifier(unsignedConfig(fetchImpl));

    await expect(verifier.ensureAttested()).rejects.toThrow(/attestation response/);
  });

  it('rejects an attestation signed by a key absent from the offline policy', async () => {
    const foreign = generateKeyPairSync('ed25519');
    const unsigned = unsignedAttestation({ signer_key_id: 'foreign-attestation-key' });
    const signature = sign(
      null,
      Buffer.from(
        inferenceAttestationV1Payload({
          workloadId: unsigned.workload_id,
          workloadKeysetDigest: unsigned.workload_keyset_digest,
          channelKeyDigest: unsigned.channel_key_digest,
          quoteRootDigest: unsigned.quote_root_digest,
          workloadMeasurement: unsigned.workload_measurement,
          receiptKeysetDigest: unsigned.receipt_keyset_digest,
          trustPolicyGeneration: unsigned.policy_generation,
          route: unsigned.route,
          signerKeyId: unsigned.signer_key_id,
        }),
      ),
      foreign.privateKey,
    );
    const fetchImpl = mockFetch(
      { ...unsigned, signature: signature.toString('base64') },
      verifiedReceipt(),
    );
    const verifier = new AciReceiptVerifier(unsignedConfig(fetchImpl));

    await expect(verifier.ensureAttested()).rejects.toThrow(/not authorized/);
  });

  it('disables automatic redirects for attestation and receipt fetches', async () => {
    const fetchImpl = mockFetch(attestation(), verifiedReceipt());
    const verifier = new AciReceiptVerifier(unsignedConfig(fetchImpl));
    await verifier.ensureAttested();
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ redirect: 'error' }),
    );
  });

  it('ensureAttested pins the signed attestation and is memoized', async () => {
    const fetchImpl = mockFetch(attestation(), verifiedReceipt());
    const verifier = new AciReceiptVerifier(unsignedConfig(fetchImpl));
    await verifier.ensureAttested();
    await verifier.ensureAttested();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('accepts an exchange with an exact signed model revision', async () => {
    const fetchImpl = mockFetch(attestation(), verifiedReceipt());
    const verifier = new AciReceiptVerifier(unsignedConfig(fetchImpl));
    await expect(verifier.verifyReceipt('r-1', EVIDENCE)).resolves.toBeUndefined();
  });

  it('rejects a receipt from a different ACI channel', async () => {
    const fetchImpl = mockFetch(
      attestation(),
      verifiedReceipt({ channel_key_digest: 'f'.repeat(64) }),
    );
    const verifier = new AciReceiptVerifier(unsignedConfig(fetchImpl));

    await expect(verifier.verifyReceipt('r-1', EVIDENCE)).rejects.toThrow(
      /channel key digest mismatch/,
    );
  });

  it('rejects a receipt replayed with a non-increasing ACI sequence', async () => {
    const fetchImpl = mockFetch(attestation(), (url) =>
      verifiedReceipt({ sequence: url.endsWith('/r-1') ? 4 : 4 }),
    );
    const verifier = new AciReceiptVerifier(unsignedConfig(fetchImpl));

    await expect(verifier.verifyReceipt('r-1', EVIDENCE)).resolves.toBeUndefined();
    await expect(verifier.verifyReceipt('r-2', EVIDENCE)).rejects.toThrow(
      /receipt sequence replay/,
    );
  });

  it('accepts a strictly increasing ACI sequence on the pinned channel', async () => {
    const fetchImpl = mockFetch(attestation(), (url) =>
      verifiedReceipt({ sequence: url.endsWith('/r-1') ? 4 : 5 }),
    );
    const verifier = new AciReceiptVerifier(unsignedConfig(fetchImpl));

    await expect(verifier.verifyReceipt('r-1', EVIDENCE)).resolves.toBeUndefined();
    await expect(verifier.verifyReceipt('r-2', EVIDENCE)).resolves.toBeUndefined();
  });

  it('does not share sequence state across ACI sessions on the pinned channel', async () => {
    const fetchImpl = mockFetch(attestation(), (url) =>
      verifiedReceipt({
        sequence: 4,
        event_log: [
          {
            type: 'upstream.verified',
            result: 'verified',
            required: true,
            session_id: url.endsWith('/r-1') ? 'session-a' : 'session-b',
          },
        ],
      }),
    );
    const verifier = new AciReceiptVerifier(unsignedConfig(fetchImpl));

    await expect(verifier.verifyReceipt('r-1', EVIDENCE)).resolves.toBeUndefined();
    await expect(verifier.verifyReceipt('r-2', EVIDENCE)).resolves.toBeUndefined();
  });

  it('fails closed when bounded sequence state cannot admit another session', async () => {
    const fetchImpl = mockFetch(attestation(), (url) =>
      verifiedReceipt({
        event_log: [
          { type: 'upstream.verified', result: 'verified', required: true, session_id: url },
        ],
      }),
    );
    const verifier = new AciReceiptVerifier(unsignedConfig(fetchImpl));

    for (let index = 0; index < 256; index += 1) {
      await verifier.verifyReceipt(`receipt-${index}`, EVIDENCE);
    }

    await expect(verifier.verifyReceipt('receipt-256', EVIDENCE)).rejects.toThrow(
      /sequence state capacity exhausted/,
    );
  });

  it('rejects a receipt replayed against a different request, response, or revision', async () => {
    const fetchImpl = mockFetch(attestation(), verifiedReceipt());
    const verifier = new AciReceiptVerifier(unsignedConfig(fetchImpl));
    await expect(
      verifier.verifyReceipt('r-1', { ...EVIDENCE, requestSha256: 'c'.repeat(64) }),
    ).rejects.toThrow(/request digest mismatch/);

    const second = new AciReceiptVerifier(
      unsignedConfig(mockFetch(attestation(), verifiedReceipt())),
    );
    await expect(
      second.verifyReceipt('r-1', { ...EVIDENCE, modelRevision: 'revision-2' }),
    ).rejects.toThrow(/revision mismatch|not authorized/);
  });

  it('passes the verified upstream session id to the sink after receipt checks', async () => {
    const fetchImpl = mockFetch(attestation(), verifiedReceipt());
    const verifiedReceiptSink = vi.fn(async (sessionId: string) => {
      expect(sessionId).toBe(SESSION_ID);
    });
    const verifier = new AciReceiptVerifier({
      ...unsignedConfig(fetchImpl),
      verifiedReceiptSink,
    });

    await verifier.verifyReceipt('r-1', EVIDENCE);
    expect(verifiedReceiptSink).toHaveBeenCalledOnce();
  });

  it('rejects a failed upstream receipt', async () => {
    const failed = verifiedReceipt({
      event_log: [{ type: 'upstream.verified', result: 'failed', required: false }],
    });
    const fetchImpl = mockFetch(attestation(), failed);
    const verifier = new AciReceiptVerifier(unsignedConfig(fetchImpl));
    await expect(verifier.verifyReceipt('r-1', EVIDENCE)).rejects.toBeInstanceOf(
      InferenceAttestationError,
    );
  });

  it('rejects when the response carried no receipt id', async () => {
    const fetchImpl = mockFetch(attestation(), verifiedReceipt());
    const verifier = new AciReceiptVerifier(unsignedConfig(fetchImpl));
    await expect(verifier.verifyReceipt(null, EVIDENCE)).rejects.toThrow(/no receipt id/);
  });

  it('rejects a receipt whose workload does not match the pinned attestation', async () => {
    const wrong = verifiedReceipt({ workload_id: 'other-workload' });
    const fetchImpl = mockFetch(attestation(), wrong);
    const verifier = new AciReceiptVerifier(unsignedConfig(fetchImpl));
    await expect(verifier.verifyReceipt('r-1', EVIDENCE)).rejects.toThrow(/workload_id/);
  });

  it('per-call policy re-fetches the receipt on every call', async () => {
    const fetchImpl = mockFetch(attestation(), (url) =>
      verifiedReceipt({ sequence: url.endsWith('/r-1') ? 1 : 2 }),
    );
    const verifier = new AciReceiptVerifier({ ...unsignedConfig(fetchImpl), policy: 'per-call' });
    await verifier.verifyReceipt('r-1', EVIDENCE);
    await verifier.verifyReceipt('r-2', EVIDENCE);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('first-call policy verifies once then short-circuits', async () => {
    const fetchImpl = mockFetch(attestation(), verifiedReceipt());
    const verifier = new AciReceiptVerifier({ ...unsignedConfig(fetchImpl), policy: 'first-call' });
    await verifier.verifyReceipt('r-1', EVIDENCE);
    await verifier.verifyReceipt('r-2', EVIDENCE);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  describe('receipt signature enforcement', () => {
    it('accepts a receipt signed by the policy receipt key', async () => {
      const fetchImpl = mockFetch(attestation(), signedReceipt());
      const verifier = new AciReceiptVerifier({
        baseUrl: BASE_URL,
        fetchImpl,
        trustPolicy: trustPolicy(),
      });
      await expect(verifier.verifyReceipt('r-1', EVIDENCE)).resolves.toBeUndefined();
    });

    it('rejects a receipt signed by a foreign key', async () => {
      const foreign = generateKeyPairSync('ed25519');
      const unsigned = verifiedReceipt({ signer_key_id: 'foreign-receipt-key' });
      const signature = sign(null, Buffer.from(canonical(unsigned), 'utf8'), foreign.privateKey);
      const fetchImpl = mockFetch(attestation(), {
        ...unsigned,
        signature: signature.toString('base64'),
      });
      const verifier = new AciReceiptVerifier({
        baseUrl: BASE_URL,
        fetchImpl,
        trustPolicy: trustPolicy(),
      });
      await expect(verifier.verifyReceipt('r-1', EVIDENCE)).rejects.toThrow(/signer/);
    });

    it('rejects an unsigned receipt when signature enforcement is on', async () => {
      const fetchImpl = mockFetch(attestation(), verifiedReceipt());
      const verifier = new AciReceiptVerifier({
        baseUrl: BASE_URL,
        fetchImpl,
        trustPolicy: trustPolicy(),
      });
      await expect(verifier.verifyReceipt('r-1', EVIDENCE)).rejects.toThrow(/unsigned/);
    });
  });

  it('fails closed when the attestation endpoint errors', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve({ status: 503, arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) }),
    );
    const verifier = new AciReceiptVerifier(unsignedConfig(fetchImpl));
    await expect(verifier.ensureAttested()).rejects.toBeInstanceOf(InferenceAttestationError);
  });
});
