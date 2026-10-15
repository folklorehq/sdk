// SPDX-License-Identifier: Apache-2.0
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenAICompatBackend } from '../src/OpenAICompatBackend.js';

const BASE_URL = 'http://vllm:8000';
const TIMEOUT_MS = 1_000;

function hangingFetch(): typeof fetch {
  return (_input, init) =>
    new Promise<Response>((_, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason), { once: true });
    });
}

describe('OpenAICompatBackend request timer', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const backend = () =>
    new OpenAICompatBackend({
      baseUrl: BASE_URL,
      timeoutMs: TIMEOUT_MS,
      fetchImpl: hangingFetch(),
    });
  const tool = { name: 'check', description: 'synthetic', parameters: { type: 'object' } };

  it.each([
    ['embed', () => backend().embed('synthetic')],
    ['generate', () => backend().generate('synthetic')],
    ['a structured call', () => backend().generateStructured('synthetic', { tool })],
  ])('rejects %s with a TimeoutError, not an AbortError', async (_, call) => {
    const settled = call().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(TIMEOUT_MS);
    const error = await settled;
    expect(error).toBeInstanceOf(DOMException);
    expect(error).toMatchObject({ name: 'TimeoutError' });
  });
});
