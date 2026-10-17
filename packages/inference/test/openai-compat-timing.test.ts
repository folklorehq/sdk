// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { OpenAICompatBackend } from '../src/OpenAICompatBackend.js';
import type {
  InferenceCallLabel,
  InferenceCallPhase,
  InferenceResponseVerifier,
  InferenceTimer,
} from '../src/ports.js';

const BASE_URL = 'http://vllm:8000';
const MODEL = 'z-ai/glm-5.2';
const SECRET = 'customer-secret-7f3a quarterly roadmap for Acme';

interface TimedStep {
  phase: InferenceCallPhase;
  label: InferenceCallLabel;
  settled: 'resolved' | 'rejected';
}

function recordingTimer(): { timer: InferenceTimer; steps: TimedStep[] } {
  const steps: TimedStep[] = [];
  const timer: InferenceTimer = async (phase, label, step) => {
    try {
      const value = await step();
      steps.push({ phase, label, settled: 'resolved' });
      return value;
    } catch (error) {
      steps.push({ phase, label, settled: 'rejected' });
      throw error;
    }
  };
  return { timer, steps };
}

function responseFetch(body: Record<string, unknown>, status = 200): typeof fetch {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return vi.fn().mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    headers: new Headers(),
    arrayBuffer: () => Promise.resolve(bytes.buffer as ArrayBuffer),
    body: null,
  }) as unknown as typeof fetch;
}

function verifier(): InferenceResponseVerifier {
  return {
    ensureAttested: vi.fn().mockResolvedValue(undefined),
    verifyReceipt: vi.fn().mockResolvedValue(undefined),
  } as unknown as InferenceResponseVerifier;
}

const CHAT = {
  choices: [{ message: { content: `echo ${SECRET}` }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 10, completion_tokens: 5 },
};

describe('OpenAICompatBackend call timing', () => {
  it('times attestation, send-to-headers, body and receipt verification of a generate call', async () => {
    const { timer, steps } = recordingTimer();
    const backend = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      generateModel: MODEL,
      responseVerifier: verifier(),
      fetchImpl: responseFetch(CHAT),
      timer,
    });

    await backend.generate(SECRET, { modelRole: 'critique', systemPrompt: SECRET });

    expect(steps.map((step) => step.phase)).toEqual([
      'attest',
      'request',
      'response',
      'verify_receipt',
    ]);
    for (const step of steps) {
      expect(step.label).toEqual({ model: MODEL, role: 'critique', operation: 'generate' });
      expect(step.settled).toBe('resolved');
    }
  });

  it('labels embeddings and structured calls with their own operation', async () => {
    const { timer, steps } = recordingTimer();
    const embedder = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      embedModel: 'qwen/qwen3-embedding-8b',
      fetchImpl: responseFetch({ data: [{ embedding: [0.1] }] }),
      timer,
    });
    await embedder.embed(SECRET);
    const judge = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      generateModel: MODEL,
      fetchImpl: responseFetch({
        choices: [{ message: { tool_calls: [{ function: { arguments: '{"ok":true}' } }] } }],
      }),
      timer,
    });
    await judge.generateStructured(SECRET, {
      tool: { name: 'verdict', description: 'd', parameters: { type: 'object' } },
      modelRole: 'judge',
    });

    expect(steps.map((step) => [step.phase, step.label.operation])).toEqual([
      ['request', 'embed'],
      ['response', 'embed'],
      ['request', 'structured'],
      ['response', 'structured'],
    ]);
  });

  it('records a failed verification as a rejected step and still fails the call', async () => {
    const { timer, steps } = recordingTimer();
    const refusing = verifier();
    vi.mocked(refusing.verifyReceipt).mockRejectedValue(new Error('aci_receipt_invalid'));
    const backend = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      generateModel: MODEL,
      responseVerifier: refusing,
      fetchImpl: responseFetch(CHAT),
      timer,
    });

    await expect(backend.generate(SECRET)).rejects.toThrow('aci_receipt_invalid');
    expect(steps.at(-1)).toMatchObject({ phase: 'verify_receipt', settled: 'rejected' });
  });

  it('never hands the timer a prompt, a system prompt or a response body', async () => {
    const seen: unknown[] = [];
    const timer: InferenceTimer = async (phase, label, step) => {
      seen.push(phase, label);
      return step();
    };
    const backend = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      generateModel: MODEL,
      responseVerifier: verifier(),
      fetchImpl: responseFetch(CHAT),
      timer,
    });

    await backend.generate(SECRET, { systemPrompt: SECRET });

    expect(seen.length).toBeGreaterThan(0);
    expect(JSON.stringify(seen)).not.toContain('customer-secret');
  });

  it('calls the provider exactly once per step when a timer is composed', async () => {
    const { timer } = recordingTimer();
    const fetchImpl = responseFetch(CHAT);
    const backend = new OpenAICompatBackend({
      baseUrl: BASE_URL,
      generateModel: MODEL,
      fetchImpl,
      timer,
    });

    await expect(backend.generate('prompt')).resolves.toBe(`echo ${SECRET}`);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
