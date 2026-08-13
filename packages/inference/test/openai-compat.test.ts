// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAICompatBackend } from '../src/OpenAICompatBackend.js';

const BASE_URL = 'http://vllm:8000';

function makeFetch(response: object, status = 200) {
  const bytes = new TextEncoder().encode(JSON.stringify(response));
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer),
    body: null,
  });
}

function jsonResponse(body: object): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

describe('OpenAICompatBackend', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', makeFetch({}));
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('calls /v1/embeddings and returns the vector', async () => {
    const embedding = [0.1, 0.2, 0.3];
    vi.stubGlobal('fetch', makeFetch({ data: [{ embedding }] }));

    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL });
    const result = await backend.embed('hello');

    expect(result).toEqual(embedding);
    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe(`${BASE_URL}/v1/embeddings`);
  });

  it('omits the dimensions param when embedDimensions is unset', async () => {
    vi.stubGlobal('fetch', makeFetch({ data: [{ embedding: [0.1, 0.2] }] }));
    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL });
    await backend.embed('hi');
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect('dimensions' in body).toBe(false);
  });

  it('sends the dimensions param and accepts a matching-length embedding', async () => {
    const embedding = [0.1, 0.2, 0.3, 0.4];
    vi.stubGlobal('fetch', makeFetch({ data: [{ embedding }] }));
    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL, embedDimensions: 4 });
    const result = await backend.embed('hi');
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.dimensions).toBe(4);
    expect(result).toHaveLength(4);
  });

  it('rejects an embedding whose length differs from embedDimensions', async () => {
    vi.stubGlobal('fetch', makeFetch({ data: [{ embedding: [0.1, 0.2, 0.3] }] }));
    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL, embedDimensions: 4096 });
    await expect(backend.embed('hi')).rejects.toThrow('returned 3-dim embedding, expected 4096');
  });

  it('strips a trailing /v1 from baseUrl so paths are not doubled', async () => {
    vi.stubGlobal('fetch', makeFetch({ choices: [{ message: { content: 'hi' } }] }));

    const backend = new OpenAICompatBackend({ baseUrl: `${BASE_URL}/v1` });
    await backend.generate('hi');

    const [url] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string];
    expect(url).toBe(`${BASE_URL}/v1/chat/completions`);
  });

  it('uses configured generate model and sends chat messages', async () => {
    vi.stubGlobal('fetch', makeFetch({ choices: [{ message: { content: 'ok' } }] }));

    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL, generateModel: 'qwen2.5:1.5b' });
    await backend.generate('prompt', { systemPrompt: 'Be terse.' });

    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.model).toBe('qwen2.5:1.5b');
    expect(body.messages[0]).toEqual({ role: 'system', content: 'Be terse.' });
    expect(body.messages[1]).toEqual({ role: 'user', content: 'prompt' });
  });

  it('returns message.content and ignores a reasoning model extra reasoning_content field', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({
        choices: [
          {
            message: {
              content: 'the answer',
              reasoning_content: 'step 1: ... step 2: ...',
            },
          },
        ],
        usage: { reasoning_tokens: 402 },
      }),
    );

    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL });
    const result = await backend.generate('question');

    expect(result).toBe('the answer');
  });

  it('adds Authorization header only when apiKey is set', async () => {
    vi.stubGlobal('fetch', makeFetch({ data: [{ embedding: [1] }] }));
    const withKey = new OpenAICompatBackend({ baseUrl: BASE_URL, apiKey: 'sk-x' });
    await withKey.embed('hi');
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer sk-x');
  });

  it('denies redirects on every content-bearing request', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (init?.redirect !== 'error') throw new Error('redirect policy missing');
      const body = JSON.parse(String(init.body)) as { stream?: boolean; tools?: unknown[] };
      if (body.stream) {
        const bytes = new TextEncoder().encode(
          'data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n',
        );
        return Promise.resolve({
          status: 200,
          ok: true,
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
          body: {
            getReader: () => ({
              read: vi
                .fn()
                .mockResolvedValueOnce({ done: false, value: bytes })
                .mockResolvedValueOnce({ done: true, value: undefined }),
              releaseLock: vi.fn(),
            }),
          },
        });
      }
      if (url.endsWith('/embeddings')) {
        return Promise.resolve(jsonResponse({ data: [{ embedding: [0.1] }] }));
      }
      if (body.tools) {
        return Promise.resolve(
          jsonResponse({
            choices: [
              { message: { tool_calls: [{ function: { name: 'judge', arguments: '{}' } }] } },
            ],
          }),
        );
      }
      return Promise.resolve(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    });
    vi.stubGlobal('fetch', fetchMock);
    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL });

    await expect(backend.embed('secret')).resolves.toEqual([0.1]);
    await expect(backend.generate('secret')).resolves.toBe('ok');
    await expect(
      backend.generateStructured('secret', {
        tool: { name: 'judge', description: 'judge', parameters: { type: 'object' } },
      }),
    ).resolves.toEqual({});
    await expect(backend.stream('secret').next()).resolves.toEqual({ value: 'ok', done: false });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('uses a generic error label', async () => {
    vi.stubGlobal('fetch', makeFetch({}, 503));
    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL });
    await expect(backend.generate('x')).rejects.toThrow(
      'OpenAI-compatible endpoint generate failed: 503',
    );
  });

  const RELEVANCE_TOOL = {
    name: 'report_relevance',
    description: 'Return a relevance score per fact.',
    parameters: {
      type: 'object',
      properties: { results: { type: 'array' } },
      required: ['results'],
    },
  };

  it('forces the tool and returns the parsed tool-call arguments', async () => {
    const args = { results: [{ factId: 'f1', relevance: 0.9 }] };
    vi.stubGlobal(
      'fetch',
      makeFetch({
        choices: [
          {
            message: {
              tool_calls: [
                { function: { name: 'report_relevance', arguments: JSON.stringify(args) } },
              ],
            },
          },
        ],
      }),
    );
    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL });
    const result = await backend.generateStructured('judge these', { tool: RELEVANCE_TOOL });

    expect(result).toEqual(args);
    const [, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);
    expect(body.tools[0].function.name).toBe('report_relevance');
    expect(body.tool_choice).toEqual({ type: 'function', function: { name: 'report_relevance' } });
  });

  it('falls back to parsing a JSON object from message.content when tool_calls is absent', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({
        choices: [
          {
            message: {
              content: 'Here is the result: {"results":[{"factId":"f2","relevance":0.1}]} done',
            },
          },
        ],
      }),
    );
    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL });
    const result = await backend.generateStructured('judge', { tool: RELEVANCE_TOOL });
    expect(result).toEqual({ results: [{ factId: 'f2', relevance: 0.1 }] });
  });

  it('rejects a structured call whose model is not on the allowlist before sending', async () => {
    const fetchMock = makeFetch({});
    vi.stubGlobal('fetch', fetchMock);
    const backend = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      modelAllowlist: ['qwen/qwen3-32b'],
    });
    await expect(
      backend.generateStructured('x', { tool: RELEVANCE_TOOL, model: 'evil/model' }),
    ).rejects.toThrow('not in the verified-model allowlist');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
