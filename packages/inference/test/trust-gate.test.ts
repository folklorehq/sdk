// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { AciReceiptVerifier } from '../src/aci-verifier.js';
import { TeeEndpointBackend, type TeeEndpointConfig } from '../src/TeeEndpointBackend.js';
import {
  FIXTURE_ATTESTATION,
  FIXTURE_KEYSET_DIGEST,
  FIXTURE_NOW,
  FIXTURE_WORKLOAD_ID,
  signedReceipt,
} from './fixtures/signed-aci-receipt.js';

function fetchFor(receipt: Record<string, unknown>) {
  return vi.fn((url: string) =>
    Promise.resolve({
      status: 200,
      json: () => Promise.resolve(url.includes('/attestation') ? FIXTURE_ATTESTATION : receipt),
    }),
  );
}

function verifier(receipt: Record<string, unknown>): AciReceiptVerifier {
  return new AciReceiptVerifier({
    baseUrl: 'https://inference.example.com/v1',
    expectedHost: 'inference.example.com',
    expectedWorkloadId: FIXTURE_WORKLOAD_ID,
    expectedKeysetDigest: FIXTURE_KEYSET_DIGEST,
    now: () => FIXTURE_NOW,
    fetchImpl: fetchFor(receipt),
  });
}

describe('ACI trust gate pins', () => {
  it('requires a response verifier by default at the TEE boundary', () => {
    expect(
      () =>
        new TeeEndpointBackend({
          baseUrl: 'https://inference.example.com/v1',
        } as TeeEndpointConfig),
    ).toThrow(/response verifier/);
  });

  it('rejects configured models outside the verified allowlist at construction', () => {
    expect(
      () =>
        new TeeEndpointBackend({
          baseUrl: 'https://inference.example.com/v1',
          generateModel: 'routed/model',
        } as TeeEndpointConfig),
    ).toThrow(/allowlist/);
  });

  it('rejects an endpoint whose host is not the configured pin', () => {
    expect(
      () =>
        new AciReceiptVerifier({
          baseUrl: 'https://redirected.example.com/v1',
          expectedHost: 'inference.example.com',
        }),
    ).toThrow(/host/);
  });

  it('rejects a plaintext endpoint even when its host matches the configured pin', () => {
    expect(
      () =>
        new AciReceiptVerifier({
          baseUrl: 'http://inference.example.com/v1',
          expectedHost: 'inference.example.com',
        }),
    ).toThrow(/https/);
  });

  it('rejects an attestation that does not match the configured workload and keyset', async () => {
    const verifier = new AciReceiptVerifier({
      baseUrl: 'https://inference.example.com/v1',
      expectedHost: 'inference.example.com',
      expectedWorkloadId: 'workload-b',
      expectedKeysetDigest: FIXTURE_KEYSET_DIGEST,
      fetchImpl: fetchFor({}),
    });

    await expect(verifier.ensureAttested()).rejects.toThrow(/configured pin/);
  });

  it('rejects an expired receipt', async () => {
    const receiptVerifier = verifier(signedReceipt({ expires_at: '2026-08-09T11:59:59.000Z' }));

    await expect(receiptVerifier.verifyReceipt('r-1')).rejects.toThrow(/expired/);
  });

  it('rejects an unsigned receipt without an opt-in enforcement flag', async () => {
    const { signature: _signature, ...unsigned } = signedReceipt();

    await expect(verifier(unsigned).verifyReceipt('r-1')).rejects.toThrow(/unsigned/);
  });

  it('rejects a receipt signed by a key outside the pinned keyset', async () => {
    await expect(
      verifier(signedReceipt({ key_id: 'fabricated-key' })).verifyReceipt('r-1'),
    ).rejects.toThrow(/signing key/);
  });

  it('rejects fabricated workload, keyset, and upstream verification fields', async () => {
    for (const receipt of [
      signedReceipt({ workload_id: 'fabricated-workload' }),
      signedReceipt({ workload_keyset_digest: `sha256:${'f'.repeat(64)}` }),
      signedReceipt({ event_log: [] }),
    ]) {
      await expect(verifier(receipt).verifyReceipt('r-1')).rejects.toThrow(
        /attestation|receipt|upstream/,
      );
    }
  });

  it('accepts a valid signed, unexpired receipt from the pinned workload and keyset', async () => {
    await expect(verifier(signedReceipt()).verifyReceipt('r-1')).resolves.toBeUndefined();
  });
});
