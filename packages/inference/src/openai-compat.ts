// SPDX-License-Identifier: Apache-2.0
import { extractJsonObject } from '@folklore/utils';
import type { TelemetryClient } from '@folklore/telemetry';
import type {
  EmbedOptions,
  GenerateOptions,
  InferenceBackend,
  InferenceResponseVerifier,
  StructuredOptions,
} from './ports.js';
import { ACI_RECEIPT_ID_HEADER } from './aci-verifier.js';

export interface OpenAICompatConfig {
  /** Base URL of an OpenAI-compatible inference server — MUST be a local/in-box endpoint (vLLM, TGI, llama.cpp, LocalAI). */
  baseUrl: string;
  /** API key, if the server requires one (vLLM's `--api-key`). Usually unset in-box. */
  apiKey?: string;
  /** Default embedding model name (must match a model the server has loaded). */
  embedModel?: string;
  /** Default text-generation model name (must match a model the server has loaded). */
  generateModel?: string;
  /** When set, request this dimensionality via the OpenAI `dimensions` param and reject a response of another length. Unset = the server's native dimension. */
  embedDimensions?: number;
  /** Request timeout in milliseconds. Default: 60000. */
  timeoutMs?: number;
  /** Human label used in error messages. Default: 'OpenAI-compatible endpoint'. */
  label?: string;
  /** When set, reject any embed/generate/stream whose model is not listed — before sending (ADL #30/#40). */
  modelAllowlist?: readonly string[];
  /** When set, prove each response came from a verified TEE upstream via its ACI receipt (ADL #30/#40). */
  responseVerifier?: InferenceResponseVerifier;
  telemetry?: TelemetryClient;
}

const DEFAULT_EMBED_MODEL = 'nomic-embed-text';
const DEFAULT_GENERATE_MODEL = 'qwen2.5:7b';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_LABEL = 'OpenAI-compatible endpoint';
const STREAM_TIMEOUT_MULTIPLIER = 5;

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[] }>;
}

interface OpenAIChatResponse {
  choices: Array<{ message: { content: string } }>;
}

interface OpenAIToolChatResponse {
  choices: Array<{
    message: {
      content?: string | null;
      tool_calls?: Array<{ function: { name: string; arguments: string } }>;
    };
  }>;
}

interface OpenAIChatStreamChunk {
  choices: Array<{ delta: { content?: string }; finish_reason: string | null }>;
}

/** Technology-agnostic OpenAI-compatible client; carries no TEE attestation — use `TeeEndpointBackend` when that's needed (ADL #15/#16/#19). */
export class OpenAICompatBackend implements InferenceBackend {
  protected readonly baseUrl: string;
  protected readonly apiKey: string | undefined;
  protected readonly embedModel: string;
  protected readonly generateModel: string;
  protected readonly embedDimensions: number | undefined;
  protected readonly timeoutMs: number;
  protected readonly label: string;
  protected readonly modelAllowlist: readonly string[] | undefined;
  protected readonly responseVerifier: InferenceResponseVerifier | undefined;
  protected readonly telemetry: TelemetryClient | undefined;

