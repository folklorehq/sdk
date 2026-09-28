// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TelemetryClient } from '@folklore/telemetry';
import { OpenAICompatBackend } from '../src/OpenAICompatBackend.js';

const BASE_URL = 'http://vllm:8000';

function makeFetch(response: Record<string, unknown>, status = 200) {
  const bytes = new TextEncoder().encode(JSON.stringify(response));
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer),
    body: null,
  });
}

function jsonResponse(body: Record<string, unknown>): Response {
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

  it('keeps omitted and explicit tool_call request bytes identical', async () => {
    const fetchMock = makeFetch({
      choices: [
        {
          message: {
            tool_calls: [{ function: { name: RELEVANCE_TOOL.name, arguments: '{}' } }],
          },
        },
      ],
    });
    vi.stubGlobal('fetch', fetchMock);
    const implicit = new OpenAICompatBackend({ baseUrl: BASE_URL });
    const explicit = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      structuredOutputMode: 'tool_call',
    });

    await implicit.generateStructured('judge', { tool: RELEVANCE_TOOL });
    await explicit.generateStructured('judge', { tool: RELEVANCE_TOOL });

    const firstBody = (fetchMock.mock.calls[0]?.[1] as RequestInit).body;
    const secondBody = (fetchMock.mock.calls[1]?.[1] as RequestInit).body;
    expect(secondBody).toBe(firstBody);
  });

  it('uses the exact json_schema request format and preserves verification, usage, and telemetry', async () => {
    const tool = {
      name: 'report_relevance',
      description: 'Return a relevance score per fact.',
      parameters: {
        type: 'object',
        properties: { results: { type: 'array' } },
        required: ['results'],
      },
    };
    const originalTool = structuredClone(tool);
    const verifier = {
      ensureAttested: vi.fn().mockResolvedValue(undefined),
      verifyReceipt: vi.fn().mockResolvedValue(undefined),
    };
    const usageSink = vi.fn();
    const track = vi.fn();
    const response = {
      choices: [{ message: { content: '{"results":[{"factId":"f1","relevance":0.9}]}' } }],
      usage: { prompt_tokens: 17, completion_tokens: 5 },
    };
    const fetchMock = makeFetch(response);
    vi.stubGlobal('fetch', fetchMock);
    const backend = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      structuredOutputMode: 'json_schema',
      responseVerifier: verifier,
      usageSink,
      telemetry: { track, captureError: vi.fn(), flush: vi.fn() } as unknown as TelemetryClient,
    });

    await expect(
      backend.generateStructured('judge', {
        tool,
        model: 'judge/model',
        modelRevision: 'revision-7',
        systemPrompt: 'Return only the object.',
        maxTokens: 321,
        temperature: 0.25,
      }),
    ).resolves.toEqual({ results: [{ factId: 'f1', relevance: 0.9 }] });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const requestText = init.body as string;
    expect(requestText).toBe(
      JSON.stringify({
        model: 'judge/model',
        model_revision: 'revision-7',
        messages: [
          { role: 'system', content: 'Return only the object.' },
          { role: 'user', content: 'judge' },
        ],
        max_tokens: 321,
        temperature: 0.25,
        stream: false,
        response_format: {
          type: 'json_schema',
          json_schema: { name: tool.name, strict: true, schema: tool.parameters },
        },
      }),
    );
    const body = JSON.parse(requestText) as Record<string, unknown>;
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('tool_choice');
    expect(tool).toEqual(originalTool);

    expect(verifier.ensureAttested).toHaveBeenCalledOnce();
    expect(verifier.verifyReceipt).toHaveBeenCalledOnce();
    const evidence = verifier.verifyReceipt.mock.calls[0]?.[1] as { nonce: string };
    expect(evidence).toMatchObject({
      model: 'judge/model',
      modelRevision: 'revision-7',
      requestSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      responseSha256: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
    const headers = init.headers as Record<string, string>;
    expect(headers['X-Folklore-Inference-Nonce']).toBe(evidence.nonce);
    expect(usageSink).toHaveBeenCalledWith({
      model: 'judge/model',
      operation: 'structured',
      promptTokens: 17,
      completionTokens: 5,
      cached: false,
    });
    expect(track).toHaveBeenCalledWith('inference.generate', 'system', {
      model: 'judge/model',
      latencyMs: expect.any(Number),
    });
    expect(JSON.stringify(track.mock.calls)).not.toContain('Return only the object.');
    expect(JSON.stringify(track.mock.calls)).not.toContain('f1');
  });

  it('accepts an explicit empty object in json_schema mode', async () => {
    vi.stubGlobal('fetch', makeFetch({ choices: [{ message: { content: '{}' } }] }));
    const backend = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      structuredOutputMode: 'json_schema',
    });

    await expect(backend.generateStructured('judge', { tool: RELEVANCE_TOOL })).resolves.toEqual(
      {},
    );
  });

  it.each([
    ['empty content', ''],
    ['whitespace content', ' \n\t'],
    ['plain prose', 'not JSON: secret-content'],
    ['prose-wrapped object', 'Here is the result: {"results":[]}'],
    ['fenced object', '```json\n{}\n```'],
    ['malformed JSON', '{"results":[}'],
    ['null', null],
    ['primitive', 'true'],
    ['array', '[]'],
  ])('rejects %s in json_schema mode with a static error', async (_caseName, content) => {
    const usageSink = vi.fn();
    const track = vi.fn();
    vi.stubGlobal(
      'fetch',
      makeFetch({
        choices: [{ message: { content } }],
        usage: { prompt_tokens: 17, completion_tokens: 5 },
      }),
    );
    const backend = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      structuredOutputMode: 'json_schema',
      usageSink,
      telemetry: { track, captureError: vi.fn(), flush: vi.fn() } as unknown as TelemetryClient,
    });

    await expect(backend.generateStructured('judge', { tool: RELEVANCE_TOOL })).rejects.toThrow(
      'OpenAI-compatible endpoint returned invalid structured output',
    );
    expect(usageSink).not.toHaveBeenCalled();
    if (typeof content === 'string' && content.length > 0) {
      expect(JSON.stringify(track.mock.calls)).not.toContain(content);
    }
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

  it('requires attestation transport and binds the public provider marker on every operation', async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        provider?: unknown;
        stream?: boolean;
        tools?: unknown[];
      };
      expect(body.provider).toEqual({ aci_verified: true });
      if (body.stream) return Promise.resolve(new Response('data: [DONE]\n\n', { status: 200 }));
      if (url.endsWith('/embeddings'))
        return Promise.resolve(jsonResponse({ data: [{ embedding: [1] }] }));
      if (body.tools)
        return Promise.resolve(
          jsonResponse({
            choices: [
              { message: { tool_calls: [{ function: { name: 'judge', arguments: '{}' } }] } },
            ],
          }),
        );
      return Promise.resolve(jsonResponse({ choices: [{ message: { content: 'ok' } }] }));
    });
    const contexts: unknown[] = [];
    const verifier = {
      ensureAttested: vi.fn(async (context?: unknown) => {
        contexts.push(context);
      }),
      verifyReceipt: vi.fn(async () => undefined),
    };
    const backend = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      publicAciRequired: true,
      responseVerifier: verifier,
      fetchImpl: fetchMock,
    });
    await backend.embed('x');
    await backend.generate('x');
    await backend.generateStructured('x', {
      tool: { name: 'judge', description: 'judge', parameters: {} },
    });
    await backend.stream('x').next();
    expect(contexts).toEqual([
      {
        model: 'nomic-embed-text',
        modelRevision: 'unversioned',
        modelRole: undefined,
        endpoint: '/v1/embeddings',
      },
      {
        model: 'qwen2.5:7b',
        modelRevision: 'unversioned',
        modelRole: undefined,
        endpoint: '/v1/chat/completions',
      },
      {
        model: 'qwen2.5:7b',
        modelRevision: 'unversioned',
        modelRole: undefined,
        endpoint: '/v1/chat/completions',
      },
      {
        model: 'qwen2.5:7b',
        modelRevision: 'unversioned',
        modelRole: undefined,
        endpoint: '/v1/chat/completions',
      },
    ]);
  });

  it('fails closed before HTTP when public attestation rejects and rejects incomplete configuration', async () => {
    const fetchMock = vi.fn();
    const verifier = {
      ensureAttested: vi.fn(async () => {
        throw new Error('attestation_rejected');
      }),
      verifyReceipt: vi.fn(async () => undefined),
    };
    const backend = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      publicAciRequired: true,
      responseVerifier: verifier,
      fetchImpl: fetchMock,
    });
    await expect(backend.generate('secret')).rejects.toThrow('attestation_rejected');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(() => new OpenAICompatBackend({ baseUrl: BASE_URL, publicAciRequired: true })).toThrow(
      'public_aci_requires_verifier_and_fetch',
    );
  });
});
