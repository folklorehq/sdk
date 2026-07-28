// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { createInferenceBackend } from '../src/factory.js';
import { StubInferenceBackend } from '../src/StubInferenceBackend.js';
import { OpenAICompatBackend } from '../src/OpenAICompatBackend.js';
import { TeeEndpointBackend } from '../src/TeeEndpointBackend.js';

describe('createInferenceBackend()', () => {
  it('throws when no mode is set (fail loud, no silent stub/local fallback)', () => {
    expect(() => createInferenceBackend({})).toThrow(/mode is not configured/);
  });

  it('returns the stub backend for the explicit "stub" mode', () => {
    expect(createInferenceBackend({ mode: 'stub' })).toBeInstanceOf(StubInferenceBackend);
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

  it('returns a TeeEndpointBackend for mode "phala-endpoint"', () => {
    const backend = createInferenceBackend({
      mode: 'phala-endpoint',
      teeEndpointUrl: 'https://api.phala.com/v1',
    });
    expect(backend).toBeInstanceOf(TeeEndpointBackend);
  });

  it('returns a TeeEndpointBackend for mode "folklore-tee"', () => {
    const backend = createInferenceBackend({
      mode: 'folklore-tee',
      teeEndpointUrl: 'https://inference.folklore.app/v1',
    });
    expect(backend).toBeInstanceOf(TeeEndpointBackend);
  });

  it('throws when a TEE mode is missing teeEndpointUrl', () => {
    expect(() => createInferenceBackend({ mode: 'phala-endpoint' })).toThrow(/teeEndpointUrl/);
  });

  it('all backends expose close()', async () => {
    const stub = createInferenceBackend({ mode: 'stub' });
    const tee = createInferenceBackend({
      mode: 'phala-endpoint',
      teeEndpointUrl: 'https://api.phala.com/v1',
    });
    await expect(stub.close()).resolves.toBeUndefined();
    await expect(tee.close()).resolves.toBeUndefined();
  });
});
