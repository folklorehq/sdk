// SPDX-License-Identifier: Apache-2.0
import type { InferenceTrustPolicyV1 } from '@folklore/contracts';
import { describe, expect, it } from 'vitest';
import { createInferenceBackend } from '../src/factory.js';
import { OpenAICompatBackend } from '../src/OpenAICompatBackend.js';
import { StubInferenceBackend } from '../src/StubInferenceBackend.js';
import { TeeEndpointBackend } from '../src/TeeEndpointBackend.js';

const TEST_POLICY: InferenceTrustPolicyV1 = {
  version: 1,
  generation: 1,
  origin: 'https://api.phala.com',
  route: '/v1',
  redirectOrigins: [],
  tlsSpkiSha256: ['a'.repeat(64)],
  workloadId: 'workload-1',
  quoteRootDigests: ['b'.repeat(64)],
  workloadMeasurements: ['c'.repeat(96)],
  attestationKeys: [
    { keyId: 'attestation-key-1', algorithm: 'Ed25519', publicKey: `${'A'.repeat(43)}=` },
  ],
  receiptKeys: [{ keyId: 'receipt-key-1', algorithm: 'Ed25519', publicKey: `${'B'.repeat(43)}=` }],
  permittedModels: [{ model: 'provider/model', revision: 'revision-1' }],
  roleModels: {
    embed: { model: 'provider/model', revision: 'revision-1' },
    generate: { model: 'provider/model', revision: 'revision-1' },
    judge: { model: 'provider/model', revision: 'revision-1' },
    critique: { model: 'provider/model', revision: 'revision-1' },
  },
};

function secureTeeConfig() {
  return {
    mode: 'phala-endpoint' as const,
    teeEndpointUrl: 'https://api.phala.com/v1',
    inferenceTrustPolicy: TEST_POLICY,
    fetchImpl: fetch,
  };
}

describe('createInferenceBackend()', () => {
  it('throws when no mode is set (fail loud, no silent stub/local fallback)', () => {
    expect(() => createInferenceBackend({})).toThrow(/mode is not configured/);
  });

  it('returns the stub backend for the explicit "stub" mode', () => {
    expect(createInferenceBackend({ mode: 'stub' })).toBeInstanceOf(StubInferenceBackend);
  });

  it('fails closed for the worker enclave-only mode', () => {
    expect(() => createInferenceBackend({ mode: 'disabled' })).toThrow(/enclave-only/);
  });

  it('returns an OpenAICompatBackend for mode "local-openai"', () => {
    const backend = createInferenceBackend({
      mode: 'local-openai',
      openaiBaseUrl: 'http://vllm:8000/v1',
    });
    expect(backend).toBeInstanceOf(OpenAICompatBackend);
  });

  it('throws when "local-openai" is missing openaiBaseUrl', () => {
    expect(() => createInferenceBackend({ mode: 'local-openai' })).toThrow(/openaiBaseUrl/);
  });

  it('returns a secure TeeEndpointBackend for each TEE mode', () => {
    expect(createInferenceBackend(secureTeeConfig())).toBeInstanceOf(TeeEndpointBackend);
    expect(createInferenceBackend({ ...secureTeeConfig(), mode: 'folklore-tee' })).toBeInstanceOf(
      TeeEndpointBackend,
    );
  });

  it('fails closed when a TEE verifier or signed policy is absent', () => {
    expect(() =>
      createInferenceBackend({
        mode: 'phala-endpoint',
        teeEndpointUrl: 'https://api.phala.com/v1',
      }),
    ).toThrow(/commissioning prerequisite|verifier|trust policy/i);
  });

  it('throws when a TEE mode is missing teeEndpointUrl', () => {
    expect(() => createInferenceBackend({ mode: 'phala-endpoint' })).toThrow(/teeEndpointUrl/);
  });

  it('does not allow task routing to override signed TEE role models', () => {
    expect(() =>
      createInferenceBackend({ ...secureTeeConfig(), taskModels: { synthesis: 'provider/other' } }),
    ).toThrow(/signed roleModels policy/);
  });

  it('all backends expose close()', async () => {
    const stub = createInferenceBackend({ mode: 'stub' });
    const tee = createInferenceBackend(secureTeeConfig());
    await expect(stub.close()).resolves.toBeUndefined();
    await expect(tee.close()).resolves.toBeUndefined();
  });
});
