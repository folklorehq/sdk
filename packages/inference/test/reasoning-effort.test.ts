// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatBackend } from '../src/OpenAICompatBackend.js';
import { REASONING_EFFORT_BY_MODEL, reasoningModelsMissingEffort } from '../src/model-allowlist.js';

const BASE_URL = 'http://vllm:8000';
const GLM_5_3 = 'z-ai/glm-5.3';
const GLM_5_2 = 'z-ai/glm-5.2';
const KIMI_K3 = 'moonshotai/kimi-k3';
const UNMAPPED_MODELS = ['qwen/qwen3-32b'];
const REVISION = 'revision-1';
const MAX_TOKENS = 8192;
const TEMPERATURE = 0.2;
const TOOL = { name: 't', description: 'd', parameters: { type: 'object' } };
const POOL_PROVIDER = { provider: { aci_verified: true } };
const LOW = { reasoning_effort: 'low' };

type Path = 'direct' | 'pool';
const PATHS: readonly Path[] = ['direct', 'pool'];

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

function backendFor(path: Path, fetchMock: ReturnType<typeof vi.fn>): OpenAICompatBackend {
  if (path === 'direct')
    return new OpenAICompatBackend({ baseUrl: BASE_URL, fetchImpl: fetchMock });
  return new OpenAICompatBackend({
    baseUrl: BASE_URL,
    fetchImpl: fetchMock,
    publicAciRequired: true,
    responseVerifier: {
      ensureAttested: vi.fn(async () => undefined),
      verifyReceipt: vi.fn(async () => undefined),
    },
  });
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>): string {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return init.body as string;
}

function messages() {
  return [
    { role: 'system', content: 'system' },
    { role: 'user', content: 'prompt' },
  ];
}

async function generateBody(model: string, path: Path): Promise<string> {
  const fetchMock = fetchReturning({ choices: [{ message: { content: 'ok' } }] });
  await backendFor(path, fetchMock).generate('prompt', {
    model,
    modelRevision: REVISION,
    modelRole: 'generate',
    systemPrompt: 'system',
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  });
  return sentBody(fetchMock);
}

async function structuredBody(model: string, path: Path): Promise<string> {
  const fetchMock = fetchReturning({
    choices: [{ message: { tool_calls: [{ function: { name: 't', arguments: '{}' } }] } }],
  });
  await backendFor(path, fetchMock).generateStructured('prompt', {
    model,
    modelRevision: REVISION,
    systemPrompt: 'system',
    maxTokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    tool: TOOL,
  });
  return sentBody(fetchMock);
}

function expectedGenerateBody(model: string, path: Path, effort: object = {}): string {
  return JSON.stringify({
    model,
    model_revision: REVISION,
    messages: messages(),
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    ...effort,
    stream: false,
    ...(path === 'pool' ? POOL_PROVIDER : {}),
  });
}

function expectedStructuredBody(model: string, path: Path, effort: object = {}): string {
  return JSON.stringify({
    model,
    model_revision: REVISION,
    messages: messages(),
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
    ...effort,
    stream: false,
    ...(path === 'pool' ? POOL_PROVIDER : {}),
    tools: [{ type: 'function', function: TOOL }],
    tool_choice: { type: 'function', function: { name: TOOL.name } },
  });
}

describe('per-model reasoning effort', () => {
  it('declares low effort for glm-5.3 generate and for glm-5.2 and kimi-k3 generate and structured', () => {
    expect([...REASONING_EFFORT_BY_MODEL]).toEqual([
      [GLM_5_3, { generate: 'low' }],
      [GLM_5_2, { generate: 'low', structured: 'low' }],
      [KIMI_K3, { generate: 'low', structured: 'low' }],
    ]);
  });

  describe.each(PATHS)('on the %s path', (path) => {
    it.each([GLM_5_3, GLM_5_2, KIMI_K3])(
      'sends reasoning_effort low on a %s generate request',
      async (model) => {
        expect(await generateBody(model, path)).toBe(expectedGenerateBody(model, path, LOW));
      },
    );

    it.each([GLM_5_2, KIMI_K3])(
      'sends reasoning_effort low on a %s structured request',
      async (model) => {
        expect(await structuredBody(model, path)).toBe(expectedStructuredBody(model, path, LOW));
      },
    );

    it('leaves the glm-5.3 structured body byte-identical', async () => {
      const body = await structuredBody(GLM_5_3, path);
      expect(body).toBe(expectedStructuredBody(GLM_5_3, path));
      expect(body).not.toContain('reasoning');
    });

    it.each(UNMAPPED_MODELS)('leaves the %s generate body byte-identical', async (model) => {
      const body = await generateBody(model, path);
      expect(body).toBe(expectedGenerateBody(model, path));
      expect(body).not.toContain('reasoning');
    });

    it.each(UNMAPPED_MODELS)('leaves the %s structured body byte-identical', async (model) => {
      const body = await structuredBody(model, path);
      expect(body).toBe(expectedStructuredBody(model, path));
      expect(body).not.toContain('reasoning');
    });

    it.each([GLM_5_3, GLM_5_2, KIMI_K3])(
      'never sends reasoning_effort on a %s stream',
      async (model) => {
        const fetchMock = vi.fn().mockResolvedValue(new Response('data: [DONE]\n\n'));
        const tokens = backendFor(path, fetchMock).stream('prompt', {
          model,
          modelRevision: REVISION,
        });
        for await (const token of tokens) expect(token).toBeUndefined();
        expect(sentBody(fetchMock)).not.toContain('reasoning');
      },
    );
  });

  it('sends reasoning_effort on a kimi-k3 json_schema structured request', async () => {
    const fetchMock = fetchReturning({ choices: [{ message: { content: '{}' } }] });
    const backend = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      fetchImpl: fetchMock,
      structuredOutputMode: 'json_schema',
    });
    await backend.generateStructured('prompt', {
      model: KIMI_K3,
      modelRevision: REVISION,
      tool: TOOL,
    });
    expect(JSON.parse(sentBody(fetchMock))).toMatchObject(LOW);
  });

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
});

describe('reasoningModelsMissingEffort', () => {
  it('accepts the mapped reasoning models and models outside a reasoning family', () => {
    expect(reasoningModelsMissingEffort([GLM_5_3, GLM_5_2, KIMI_K3, ...UNMAPPED_MODELS])).toEqual(
      [],
    );
  });

  it('names a renamed reasoning variant that has no entry', () => {
    const variants = ['z-ai/glm-5.3-flash', 'z-ai/glm-5.2-thinking', 'moonshotai/kimi-k3-thinking'];
    expect(reasoningModelsMissingEffort([GLM_5_3, ...variants])).toEqual(variants);
  });
});
