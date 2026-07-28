// SPDX-License-Identifier: Apache-2.0
import { generateKeyPairSync, sign as signEd25519 } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { AciReceiptVerifier, InferenceAttestationError } from '../src/aci-verifier.js';

const BASE_URL = 'https://inference.example.com';
const WORKLOAD_ID = 'wl-123';
const KEYSET_DIGEST = 'digest-abc';
const SESSION_ID = 'sess-42';

// Mirrors the verifier's private canonicalizer so the test can sign the exact bytes it verifies.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function ed25519RawPublicKeyHex(
  publicKey: ReturnType<typeof generateKeyPairSync>['publicKey'],
): string {
  const spki = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return spki.subarray(spki.length - 32).toString('hex');
}

const DUMMY_SIGNING_KEY = { algorithm: 'ed25519', public_key: '00'.repeat(32) };

function attestation(
  signingKeys: Array<{ algorithm: string; public_key: string }> = [DUMMY_SIGNING_KEY],
) {
  return {
    workload_id: WORKLOAD_ID,
    workload_keyset_digest: KEYSET_DIGEST,
    attestation: { workload_keyset: { receipt_signing_keys: signingKeys } },
  };
}

function verifiedReceipt(overrides: Record<string, unknown> = {}) {
  return {
    workload_id: WORKLOAD_ID,
    workload_keyset_digest: KEYSET_DIGEST,
    event_log: [
      { type: 'upstream.verified', result: 'verified', required: true, session_id: SESSION_ID },
    ],
    ...overrides,
  };
}

function mockFetch(attestationBody: unknown, receiptBody: unknown) {
  return vi.fn((url: string) => {
    const body = url.includes('/aci/attestation') ? attestationBody : receiptBody;
    return Promise.resolve({ status: 200, json: () => Promise.resolve(body) });
  });
}

describe('AciReceiptVerifier', () => {
  it('ensureAttested pins the attestation and is memoized', async () => {
    const fetchImpl = mockFetch(attestation(), verifiedReceipt());
    const verifier = new AciReceiptVerifier({ baseUrl: BASE_URL, fetchImpl });
    await verifier.ensureAttested();
    await verifier.ensureAttested();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('accepts a verified receipt', async () => {
    const fetchImpl = mockFetch(attestation(), verifiedReceipt());
    const verifier = new AciReceiptVerifier({ baseUrl: BASE_URL, fetchImpl });
    await expect(verifier.verifyReceipt('r-1')).resolves.toBeUndefined();
  });

  it('rejects a failed upstream receipt', async () => {
    const failed = verifiedReceipt({
      event_log: [{ type: 'upstream.verified', result: 'failed', required: false }],
    });
    const fetchImpl = mockFetch(attestation(), failed);
    const verifier = new AciReceiptVerifier({ baseUrl: BASE_URL, fetchImpl });
    await expect(verifier.verifyReceipt('r-1')).rejects.toBeInstanceOf(InferenceAttestationError);
  });

  it('rejects when the response carried no receipt id', async () => {
    const fetchImpl = mockFetch(attestation(), verifiedReceipt());
    const verifier = new AciReceiptVerifier({ baseUrl: BASE_URL, fetchImpl });
    await expect(verifier.verifyReceipt(null)).rejects.toThrow(/no receipt id/);
  });

  it('rejects a receipt whose workload does not match the pinned attestation', async () => {
    const wrong = verifiedReceipt({ workload_id: 'other-workload' });
    const fetchImpl = mockFetch(attestation(), wrong);
    const verifier = new AciReceiptVerifier({ baseUrl: BASE_URL, fetchImpl });
    await expect(verifier.verifyReceipt('r-1')).rejects.toThrow(/workload_id/);
  });

  it('per-call policy re-fetches the receipt on every call', async () => {
    const fetchImpl = mockFetch(attestation(), verifiedReceipt());
    const verifier = new AciReceiptVerifier({ baseUrl: BASE_URL, fetchImpl, policy: 'per-call' });
    await verifier.verifyReceipt('r-1');
    await verifier.verifyReceipt('r-2');
    expect(fetchImpl).toHaveBeenCalledTimes(3); // 1 attestation + 2 receipts
  });

  it('first-call policy verifies once then short-circuits', async () => {
    const fetchImpl = mockFetch(attestation(), verifiedReceipt());
    const verifier = new AciReceiptVerifier({ baseUrl: BASE_URL, fetchImpl });
    await verifier.verifyReceipt('r-1');
    await verifier.verifyReceipt('r-2');
    expect(fetchImpl).toHaveBeenCalledTimes(2); // 1 attestation + 1 receipt
  });

  describe('signature enforcement', () => {
    it('accepts a receipt signed by an attested key', async () => {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      const receipt = verifiedReceipt();
      const signature = signEd25519(null, Buffer.from(canonical(receipt), 'utf8'), privateKey);
      const signed = { ...receipt, signature: signature.toString('hex') };
      const keyset = [{ algorithm: 'ed25519', public_key: ed25519RawPublicKeyHex(publicKey) }];

      const fetchImpl = mockFetch(attestation(keyset), signed);
      const verifier = new AciReceiptVerifier({
        baseUrl: BASE_URL,
        fetchImpl,
        enforceReceiptSignature: true,
      });
      await expect(verifier.verifyReceipt('r-1')).resolves.toBeUndefined();
    });

    it('rejects a receipt whose signature does not match an attested key', async () => {
      const { publicKey, privateKey } = generateKeyPairSync('ed25519');
      const receipt = verifiedReceipt();
      const signature = signEd25519(null, Buffer.from(canonical(receipt), 'utf8'), privateKey);
      const tampered = Buffer.from(signature);
      tampered[0] ^= 0xff;
      const signed = { ...receipt, signature: tampered.toString('hex') };
      const keyset = [{ algorithm: 'ed25519', public_key: ed25519RawPublicKeyHex(publicKey) }];

      const fetchImpl = mockFetch(attestation(keyset), signed);
      const verifier = new AciReceiptVerifier({
        baseUrl: BASE_URL,
        fetchImpl,
        enforceReceiptSignature: true,
      });
      await expect(verifier.verifyReceipt('r-1')).rejects.toThrow(/signature/);
    });

    it('rejects an unsigned receipt when signature enforcement is on', async () => {
      const fetchImpl = mockFetch(attestation(), verifiedReceipt());
      const verifier = new AciReceiptVerifier({
        baseUrl: BASE_URL,
        fetchImpl,
        enforceReceiptSignature: true,
      });
      await expect(verifier.verifyReceipt('r-1')).rejects.toThrow(/unsigned/);
    });
  });

  it('fails closed when the attestation endpoint errors', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve({ status: 503, json: () => Promise.resolve({}) }),
    );
    const verifier = new AciReceiptVerifier({ baseUrl: BASE_URL, fetchImpl });
    await expect(verifier.ensureAttested()).rejects.toBeInstanceOf(InferenceAttestationError);
  });
});
