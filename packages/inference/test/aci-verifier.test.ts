// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { AciReceiptVerifier, InferenceAttestationError } from '../src/aci-verifier.js';
import {
  FIXTURE_ATTESTATION,
  FIXTURE_KEYSET_DIGEST,
  FIXTURE_NOW,
  FIXTURE_WORKLOAD_ID,
  signedReceipt,
} from './fixtures/signed-aci-receipt.js';

const BASE_URL = 'https://inference.example.com';

function mockFetch(attestationBody: unknown, receiptBody: unknown) {
  return vi.fn((url: string) => {
    const body = url.includes('/aci/attestation') ? attestationBody : receiptBody;
    return Promise.resolve({ status: 200, json: () => Promise.resolve(body) });
  });
}

function verifier(fetchImpl: typeof fetch): AciReceiptVerifier {
  return new AciReceiptVerifier({
    baseUrl: BASE_URL,
    expectedHost: 'inference.example.com',
    expectedWorkloadId: FIXTURE_WORKLOAD_ID,
    expectedKeysetDigest: FIXTURE_KEYSET_DIGEST,
    now: () => FIXTURE_NOW,
    fetchImpl,
  });
}

describe('AciReceiptVerifier', () => {
  it('pins the signed keyset once but verifies every response receipt', async () => {
    const fetchImpl = mockFetch(FIXTURE_ATTESTATION, signedReceipt());
    const receiptVerifier = verifier(fetchImpl as unknown as typeof fetch);

    await receiptVerifier.ensureAttested();
    await receiptVerifier.verifyReceipt('r-1');
    await receiptVerifier.verifyReceipt('r-2');

    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('rejects when the response carried no receipt id', async () => {
    const fetchImpl = mockFetch(FIXTURE_ATTESTATION, signedReceipt());

    await expect(
      verifier(fetchImpl as unknown as typeof fetch).verifyReceipt(null),
    ).rejects.toThrow(/no receipt id/);
  });

  it('rejects a tampered signature', async () => {
    const receipt = signedReceipt();
    receipt.signature = `00${String(receipt.signature).slice(2)}`;
    const fetchImpl = mockFetch(FIXTURE_ATTESTATION, receipt);

    await expect(
      verifier(fetchImpl as unknown as typeof fetch).verifyReceipt('r-1'),
    ).rejects.toThrow(/signature/);
  });

  it('fails closed when the attestation endpoint errors', async () => {
    const fetchImpl = vi.fn(() =>
      Promise.resolve({ status: 503, json: () => Promise.resolve({}) }),
    );

    await expect(
      verifier(fetchImpl as unknown as typeof fetch).ensureAttested(),
    ).rejects.toBeInstanceOf(InferenceAttestationError);
  });
});
