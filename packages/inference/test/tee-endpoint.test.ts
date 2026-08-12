// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeeEndpointBackend } from '../src/TeeEndpointBackend.js';

const BASE_URL = 'https://inference.example.com';
const VERIFIED = {
  ensureAttested: async () => undefined,
  verifyReceipt: async () => undefined,
};

function makeFetch(response: object, status = 200) {
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(response),
    body: null,
  });
}

describe('TeeEndpointBackend', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', makeFetch({}));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('embed()', () => {
    it('calls /v1/embeddings with correct body and returns vector', async () => {
      const embedding = [0.1, 0.2, 0.3];
      vi.stubGlobal('fetch', makeFetch({ data: [{ embedding }] }));

      const backend = new TeeEndpointBackend({ baseUrl: BASE_URL, responseVerifier: VERIFIED });
      const result = await backend.embed('hello');

      expect(result).toEqual(embedding);
      const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(url).toBe(`${BASE_URL}/v1/embeddings`);
      expect(JSON.parse(init.body as string)).toMatchObject({
        model: 'qwen/qwen3-embedding-8b',
        input: 'hello',
      });
    });

    it('includes Authorization header when apiKey is set', async () => {
      vi.stubGlobal('fetch', makeFetch({ data: [{ embedding: [1, 2] }] }));

      const backend = new TeeEndpointBackend({
        baseUrl: BASE_URL,
        responseVerifier: VERIFIED,
        apiKey: 'sk-test',
      });
      await backend.embed('hi');

      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-test');
    });

    it('forwards embedDimensions as the dimensions request param', async () => {
      vi.stubGlobal('fetch', makeFetch({ data: [{ embedding: [1, 2, 3] }] }));

      const backend = new TeeEndpointBackend({
        baseUrl: BASE_URL,
        responseVerifier: VERIFIED,
        embedDimensions: 3,
      });
      await backend.embed('hi');

      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string).dimensions).toBe(3);
    });

    it('uses options.model when provided (and it is on the allowlist)', async () => {
      vi.stubGlobal('fetch', makeFetch({ data: [{ embedding: [1] }] }));

      const backend = new TeeEndpointBackend({ baseUrl: BASE_URL, responseVerifier: VERIFIED });
      await backend.embed('text', { model: 'qwen/qwen3-32b' });

      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      expect(JSON.parse(init.body as string).model).toBe('qwen/qwen3-32b');
    });

    it('throws on non-2xx response', async () => {
      vi.stubGlobal('fetch', makeFetch({}, 401));

      const backend = new TeeEndpointBackend({ baseUrl: BASE_URL, responseVerifier: VERIFIED });
      await expect(backend.embed('x')).rejects.toThrow('TEE endpoint embed failed: 401');
    });

    it('throws when response contains no embedding', async () => {
      vi.stubGlobal('fetch', makeFetch({ data: [] }));

      const backend = new TeeEndpointBackend({ baseUrl: BASE_URL, responseVerifier: VERIFIED });
      await expect(backend.embed('x')).rejects.toThrow('TEE endpoint returned no embedding');
    });
  });

  describe('generate()', () => {
    it('calls /v1/chat/completions and returns content', async () => {
      vi.stubGlobal('fetch', makeFetch({ choices: [{ message: { content: 'hello world' } }] }));

      const backend = new TeeEndpointBackend({ baseUrl: BASE_URL, responseVerifier: VERIFIED });
      const result = await backend.generate('Say hi');

      expect(result).toBe('hello world');
      const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [
        string,
        RequestInit,
      ];
      expect(url).toBe(`${BASE_URL}/v1/chat/completions`);
      expect(JSON.parse(init.body as string)).toMatchObject({
        model: 'z-ai/glm-5.2',
        stream: false,
      });
    });

    it('prepends system message when systemPrompt is set', async () => {
      vi.stubGlobal('fetch', makeFetch({ choices: [{ message: { content: 'ok' } }] }));

      const backend = new TeeEndpointBackend({ baseUrl: BASE_URL, responseVerifier: VERIFIED });
      await backend.generate('prompt', { systemPrompt: 'Be concise.' });

      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      const { messages } = JSON.parse(init.body as string);
      expect(messages[0]).toEqual({ role: 'system', content: 'Be concise.' });
      expect(messages[1]).toEqual({ role: 'user', content: 'prompt' });
    });

    it('passes maxTokens and temperature when provided', async () => {
      vi.stubGlobal('fetch', makeFetch({ choices: [{ message: { content: 'x' } }] }));

      const backend = new TeeEndpointBackend({ baseUrl: BASE_URL, responseVerifier: VERIFIED });
      await backend.generate('p', { maxTokens: 100, temperature: 0.5 });

      const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string);
      expect(body.max_tokens).toBe(100);
      expect(body.temperature).toBe(0.5);
    });

    it('throws on non-2xx response', async () => {
      vi.stubGlobal('fetch', makeFetch({}, 500));

      const backend = new TeeEndpointBackend({ baseUrl: BASE_URL, responseVerifier: VERIFIED });
      await expect(backend.generate('x')).rejects.toThrow('TEE endpoint generate failed: 500');
    });

    it('strips trailing slash from baseUrl', async () => {
      vi.stubGlobal('fetch', makeFetch({ choices: [{ message: { content: 'hi' } }] }));

      const backend = new TeeEndpointBackend({
        baseUrl: `${BASE_URL}/`,
        responseVerifier: VERIFIED,
      });
      await backend.generate('hi');

      const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
      expect(url).toBe(`${BASE_URL}/v1/chat/completions`);
    });
  });

  describe('verified-model allowlist (fail-closed)', () => {
    it('rejects an off-allowlist generate model before sending any request', async () => {
      const fetchSpy = makeFetch({ choices: [{ message: { content: 'x' } }] });
      vi.stubGlobal('fetch', fetchSpy);

      const backend = new TeeEndpointBackend({ baseUrl: BASE_URL, responseVerifier: VERIFIED });
      await expect(backend.generate('p', { model: 'qwen/qwen3.7-max' })).rejects.toThrow(
        /not in the verified-model allowlist/,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects an off-allowlist embed model before sending any request', async () => {
      const fetchSpy = makeFetch({ data: [{ embedding: [1] }] });
      vi.stubGlobal('fetch', fetchSpy);

      const backend = new TeeEndpointBackend({ baseUrl: BASE_URL, responseVerifier: VERIFIED });
      await expect(backend.embed('x', { model: 'unverified/model' })).rejects.toThrow(
        /not in the verified-model allowlist/,
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('allows the default verified models', async () => {
      vi.stubGlobal('fetch', makeFetch({ choices: [{ message: { content: 'ok' } }] }));
      const backend = new TeeEndpointBackend({ baseUrl: BASE_URL, responseVerifier: VERIFIED });
      await expect(backend.generate('p')).resolves.toBe('ok');
    });

    it('honors an explicit allowlist override', async () => {
      const fetchSpy = makeFetch({ choices: [{ message: { content: 'ok' } }] });
      vi.stubGlobal('fetch', fetchSpy);
      const backend = new TeeEndpointBackend({
        baseUrl: BASE_URL,
        responseVerifier: VERIFIED,
        embedModel: 'only/allowed',
        generateModel: 'only/allowed',
        modelAllowlist: ['only/allowed'],
      });
      await expect(backend.generate('p', { model: 'z-ai/glm-5.2' })).rejects.toThrow(
        /not in the verified-model allowlist/,
      );
      await expect(backend.generate('p', { model: 'only/allowed' })).resolves.toBe('ok');
    });
  });

  describe('response verifier', () => {
    it('does not return content when the receipt verifier rejects', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 200,
          json: () => Promise.resolve({ choices: [{ message: { content: 'secret' } }] }),
          headers: { get: () => 'receipt-1' },
        }),
      );
      const verifier = {
        ensureAttested: vi.fn().mockResolvedValue(undefined),
        verifyReceipt: vi.fn().mockRejectedValue(new Error('unverified upstream')),
      };
      const backend = new TeeEndpointBackend({ baseUrl: BASE_URL, responseVerifier: verifier });
      await expect(backend.generate('p')).rejects.toThrow(/unverified upstream/);
      expect(verifier.ensureAttested).toHaveBeenCalled();
      expect(verifier.verifyReceipt).toHaveBeenCalledWith('receipt-1');
    });

    it('returns content when the receipt verifier passes', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 200,
          json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }),
          headers: { get: () => 'receipt-2' },
        }),
      );
      const verifier = {
        ensureAttested: vi.fn().mockResolvedValue(undefined),
        verifyReceipt: vi.fn().mockResolvedValue(undefined),
      };
      const backend = new TeeEndpointBackend({ baseUrl: BASE_URL, responseVerifier: verifier });
      await expect(backend.generate('p')).resolves.toBe('ok');
    });
  });

  describe('close()', () => {
    it('is a no-op (stateless HTTP client)', async () => {
      const backend = new TeeEndpointBackend({ baseUrl: BASE_URL, responseVerifier: VERIFIED });
      await expect(backend.close()).resolves.toBeUndefined();
    });
  });
});
