// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { AciReceiptVerifier } from '../src/aci-verifier.js';
import { TeeEndpointBackend, type TeeEndpointConfig } from '../src/TeeEndpointBackend.js';

const ORIGIN = 'https://inference.example.com';
const MODEL = { model: 'provider/model', revision: 'revision-1' };

function trustPolicy() {
  return {
    version: 1 as const,
    generation: 1,
    origin: ORIGIN,
    route: '/v1',
    redirectOrigins: [],
    tlsSpkiSha256: ['a'.repeat(64)],
    workloadId: 'workload-1',
    quoteRootDigests: ['b'.repeat(64)],
    workloadMeasurements: ['c'.repeat(96)],
    attestationKeys: [
      {
        keyId: 'attestation-key-1',
        algorithm: 'Ed25519' as const,
        publicKey: Buffer.alloc(32, 1).toString('base64'),
      },
    ],
    receiptKeys: [
      {
        keyId: 'receipt-key-1',
        algorithm: 'Ed25519' as const,
        publicKey: Buffer.alloc(32, 2).toString('base64'),
      },
    ],
    permittedModels: [MODEL],
    roleModels: { embed: MODEL, generate: MODEL, judge: MODEL, critique: MODEL },
  };
}

function verifier(overrides: Record<string, unknown> = {}): AciReceiptVerifier {
  return new AciReceiptVerifier({
    baseUrl: `${ORIGIN}/v1`,
    trustPolicy: { ...trustPolicy(), ...overrides },
    fetchImpl: vi.fn(),
  });
}

describe('ACI trust gate pins', () => {
  it('requires a response verifier by default at the TEE boundary', () => {
    expect(
      () =>
        new TeeEndpointBackend({
          baseUrl: `${ORIGIN}/v1`,
          trustPolicy: trustPolicy(),
          responseVerifier: undefined as never,
          fetchImpl: fetch,
        }),
    ).toThrow(/response verifier/);
  });

  it('rejects configured models outside the verified allowlist at construction', () => {
    expect(
      () =>
        new TeeEndpointBackend({
          baseUrl: `${ORIGIN}/v1`,
          trustPolicy: {
            ...trustPolicy(),
            roleModels: {
              ...trustPolicy().roleModels,
              generate: { model: 'routed/model', revision: 'revision-1' },
            },
          },
          responseVerifier: {
            ensureAttested: async () => undefined,
            verifyReceipt: async () => undefined,
          },
          fetchImpl: fetch,
        } as TeeEndpointConfig),
    ).toThrow();
  });

  it('rejects an endpoint whose origin is not the signed policy origin', () => {
    expect(
      () =>
        new AciReceiptVerifier({
          baseUrl: 'https://redirected.example.com/v1',
          trustPolicy: trustPolicy(),
          fetchImpl: vi.fn(),
        }),
    ).toThrow(/offline trust policy/);
  });

  it('rejects a plaintext signed policy origin', () => {
    expect(() => verifier({ origin: 'http://inference.example.com' })).toThrow();
  });

  it('rejects an empty TLS pin set', () => {
    expect(() => verifier({ tlsSpkiSha256: [] })).toThrow();
  });

  it('rejects an empty workload measurement set', () => {
    expect(() => verifier({ workloadMeasurements: [] })).toThrow();
  });

  it('rejects an empty attestation keyset', () => {
    expect(() => verifier({ attestationKeys: [] })).toThrow();
  });

  it('rejects an empty receipt keyset', () => {
    expect(() => verifier({ receiptKeys: [] })).toThrow();
  });

  it('rejects role models outside the permitted model set', () => {
    expect(() =>
      verifier({
        roleModels: {
          ...trustPolicy().roleModels,
          generate: { model: 'fabricated/model', revision: 'revision-1' },
        },
      }),
    ).toThrow();
  });

  it('accepts a complete signed trust policy at the verifier boundary', () => {
    expect(() => verifier()).not.toThrow();
  });
});