  constructor(config: OpenAICompatConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '').replace(/\/v1$/, '');
    this.apiKey = config.apiKey;
    this.embedModel = config.embedModel ?? DEFAULT_EMBED_MODEL;
    this.generateModel = config.generateModel ?? DEFAULT_GENERATE_MODEL;
    this.embedDimensions = config.embedDimensions;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.label = config.label ?? DEFAULT_LABEL;
    this.modelAllowlist = config.modelAllowlist;
    this.responseVerifier = config.responseVerifier;
    this.telemetry = config.telemetry;
  }

  async embed(text: string, options?: EmbedOptions): Promise<number[]> {
    const model = options?.model ?? this.embedModel;
    this.assertModelAllowed(model);
    await this.responseVerifier?.ensureAttested();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const start = Date.now();

    try {
      const body: Record<string, unknown> = { model, input: text };
      // Only request matryoshka truncation when a dimension is explicitly configured;
      // providers like RedPill/qwen return their native dimension and reject the param.
      if (this.embedDimensions !== undefined) body['dimensions'] = this.embedDimensions;

      const res = await fetch(`${this.baseUrl}/v1/embeddings`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!this.isOk(res)) {
        throw new Error(`${this.label} embed failed: ${res.status}`);
      }

      const data = (await res.json()) as OpenAIEmbeddingResponse;
      const embedding = data.data[0]?.embedding;
      if (!embedding) throw new Error(`${this.label} returned no embedding`);
      if (this.embedDimensions !== undefined && embedding.length !== this.embedDimensions) {
        throw new Error(
          `${this.label} returned ${embedding.length}-dim embedding, expected ${this.embedDimensions}`,
        );
      }
      await this.responseVerifier?.verifyReceipt(this.receiptId(res));
      this.telemetry?.track('inference.embed', 'system', { model, latencyMs: Date.now() - start });
      return embedding;
    } catch (err) {
      this.telemetry?.track('inference.error', 'system', { model, errorType: 'embed_failed' });
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    const model = options?.model ?? this.generateModel;
    this.assertModelAllowed(model);
    await this.responseVerifier?.ensureAttested();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const start = Date.now();

    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({
          model,
          messages: this.messages(prompt, options),
          max_tokens: options?.maxTokens,
          temperature: options?.temperature,
          stream: false,
        }),
        signal: controller.signal,
      });

      if (!this.isOk(res)) {
        throw new Error(`${this.label} generate failed: ${res.status}`);
      }

      const data = (await res.json()) as OpenAIChatResponse;
      const content = data.choices[0]?.message?.content;
      if (content === undefined) throw new Error(`${this.label} returned no content`);
      await this.responseVerifier?.verifyReceipt(this.receiptId(res));
      this.telemetry?.track('inference.generate', 'system', {
        model,
        latencyMs: Date.now() - start,
      });
      return content;
    } catch (err) {
      this.telemetry?.track('inference.error', 'system', { model, errorType: 'generate_failed' });
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async generateStructured(prompt: string, options: StructuredOptions): Promise<unknown> {
    const model = options.model ?? this.generateModel;
    this.assertModelAllowed(model);
    await this.responseVerifier?.ensureAttested();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    const start = Date.now();

    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify(this.toolRequestBody(model, prompt, options)),
        signal: controller.signal,
      });

      if (!this.isOk(res)) {
        throw new Error(`${this.label} tool call failed: ${res.status}`);
      }

      const data = (await res.json()) as OpenAIToolChatResponse;
      const parsed = this.parseToolArguments(data, options.tool.name);
      await this.responseVerifier?.verifyReceipt(this.receiptId(res));
      this.telemetry?.track('inference.generate', 'system', {
        model,
        latencyMs: Date.now() - start,
      });
      return parsed;
    } catch (err) {
      this.telemetry?.track('inference.error', 'system', { model, errorType: 'structured_failed' });
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async *stream(prompt: string, options?: GenerateOptions): AsyncIterable<string> {
    const model = options?.model ?? this.generateModel;
    this.assertModelAllowed(model);
    await this.responseVerifier?.ensureAttested();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs * STREAM_TIMEOUT_MULTIPLIER);

    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ model, messages: this.messages(prompt, options), stream: true }),
        signal: controller.signal,
      });

      if (!this.isOk(res) || !res.body) {
        throw new Error(`${this.label} stream failed: ${res.status}`);
      }

      // Prove the upstream before yielding any token, so unverified content never leaves.
      await this.responseVerifier?.verifyReceipt(this.receiptId(res));

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data: ')) continue;
            const payload = trimmed.slice('data: '.length);
            if (payload === '[DONE]') return;
            const chunk = JSON.parse(payload) as OpenAIChatStreamChunk;
            const token = chunk.choices[0]?.delta?.content;
            if (token) yield token;
          }
        }
      } finally {
        reader.releaseLock();
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async close(): Promise<void> {
    // Stateless HTTP client — nothing to tear down.
  }

  private messages(
    prompt: string,
    options?: GenerateOptions,
  ): Array<{ role: string; content: string }> {
    const messages: Array<{ role: string; content: string }> = [];
    if (options?.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
    messages.push({ role: 'user', content: prompt });
    return messages;
  }

  private toolRequestBody(
    model: string,
    prompt: string,
    options: StructuredOptions,
  ): Record<string, unknown> {
    const { tool } = options;
    return {
      model,
      messages: this.messages(prompt, options),
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      stream: false,
      tools: [
        {
          type: 'function',
          function: { name: tool.name, description: tool.description, parameters: tool.parameters },
        },
      ],
      tool_choice: { type: 'function', function: { name: tool.name } },
    };
  }

  // A forced tool call returns its JSON in `tool_calls[0].function.arguments`; some models
  // instead inline the object in `content`, so fall back to parsing the first JSON object there.
  private parseToolArguments(data: OpenAIToolChatResponse, toolName: string): unknown {
    const message = data.choices[0]?.message;
    const raw = message?.tool_calls?.[0]?.function.arguments ?? message?.content ?? undefined;
    if (raw === undefined || raw === null) {
      throw new Error(`${this.label} returned no tool call for "${toolName}"`);
    }
    return JSON.parse(extractJsonObject(raw));
  }

  protected headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    return h;
  }

  protected isOk(res: { status: number }): boolean {
    return res.status >= 200 && res.status < 300;
  }

  // Fail-closed model guard: a config typo or an unverified-model swap throws before any
  // customer content is sent, never after (ADL #30/#40). The model id is config, not content.
  private assertModelAllowed(model: string): void {
    if (this.modelAllowlist && !this.modelAllowlist.includes(model)) {
      this.telemetry?.track('inference.model_rejected', 'system', { model });
      throw new Error(
        `${this.label} refused model "${model}": not in the verified-model allowlist`,
      );
    }
  }

  private receiptId(res: Response): string | null {
    return res.headers?.get(ACI_RECEIPT_ID_HEADER) ?? null;
  }
}
