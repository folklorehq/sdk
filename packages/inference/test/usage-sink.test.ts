// SPDX-License-Identifier: Apache-2.0
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_TOKENS_PER_CALL, OpenAICompatBackend } from '../src/OpenAICompatBackend.js';
import type { InferenceUsageEvent } from '../src/ports.js';

const BASE_URL = 'http://vllm:8000';
const MODEL = 'qwen2.5:7b';

function makeFetch(response: object, status = 200) {
  const bytes = new TextEncoder().encode(JSON.stringify(response));
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer),
    body: null,
  });
}

function sink(): { events: InferenceUsageEvent[]; usageSink: (e: InferenceUsageEvent) => void } {
  const events: InferenceUsageEvent[] = [];
  return { events, usageSink: (e) => events.push(e) };
}

const TOOL = {
  name: 'report',
  description: 'report a verdict',
  parameters: { type: 'object', properties: {} },
};

describe('OpenAICompatBackend usage sink', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('maps the OpenAI-compat usage field onto a generate event', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 123, completion_tokens: 45 },
      }),
    );
    const { events, usageSink } = sink();

    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL, generateModel: MODEL, usageSink });
    await backend.generate('hi');

    expect(events).toEqual([
      {
        model: MODEL,
        operation: 'generate',
        promptTokens: 123,
        completionTokens: 45,
        cached: false,
      },
    ]);
  });

  it('emits an embed event with the embedding model', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({
        data: [{ embedding: [0.1, 0.2] }],
        usage: { prompt_tokens: 7, completion_tokens: 0 },
      }),
    );
    const { events, usageSink } = sink();

    const backend = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      embedModel: 'nomic-embed-text',
      usageSink,
    });
    await backend.embed('hello');

    expect(events).toEqual([
      {
        model: 'nomic-embed-text',
        operation: 'embed',
        promptTokens: 7,
        completionTokens: 0,
        cached: false,
      },
    ]);
  });

  it('emits a structured event for a forced tool call', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({
        choices: [{ message: { tool_calls: [{ function: { name: 'report', arguments: '{}' } }] } }],
        usage: { prompt_tokens: 900, completion_tokens: 12 },
      }),
    );
    const { events, usageSink } = sink();

    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL, usageSink });
    await backend.generateStructured('judge this', { tool: TOOL, model: MODEL });

    expect(events).toEqual([
      {
        model: MODEL,
        operation: 'structured',
        promptTokens: 900,
        completionTokens: 12,
        cached: false,
      },
    ]);
  });

  it('emits zeros when the response omits usage', async () => {
    vi.stubGlobal('fetch', makeFetch({ choices: [{ message: { content: 'ok' } }] }));
    const { events, usageSink } = sink();

    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL, generateModel: MODEL, usageSink });
    await backend.generate('hi');

    expect(events[0]).toMatchObject({ promptTokens: 0, completionTokens: 0 });
  });

  it('coerces a non-integer, negative, or non-numeric count to zero', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: -5, completion_tokens: 'many' },
      }),
    );
    const { events, usageSink } = sink();

    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL, generateModel: MODEL, usageSink });
    await backend.generate('hi');

    expect(events[0]).toMatchObject({ promptTokens: 0, completionTokens: 0 });
  });

  it('clamps an extreme count so an accumulator cannot overflow to Infinity', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 1e308, completion_tokens: Number.MAX_SAFE_INTEGER },
      }),
    );
    const { events, usageSink } = sink();

    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL, generateModel: MODEL, usageSink });
    await backend.generate('hi');

    expect(events[0]).toMatchObject({
      promptTokens: MAX_TOKENS_PER_CALL,
      completionTokens: MAX_TOKENS_PER_CALL,
    });
  });

  it('never emits a field beyond the content-free five', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({
        choices: [{ message: { content: 'the secret synthesized prose' } }],
        usage: { prompt_tokens: 1, completion_tokens: 2, prompt_text: 'the secret prompt' },
      }),
    );
    const { events, usageSink } = sink();

    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL, generateModel: MODEL, usageSink });
    await backend.generate('a prompt carrying decrypted fact bodies');

    expect(Object.keys(events[0] as object).sort()).toEqual([
      'cached',
      'completionTokens',
      'model',
      'operation',
      'promptTokens',
    ]);
    expect(JSON.stringify(events)).not.toContain('secret');
  });

  it('works with no sink configured', async () => {
    vi.stubGlobal('fetch', makeFetch({ choices: [{ message: { content: 'ok' } }] }));
    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL });
    await expect(backend.generate('hi')).resolves.toBe('ok');
  });

  it('swallows a throwing sink rather than failing the inference call', async () => {
    vi.stubGlobal('fetch', makeFetch({ choices: [{ message: { content: 'ok' } }] }));
    const backend = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      usageSink: () => {
        throw new Error('sink exploded');
      },
    });
    await expect(backend.generate('hi')).resolves.toBe('ok');
  });

  it('emits nothing when the upstream call fails', async () => {
    vi.stubGlobal('fetch', makeFetch({}, 500));
    const { events, usageSink } = sink();

    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL, usageSink });
    await expect(backend.generate('hi')).rejects.toThrow();

    expect(events).toEqual([]);
  });
});
