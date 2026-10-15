// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatBackend } from '../src/OpenAICompatBackend.js';
import { REASONING_EFFORT_BY_MODEL } from '../src/model-allowlist.js';

const BASE_URL = 'http://vllm:8000';
const GLM_5_3 = 'z-ai/glm-5.3';
const REVISION = 'revision-1';
const MAX_TOKENS = 8192;
const TEMPERATURE = 0.2;

function fetchReturning(response: Record<string, unknown>) {
  const bytes = new TextEncoder().encode(JSON.stringify(response));
  return vi.fn().mockResolvedValue({
    status: 200,
    ok: true,
    headers: new Headers(),
    arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer),
    body: null,
  });
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): string {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return init.body as string;
}

async function generateBody(model: string): Promise<string> {
  const fetchMock = fetchReturning({ choices: [{ message: { content: 'ok' } }] });
  const backend = new OpenAICompatBackend({ baseUrl: BASE_URL, fetchImpl: fetchMock });
  await backend.generate('prompt', {
    model,
    modelRevision: REVISION,
    modelRole: 'generate',
    systemPrompt: 'system',
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  });
  return sentBody(fetchMock);
}

function expectedGenerateBody(model: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    model,
    model_revision: REVISION,
    messages: [
      { role: 'system', content: 'system' },
      { role: 'user', content: 'prompt' },
    ],
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    ...extra,
    stream: false,
  });
}

describe('per-model reasoning effort', () => {
  it('declares low effort for glm-5.3 only', () => {
    expect([...REASONING_EFFORT_BY_MODEL]).toEqual([[GLM_5_3, 'low']]);
  });

  it('sends reasoning_effort low on a glm-5.3 generate request', async () => {
    const body = await generateBody(GLM_5_3);
    expect(JSON.parse(body)).toMatchObject({ reasoning_effort: 'low' });
    expect(body).toBe(expectedGenerateBody(GLM_5_3, { reasoning_effort: 'low' }));
  });

  it.each(['moonshotai/kimi-k3', 'z-ai/glm-5.2', 'qwen/qwen3-32b'])(
    'leaves the %s generate body byte-identical',
    async (model) => {
      const body = await generateBody(model);
      expect(body).toBe(expectedGenerateBody(model));
      expect(body).not.toContain('reasoning');
    },
  );

  it('leaves the qwen embed body byte-identical', async () => {
    const fetchMock = fetchReturning({ data: [{ embedding: [0.1] }] });
    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL, fetchImpl: fetchMock });
    await backend.embed('text', {
      model: 'qwen/qwen3-embedding-8b',
      modelRevision: REVISION,
      modelRole: 'embed',
    });
    expect(sentBody(fetchMock)).toBe(
      JSON.stringify({
        model: 'qwen/qwen3-embedding-8b',
        model_revision: REVISION,
        input: 'text',
      }),
    );
  });

  it('does not send reasoning_effort on a glm-5.3 structured call', async () => {
    const fetchMock = fetchReturning({
      choices: [{ message: { tool_calls: [{ function: { name: 't', arguments: '{}' } }] } }],
    });
    const backend = new OpenAICompatBackend({ baseUrl: BASE_URL, fetchImpl: fetchMock });
    await backend.generateStructured('prompt', {
      model: GLM_5_3,
      modelRevision: REVISION,
      tool: { name: 't', description: 'd', parameters: { type: 'object' } },
    });
    expect(sentBody(fetchMock)).not.toContain('reasoning');
  });
});
