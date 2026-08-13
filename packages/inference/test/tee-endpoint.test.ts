// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeeEndpointBackend } from '../src/TeeEndpointBackend.js';

const BASE_URL = 'https://inference.example.com';
const POLICY = {
  version: 1 as const,
  generation: 4,
  origin: BASE_URL,
  route: '/v1',
  redirectOrigins: [],
  tlsSpkiSha256: ['a'.repeat(64)],
  workloadId: 'workload-1',
  quoteRootDigests: ['1'.repeat(64)],
  workloadMeasurements: ['2'.repeat(96)],
  attestationKeys: [
    { keyId: 'attestation-key-1', algorithm: 'Ed25519' as const, publicKey: 'A'.repeat(43) + '=' },
  ],
  receiptKeys: [
    { keyId: 'receipt-key-1', algorithm: 'Ed25519' as const, publicKey: 'B'.repeat(43) + '=' },
  ],
  permittedModels: [
    { model: 'provider/critique', revision: 'critique-1' },
    { model: 'provider/embed', revision: 'embed-1' },
    { model: 'provider/generate', revision: 'generate-1' },
    { model: 'provider/judge', revision: 'judge-1' },
  ],
  roleModels: {
    embed: { model: 'provider/embed', revision: 'embed-1' },
    generate: { model: 'provider/generate', revision: 'generate-1' },
    judge: { model: 'provider/judge', revision: 'judge-1' },
    critique: { model: 'provider/critique', revision: 'critique-1' },
  },
};

function passingVerifier() {
  return {
    ensureAttested: vi.fn().mockResolvedValue(undefined),
    verifyReceipt: vi.fn().mockResolvedValue(undefined),
  };
}

function response(bytes: Uint8Array, status = 200, receiptId = 'receipt-1') {
  return {
    status,
    ok: status >= 200 && status < 300,
    arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer),
    headers: { get: (name: string) => (name === 'x-receipt-id' ? receiptId : null) },
    body: null,
  };
}

function makeFetch(body: object, status = 200) {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return vi.fn().mockResolvedValue(response(bytes, status));
}

function makeBackend(verifier = passingVerifier()) {
  return {
    backend: new TeeEndpointBackend({
      baseUrl: BASE_URL,
      trustPolicy: POLICY,
      responseVerifier: verifier,
      fetchImpl: fetch,
    }),
    verifier,
  };
}

