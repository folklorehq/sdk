// SPDX-License-Identifier: Apache-2.0
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  inferenceReceiptV1Payload,
  inferenceReceiptV1Schema,
  inferenceTrustPolicyV1Schema,
} from '../src/inference-trust.js';

function receiptFixture(): Record<string, unknown> {
  return {
    version: 1,
    requestSha256: 'a'.repeat(64),
    responseSha256: 'b'.repeat(64),
    model: 'z-ai/glm-5.2',
    modelRevision: '2026-08-09',
    nonce: 'A'.repeat(43) + '=',
    channelKeyDigest: 'c'.repeat(64),
    workloadId: 'workload-1',
    route: '/v1/inference',
    trustPolicyGeneration: 2,
    sequence: 3,
    signerKeyId: 'receipt-key-1',
    algorithm: 'Ed25519',
    signature: 'A'.repeat(86) + '==',
  };
}

describe('inferenceTrustPolicyV1Schema', () => {
  it('requires offline-authorized TLS SPKI pins alongside attestation keys and role bindings', () => {
    expect(() =>
      inferenceTrustPolicyV1Schema.parse({
        version: 1,
        generation: 2,
        origin: 'https://inference.example',
        route: '/v1/inference',
        redirectOrigins: [],
        workloadId: 'workload-1',
        quoteRootDigests: ['a'.repeat(64)],
        workloadMeasurements: ['b'.repeat(96)],
        attestationKeys: [
          { keyId: 'attestation-key-1', algorithm: 'Ed25519', publicKey: 'A'.repeat(43) + '=' },
        ],
        receiptKeys: [
          { keyId: 'receipt-key-1', algorithm: 'Ed25519', publicKey: 'A'.repeat(43) + '=' },
        ],
        permittedModels: [{ model: 'z-ai/glm-5.2', revision: '2026-08-09' }],
        roleModels: {
          embed: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
          generate: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
          judge: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
          critique: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        },
      }),
    ).toThrow();
  });

  it('accepts only offline-pinned exact origins, routes, roots, measurements, keys, and models', () => {
    const policy = inferenceTrustPolicyV1Schema.parse({
      version: 1,
      generation: 2,
      origin: 'https://inference.example',
      route: '/v1/inference',
      redirectOrigins: ['https://backup.example'],
      tlsSpkiSha256: ['a'.repeat(64)],
      workloadId: 'workload-1',
      quoteRootDigests: ['a'.repeat(64)],
      workloadMeasurements: ['b'.repeat(96)],
      attestationKeys: [
        { keyId: 'attestation-key-1', algorithm: 'Ed25519', publicKey: 'A'.repeat(43) + '=' },
      ],
      receiptKeys: [
        { keyId: 'receipt-key-1', algorithm: 'Ed25519', publicKey: 'A'.repeat(43) + '=' },
      ],
      permittedModels: [{ model: 'z-ai/glm-5.2', revision: '2026-08-09' }],
      roleModels: {
        embed: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        generate: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        judge: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        critique: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
      },
    });

    expect(policy.origin).toBe('https://inference.example');
    expect(() =>
      inferenceTrustPolicyV1Schema.parse({ ...policy, origin: 'https://inference.example/path' }),
    ).toThrow();
    expect(() =>
      inferenceTrustPolicyV1Schema.parse({ ...policy, origin: 'https://user@inference.example' }),
    ).toThrow();
    expect(() =>
      inferenceTrustPolicyV1Schema.parse({ ...policy, route: 'https://inference.example/v1' }),
    ).toThrow();
    expect(() =>
      inferenceTrustPolicyV1Schema.parse({
        ...policy,
        redirectOrigins: ['https://z.example', 'https://a.example'],
      }),
    ).toThrow();
    expect(() =>
      inferenceTrustPolicyV1Schema.parse({
        ...policy,
        providerKeyUrl: 'https://provider.example/keys',
      }),
    ).toThrow();
    expect(
      inferenceTrustPolicyV1Schema.parse({
        ...policy,
        permittedModels: [
          { model: 'qwen/qwen3-32b', revision: '2026-08-09' },
          { model: 'qwen/qwen3-embedding-8b', revision: '2026-08-10' },
          { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        ],
      }).permittedModels,
    ).toHaveLength(3);
    for (const model of ['glm-5.2', 'z-ai/', '/glm-5.2', 'z-ai//glm-5.2', 'z-ai/glm\u00005.2']) {
      expect(() =>
        inferenceTrustPolicyV1Schema.parse({
          ...policy,
          permittedModels: [{ model, revision: '2026-08-09' }],
        }),
      ).toThrow();
    }
  });

  it('accepts only canonical non-empty route segments', () => {
    const policy = inferenceTrustPolicyV1Schema.parse({
      version: 1,
      generation: 2,
      origin: 'https://inference.example',
      route: '/v1/inference',
      redirectOrigins: [],
      tlsSpkiSha256: ['a'.repeat(64)],
      workloadId: 'workload-1',
      quoteRootDigests: ['a'.repeat(64)],
      workloadMeasurements: ['b'.repeat(96)],
      attestationKeys: [
        { keyId: 'attestation-key-1', algorithm: 'Ed25519', publicKey: 'A'.repeat(43) + '=' },
      ],
      receiptKeys: [
        { keyId: 'receipt-key-1', algorithm: 'Ed25519', publicKey: 'A'.repeat(43) + '=' },
      ],
      permittedModels: [{ model: 'z-ai/glm-5.2', revision: '2026-08-09' }],
      roleModels: {
        embed: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        generate: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        judge: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
        critique: { model: 'z-ai/glm-5.2', revision: '2026-08-09' },
      },
    });

    for (const route of ['/v1/inference', '/v1/chat/completions', '/v1/embeddings']) {
      expect(inferenceTrustPolicyV1Schema.parse({ ...policy, route }).route).toBe(route);
    }
    for (const route of [
      '/v1/%2f',
      '/v1/%2F',
      '/v1/%',
      '/v1/a%00b',
      '/v1/%2e',
      '/v1/%2E%2E',
      '/v1/.',
      '/v1/..',
      '/v1//a',
    ]) {
      expect(() => inferenceTrustPolicyV1Schema.parse({ ...policy, route })).toThrow();
    }
  });
});

describe('inferenceReceiptV1Schema', () => {
  it('canonically binds every exchange claim and the receipt signer to a real Ed25519 signature', () => {
    const { privateKey, publicKey } = generateKeyPairSync('ed25519');
    const publicKeyBytes = publicKey
      .export({ format: 'der', type: 'spki' })
      .subarray(-32)
      .toString('base64');
    const unsigned = inferenceReceiptV1Schema.parse({
      ...receiptFixture(),
      signerKeyId: 'receipt-key-1',
    });
    const signature = sign(
      null,
      Buffer.from(inferenceReceiptV1Payload(unsigned)),
      privateKey,
    ).toString('base64');
    const receipt = inferenceReceiptV1Schema.parse({ ...unsigned, signature });
    const payload = Buffer.from(inferenceReceiptV1Payload(receipt));

    expect(inferenceReceiptV1Payload(receipt)).toBe(
      `folklore.inference-receipt.v1\u00001\u0000${'a'.repeat(64)}\u0000${'b'.repeat(64)}\u0000z-ai/glm-5.2\u00002026-08-09\u0000${'A'.repeat(43)}=\u0000${'c'.repeat(64)}\u0000workload-1\u0000/v1/inference\u00002\u00003\u0000receipt-key-1\u0000Ed25519`,
    );
    expect(verify(null, payload, publicKey, Buffer.from(receipt.signature, 'base64'))).toBe(true);
    expect(publicKeyBytes).toHaveLength(44);

    const changes: ReadonlyArray<Record<string, unknown>> = [
      { ...receipt, requestSha256: 'd'.repeat(64) },
      { ...receipt, responseSha256: 'e'.repeat(64) },
      { ...receipt, model: 'qwen/qwen3-32b' },
      { ...receipt, modelRevision: '2026-08-10' },
      { ...receipt, nonce: 'B'.repeat(43) + '=' },
      { ...receipt, channelKeyDigest: 'f'.repeat(64) },
      { ...receipt, workloadId: 'workload-2' },
      { ...receipt, route: '/v1/other' },
      { ...receipt, trustPolicyGeneration: 4 },
      { ...receipt, sequence: 4 },
      { ...receipt, signerKeyId: 'receipt-key-2' },
    ];
    for (const changed of changes) {
      const changedPayload = Buffer.from(
        inferenceReceiptV1Payload(inferenceReceiptV1Schema.parse(changed)),
      );
      expect(
        verify(null, changedPayload, publicKey, Buffer.from(receipt.signature, 'base64')),
      ).toBe(false);
    }
    for (const field of Object.keys(receipt)) {
      expect(() =>
        inferenceReceiptV1Schema.parse(
          Object.fromEntries(Object.entries(receipt).filter(([key]) => key !== field)),
        ),
      ).toThrow();
    }
  });

  it('rejects malformed or content-bearing receipt claims', () => {
    const receipt = receiptFixture();
    expect(() =>
      inferenceReceiptV1Schema.parse({ ...receipt, requestSha256: 'A'.repeat(64) }),
    ).toThrow();
    expect(() => inferenceReceiptV1Schema.parse({ ...receipt, nonce: 'A'.repeat(44) })).toThrow();
    expect(() => inferenceReceiptV1Schema.parse({ ...receipt, model: 'm'.repeat(129) })).toThrow();
    expect(() => inferenceReceiptV1Schema.parse({ ...receipt, model: 'z-ai//glm-5.2' })).toThrow();
    expect(() => inferenceReceiptV1Schema.parse({ ...receipt, sequence: 0 })).toThrow();
    expect(() =>
      inferenceReceiptV1Schema.parse({ ...receipt, response: 'customer content' }),
    ).toThrow();
  });
});