describe('TeeEndpointBackend', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', makeFetch({}));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('derives the embed model and exact revision from roleModels', async () => {
    const embedding = [0.1, 0.2, 0.3];
    vi.stubGlobal('fetch', makeFetch({ data: [{ embedding }] }));
    const { backend, verifier } = makeBackend();

    await expect(backend.embed('hello')).resolves.toEqual(embedding);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'provider/embed',
      model_revision: 'embed-1',
      input: 'hello',
    });
    expect((init.headers as Record<string, string>)['X-Folklore-Inference-Model-Revision']).toBe(
      'embed-1',
    );
    expect(verifier.verifyReceipt).toHaveBeenCalledWith(
      'receipt-1',
      expect.objectContaining({
        model: 'provider/embed',
        modelRevision: 'embed-1',
        modelRole: 'embed',
      }),
    );
  });

  it('rejects a parent-selected model or revision before sending content', async () => {
    const fetchSpy = makeFetch({ data: [{ embedding: [1] }] });
    vi.stubGlobal('fetch', fetchSpy);
    const { backend } = makeBackend();

    await expect(backend.embed('secret', { model: 'attacker/model' })).rejects.toThrow(
      /model override/,
    );
    await expect(
      backend.embed('secret', { modelRevision: 'uncommissioned-revision' }),
    ).rejects.toThrow(/revision override/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses the signed generate role and binds its revision', async () => {
    vi.stubGlobal('fetch', makeFetch({ choices: [{ message: { content: 'hello world' } }] }));
    const { backend } = makeBackend();
    await expect(backend.generate('Say hi')).resolves.toBe('hello world');
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'provider/generate',
      model_revision: 'generate-1',
      stream: false,
    });
  });

  it('uses the judge role for structured calls', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({
        choices: [{ message: { tool_calls: [{ function: { name: 'judge', arguments: '{}' } }] } }],
      }),
    );
    const { backend } = makeBackend();
    await backend.generateStructured('judge', {
      tool: { name: 'judge', description: 'judge', parameters: { type: 'object' } },
    });
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: 'provider/judge',
      model_revision: 'judge-1',
    });
  });

  it('includes Authorization header when apiKey is set', async () => {
    vi.stubGlobal('fetch', makeFetch({ data: [{ embedding: [1, 2] }] }));
    const verifier = passingVerifier();
    const backend = new TeeEndpointBackend({
      baseUrl: BASE_URL,
      trustPolicy: POLICY,
      responseVerifier: verifier,
      fetchImpl: fetch,
      apiKey: 'sk-test',
    });
    await backend.embed('hi');

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-test');
  });

  it('forwards embedDimensions as the dimensions request param', async () => {
    vi.stubGlobal('fetch', makeFetch({ data: [{ embedding: [1, 2, 3] }] }));
    const { backend } = makeBackend();
    const dimensional = new TeeEndpointBackend({
      baseUrl: BASE_URL,
      trustPolicy: POLICY,
      responseVerifier: passingVerifier(),
      embedDimensions: 3,
      fetchImpl: fetch,
    });
    await dimensional.embed('hi');
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string).dimensions).toBe(3);
    await backend.close();
  });

  it('throws on non-2xx response', async () => {
    vi.stubGlobal('fetch', makeFetch({}, 401));
    const { backend } = makeBackend();
    await expect(backend.embed('x')).rejects.toThrow('TEE endpoint embed failed: 401');
  });

  it('throws when response contains no embedding', async () => {
    vi.stubGlobal('fetch', makeFetch({ data: [] }));
    const { backend } = makeBackend();
    await expect(backend.embed('x')).rejects.toThrow('TEE endpoint returned no embedding');
  });

  it('hashes exact raw response bytes before parsing them', async () => {
    const raw = new TextEncoder().encode('{"choices":[{"message":{"content":"ok"}}]}\n');
    const verifier = passingVerifier();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(raw)));
    const { backend: rawBackend } = makeBackend(verifier);
    await expect(rawBackend.generate('p')).resolves.toBe('ok');
    expect(verifier.verifyReceipt).toHaveBeenCalledWith(
      'receipt-1',
      expect.objectContaining({
        responseSha256: createHash('sha256').update(raw).digest('hex'),
      }),
    );
  });

  it('does not yield stream content until receipt verification completes', async () => {
    let releaseVerification!: () => void;
    const verification = new Promise<void>((resolve) => {
      releaseVerification = resolve;
    });
    const verifier = {
      ensureAttested: vi.fn().mockResolvedValue(undefined),
      verifyReceipt: vi.fn().mockReturnValue(verification),
    };
    const streamBytes = new TextEncoder().encode(
      'data: {"choices":[{"delta":{"content":"secret"}}]}\n\ndata: [DONE]\n',
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        headers: { get: () => 'receipt-1' },
        body: {
          getReader: () => ({
            read: vi
              .fn()
              .mockResolvedValueOnce({ done: false, value: streamBytes })
              .mockResolvedValueOnce({ done: true, value: undefined }),
            releaseLock: vi.fn(),
          }),
        },
      }),
    );
    const { backend } = makeBackend(verifier);
    const iterator = backend.stream('p')[Symbol.asyncIterator]();
    const next = iterator.next();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(verifier.verifyReceipt).toHaveBeenCalledOnce();
    let settled = false;
    void next.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    releaseVerification();
    await expect(next).resolves.toEqual({ value: 'secret', done: false });
  });

  it('requires a verifier at construction', () => {
    expect(
      () =>
        new TeeEndpointBackend({
          baseUrl: BASE_URL,
          trustPolicy: POLICY,
          responseVerifier: undefined as never,
          fetchImpl: fetch,
        }),
    ).toThrow(/response verifier is required/);
  });

  it('rejects an endpoint that does not match the signed policy', () => {
    expect(
      () =>
        new TeeEndpointBackend({
          baseUrl: 'https://redirected.example.com/v1',
          trustPolicy: POLICY,
          responseVerifier: passingVerifier(),
          fetchImpl: fetch,
        }),
    ).toThrow(/offline trust policy/);
  });

  it('strips trailing slash from baseUrl', async () => {
    vi.stubGlobal('fetch', makeFetch({ choices: [{ message: { content: 'hi' } }] }));
    const trailing = new TeeEndpointBackend({
      baseUrl: `${BASE_URL}/`,
      trustPolicy: POLICY,
      responseVerifier: passingVerifier(),
      fetchImpl: fetch,
    });
    await trailing.generate('hi');
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe(`${BASE_URL}/v1/chat/completions`);
  });

  it('close() is a no-op for the stateless HTTP client', async () => {
    const { backend } = makeBackend();
    await expect(backend.close()).resolves.toBeUndefined();
  });
});
