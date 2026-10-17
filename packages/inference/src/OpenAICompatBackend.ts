// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes } from 'node:crypto';
import { abortAfter, extractJsonObject } from '@folklore/utils';
import { z, type ZodType, type ZodTypeDef } from 'zod';
import type { TelemetryClient } from '@folklore/telemetry';
import type {
  EmbedOptions,
  GenerateOptions,
  InferenceBackend,
  InferenceCallPhase,
  InferenceOperation,
  InferenceResponseVerifier,
  InferenceTimer,
  InferenceUsageSink,
  InferenceModelRole,
  StructuredOptions,
} from './ports.js';
import { ACI_RECEIPT_ID_HEADER } from './aci-verifier.js';
import { ProviderHttpError } from './ProviderHttpError.js';
import { reasoningEffortFor } from './model-allowlist.js';

export interface OpenAICompatConfig {
  /** Base URL of an OpenAI-compatible inference server — MUST be a local/in-box endpoint (vLLM, TGI, llama.cpp, LocalAI). */
  baseUrl: string;
  /** API key, if the server requires one (vLLM's `--api-key`). Usually unset in-box. */
  apiKey?: string;
  /** Default embedding model name (must match a model the server has loaded). */
  embedModel?: string;
  /** Default embedding model revision for receipt-bound backends. */
  embedModelRevision?: string;
  /** Default text-generation model name (must match a model the server has loaded). */
  generateModel?: string;
  /** Default generation model revision for receipt-bound backends. */
  generateModelRevision?: string;
  structuredOutputMode?: 'tool_call' | 'json_schema';
  /** When set, request this dimensionality via the OpenAI `dimensions` param and reject a response of another length. Unset = the server's native dimension. */
  embedDimensions?: number;
  /** Request timeout in milliseconds. Default: 60000. */
  timeoutMs?: number;
  /** Human label used in error messages. Default: 'OpenAI-compatible endpoint'. */
  label?: string;
  /** When set, reject any embed/generate/stream whose model is not listed — before sending. */
  modelAllowlist?: readonly string[];
  /** When set, prove each response came from a verified TEE upstream via its ACI receipt. */
  responseVerifier?: InferenceResponseVerifier;
  /** Receives the content-free token counts of every successful call. */
  usageSink?: InferenceUsageSink;
  /** Times each awaited step of a call; receives only the model id and closed names. */
  timer?: InferenceTimer;
  telemetry?: TelemetryClient;
  /** Fetch bound to the endpoint's verified transport; required for a TEE backend. */
  fetchImpl?: typeof fetch;
  /** Require attestation before forwarding requests and bind the requirement into each request body. */
  publicAciRequired?: boolean;
}

const DEFAULT_EMBED_MODEL = 'nomic-embed-text';
const DEFAULT_GENERATE_MODEL = 'qwen2.5:7b';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_LABEL = 'OpenAI-compatible endpoint';
const STREAM_TIMEOUT_MULTIPLIER = 5;
// Upstream-supplied counts are untrusted: an extreme value would overflow a caller's running total
// to Infinity, which serializes to null and fails the wire schema, discarding the whole result.
// Orders of magnitude above any configured input budget or max-output, so a real call is unclipped.
export const MAX_TOKENS_PER_CALL = 2_000_000;

interface OpenAIUsage {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
}

// Cost telemetry must never fail a call, so a usage of any other shape reads as absent.
const usageSchema = z
  .unknown()
  .transform((usage): OpenAIUsage | undefined =>
    typeof usage === 'object' && usage !== null ? usage : undefined,
  );

const embeddingResponseSchema = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()) })),
  usage: usageSchema,
});

const chatChoiceSchema = z.object({
  message: z
    .object({
      content: z.string().nullish(),
      tool_calls: z.array(z.object({ function: z.object({ arguments: z.string() }) })).nullish(),
    })
    .nullish(),
  finish_reason: z.string().nullish(),
});

const chatResponseSchema = z.object({ choices: z.array(chatChoiceSchema), usage: usageSchema });

const chatStreamChunkSchema = z.object({
  choices: z.array(z.object({ delta: z.object({ content: z.string().nullish() }).nullish() })),
});

type ChatChoice = z.infer<typeof chatChoiceSchema>;
type ChatResponse = z.infer<typeof chatResponseSchema>;
type ResponseKind = 'embedding' | 'chat' | 'stream';
type ParsedToolArguments = Record<string, unknown>;

// `length` means the reply hit max_tokens: reasoning ate the budget, or the answer was cut off.
const LENGTH_FINISH_REASON = 'length';

export interface InferenceModelSelection {
  model: string;
  revision: string;
  role?: InferenceModelRole;
}

/** Technology-agnostic OpenAI-compatible client; carries no TEE attestation — use `TeeEndpointBackend` when that's needed. */
export class OpenAICompatBackend implements InferenceBackend {
  protected readonly baseUrl: string;
  protected readonly apiKey: string | undefined;
  protected readonly embedModel: string;
  protected readonly embedModelRevision: string;
  protected readonly generateModel: string;
  protected readonly generateModelRevision: string;
  protected readonly embedDimensions: number | undefined;
  protected readonly timeoutMs: number;
  protected readonly label: string;
  protected readonly modelAllowlist: readonly string[] | undefined;
  protected readonly responseVerifier: InferenceResponseVerifier | undefined;
  protected readonly usageSink: InferenceUsageSink | undefined;
  protected readonly timer: InferenceTimer | undefined;
  protected readonly telemetry: TelemetryClient | undefined;
  protected readonly fetchImpl: typeof fetch;
  protected readonly publicAciRequired: boolean;
  private readonly structuredOutputMode: 'tool_call' | 'json_schema';

  constructor(config: OpenAICompatConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '').replace(/\/v1$/, '');
    this.apiKey = config.apiKey;
    this.embedModel = config.embedModel ?? DEFAULT_EMBED_MODEL;
    this.embedModelRevision = config.embedModelRevision ?? 'unversioned';
    this.generateModel = config.generateModel ?? DEFAULT_GENERATE_MODEL;
    this.generateModelRevision = config.generateModelRevision ?? 'unversioned';
    this.structuredOutputMode = config.structuredOutputMode ?? 'tool_call';
    this.embedDimensions = config.embedDimensions;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.label = config.label ?? DEFAULT_LABEL;
    this.modelAllowlist = config.modelAllowlist;
    this.responseVerifier = config.responseVerifier;
    this.usageSink = config.usageSink;
    this.timer = config.timer;
    this.telemetry = config.telemetry;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.publicAciRequired = config.publicAciRequired ?? false;
    if (this.publicAciRequired && (!config.responseVerifier || !config.fetchImpl)) {
      throw new Error('public_aci_requires_verifier_and_fetch');
    }
  }

  async embed(text: string, options?: EmbedOptions): Promise<number[]> {
    const selection = this.resolveEmbedSelection(options);
    const { model } = selection;
    this.assertModelAllowed(model);
    await this.attest(selection, 'embed', '/v1/embeddings');
    const controller = new AbortController();
    const timer = abortAfter(controller, this.timeoutMs);
    const start = Date.now();

    try {
      const body: Record<string, unknown> = {
        model,
        model_revision: selection.revision,
        input: text,
        ...(this.publicAciRequired ? { provider: { aci_verified: true } } : {}),
      };
      // Only request matryoshka truncation when a dimension is explicitly configured;
      // providers like RedPill/qwen return their native dimension and reject the param.
      if (this.embedDimensions !== undefined) body['dimensions'] = this.embedDimensions;
      const requestText = JSON.stringify(body);
      const nonce = this.nonce();

      const res = await this.timed('request', selection, 'embed', () =>
        this.fetchImpl(`${this.baseUrl}/v1/embeddings`, {
          method: 'POST',
          headers: this.headers(nonce, selection.revision),
          body: requestText,
          redirect: 'error',
          signal: controller.signal,
        }),
      );

      if (!this.isOk(res)) {
        throw this.refused('embed', res);
      }

      const rawResponse = await this.timed('response', selection, 'embed', () =>
        this.readResponse(res),
      );
      await this.verifyResponse(res, requestText, rawResponse, selection, nonce, 'embed');
      const data = this.parseResponse(rawResponse, embeddingResponseSchema, 'embedding');
      const embedding = data.data[0]?.embedding;
      if (!embedding) throw new Error(`${this.label} returned no embedding`);
      if (this.embedDimensions !== undefined && embedding.length !== this.embedDimensions) {
        throw new Error(
          `${this.label} returned ${embedding.length}-dim embedding, expected ${this.embedDimensions}`,
        );
      }
      this.recordUsage(model, 'embed', data.usage);
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
    const selection = this.resolveGenerateSelection(options);
    const { model } = selection;
    this.assertModelAllowed(model);
    await this.attest(selection, 'generate', '/v1/chat/completions');
    const controller = new AbortController();
    const timer = abortAfter(controller, this.timeoutMs);
    const start = Date.now();

    try {
      const requestText = JSON.stringify({
        model,
        model_revision: selection.revision,
        messages: this.messages(prompt, options),
        max_tokens: options?.maxTokens,
        temperature: options?.temperature,
        reasoning_effort: reasoningEffortFor(model, 'generate'),
        stream: false,
        ...(this.publicAciRequired ? { provider: { aci_verified: true } } : {}),
      });
      const nonce = this.nonce();
      const res = await this.timed('request', selection, 'generate', () =>
        this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: this.headers(nonce, selection.revision),
          body: requestText,
          redirect: 'error',
          signal: controller.signal,
        }),
      );

      if (!this.isOk(res)) {
        throw this.refused('generate', res);
      }

      const rawResponse = await this.timed('response', selection, 'generate', () =>
        this.readResponse(res),
      );
      await this.verifyResponse(res, requestText, rawResponse, selection, nonce, 'generate');
      const data = this.parseResponse(rawResponse, chatResponseSchema, 'chat');
      const content = this.choiceContent(data.choices[0]);
      this.recordUsage(model, 'generate', data.usage);
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
    const selection = this.resolveStructuredSelection(options);
    const { model } = selection;
    this.assertModelAllowed(model);
    await this.attest(selection, 'structured', '/v1/chat/completions');
    const controller = new AbortController();
    const timer = abortAfter(controller, this.timeoutMs);
    const start = Date.now();

    try {
      const requestText = JSON.stringify(this.toolRequestBody(selection, prompt, options));
      const nonce = this.nonce();
      const res = await this.timed('request', selection, 'structured', () =>
        this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers: this.headers(nonce, selection.revision),
          body: requestText,
          redirect: 'error',
          signal: controller.signal,
        }),
      );

      if (!this.isOk(res)) {
        throw this.refused('tool call', res);
      }

      const rawResponse = await this.timed('response', selection, 'structured', () =>
        this.readResponse(res),
      );
      await this.verifyResponse(res, requestText, rawResponse, selection, nonce, 'structured');
      const data = this.parseResponse(rawResponse, chatResponseSchema, 'chat');
      const parsed =
        this.structuredOutputMode === 'json_schema'
          ? this.parseJsonSchemaArguments(data)
          : this.parseToolArguments(data, options.tool.name);
      this.recordUsage(model, 'structured', data.usage);
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
    const selection = this.resolveGenerateSelection(options);
    const { model } = selection;
    this.assertModelAllowed(model);
    await this.responseVerifier?.ensureAttested(
      this.attestationContext(selection, '/v1/chat/completions'),
    );
    const controller = new AbortController();
    const timer = abortAfter(controller, this.timeoutMs * STREAM_TIMEOUT_MULTIPLIER);

    try {
      const requestText = JSON.stringify({
        model,
        model_revision: selection.revision,
        messages: this.messages(prompt, options),
        stream: true,
        ...(this.publicAciRequired ? { provider: { aci_verified: true } } : {}),
      });
      const nonce = this.nonce();
      const res = await this.fetchImpl(`${this.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: this.headers(nonce, selection.revision),
        body: requestText,
        redirect: 'error',
        signal: controller.signal,
      });

      if (!this.isOk(res) || !res.body) {
        throw this.refused('stream', res);
      }

      const reader = res.body.getReader();
      const responseChunks: Uint8Array[] = [];
      let responseLength = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          responseChunks.push(value);
          responseLength += value.byteLength;
        }
      } finally {
        reader.releaseLock();
      }
      const responseBytes = this.joinChunks(responseChunks, responseLength);
      await this.verifyResponse(res, requestText, responseBytes, selection, nonce, 'generate');
      const responseText = new TextDecoder().decode(responseBytes);
      for (const line of responseText.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice('data: '.length);
        if (payload === '[DONE]') return;
        const chunk = this.parseJson(payload, chatStreamChunkSchema, 'stream');
        const token = chunk.choices[0]?.delta?.content;
        if (token) yield token;
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
    selection: InferenceModelSelection,
    prompt: string,
    options: StructuredOptions,
  ): Record<string, unknown> {
    const { tool } = options;
    const body: Record<string, unknown> = {
      model: selection.model,
      model_revision: selection.revision,
      messages: this.messages(prompt, options),
      max_tokens: options.maxTokens,
      temperature: options.temperature,
      reasoning_effort: reasoningEffortFor(selection.model, 'structured'),
      stream: false,
      // Present in both modes: this is the ACI-verification flag, not part of the response shape.
      ...(this.publicAciRequired ? { provider: { aci_verified: true } } : {}),
    };
    if (this.structuredOutputMode === 'json_schema') {
      body['response_format'] = {
        type: 'json_schema',
        json_schema: { name: tool.name, strict: true, schema: tool.parameters },
      };
      return body;
    }
    body['tools'] = [
      {
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      },
    ];
    body['tool_choice'] = { type: 'function', function: { name: tool.name } };
    return body;
  }

  private parseJsonSchemaArguments(data: ChatResponse): Record<string, unknown> {
    const raw = this.structuredText(data.choices[0]);
    if (raw === undefined) this.throwInvalidStructuredOutput();

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      this.throwInvalidStructuredOutput();
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      this.throwInvalidStructuredOutput();
    }
    return parsed as Record<string, unknown>;
  }

  private throwInvalidStructuredOutput(): never {
    throw new Error(`${this.label} returned invalid structured output`);
  }

  // A forced tool call returns its JSON in `tool_calls[0].function.arguments`; some models
  // instead inline the object in `content`, so fall back to parsing the first JSON object there.
  private parseToolArguments(data: ChatResponse, toolName: string): ParsedToolArguments {
    const raw = this.structuredText(data.choices[0]);
    if (raw === undefined) {
      throw new Error(`${this.label} returned no tool call for "${toolName}"`);
    }
    try {
      return JSON.parse(extractJsonObject(raw)) as ParsedToolArguments;
    } catch {
      this.throwInvalidStructuredOutput();
    }
  }

  private structuredText(choice: ChatChoice | undefined): string | undefined {
    const message = choice?.message;
    const raw = message?.tool_calls?.[0]?.function.arguments ?? message?.content ?? undefined;
    if (raw === undefined) this.assertNotExhausted(choice);
    return raw;
  }

  // A cut-off answer is never returned as finished prose; `null` content never reaches a caller.
  private choiceContent(choice: ChatChoice | undefined): string {
    this.assertNotExhausted(choice);
    const content = choice?.message?.content;
    if (typeof content !== 'string') throw new Error(`${this.label} returned no content`);
    return content;
  }

  private assertNotExhausted(choice: ChatChoice | undefined): void {
    if (choice?.finish_reason === LENGTH_FINISH_REASON) {
      throw new Error(`${this.label} exhausted its output tokens`);
    }
  }

  // Cost telemetry must never be able to break inference, so a throwing sink is swallowed — and
  // only these five fields cross, so an upstream that returns extra `usage` keys cannot smuggle them.
  private recordUsage(
    model: string,
    operation: InferenceOperation,
    usage: OpenAIUsage | undefined,
  ): void {
    if (!this.usageSink) return;
    try {
      this.usageSink({
        model,
        operation,
        promptTokens: this.tokenCount(usage?.prompt_tokens),
        completionTokens: this.tokenCount(usage?.completion_tokens),
        cached: false,
      });
    } catch {
      // Deliberately silent: the error could quote an upstream body.
    }
  }

  private tokenCount(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
    return Math.min(Math.trunc(value), MAX_TOKENS_PER_CALL);
  }

  protected headers(nonce?: string, revision?: string): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) h['Authorization'] = `Bearer ${this.apiKey}`;
    if (nonce) h['X-Folklore-Inference-Nonce'] = nonce;
    if (revision) h['X-Folklore-Inference-Model-Revision'] = revision;
    return h;
  }

  protected resolveEmbedSelection(options?: EmbedOptions): InferenceModelSelection {
    return {
      model: options?.model ?? this.embedModel,
      revision: options?.modelRevision ?? this.embedModelRevision,
      role: options?.modelRole,
    };
  }

  private attestationContext(selection: InferenceModelSelection, endpoint: string) {
    return {
      model: selection.model,
      modelRevision: selection.revision,
      modelRole: selection.role,
      endpoint,
    } as const;
  }

  protected resolveGenerateSelection(options?: GenerateOptions): InferenceModelSelection {
    return {
      model: options?.model ?? this.generateModel,
      revision: options?.modelRevision ?? this.generateModelRevision,
      role: options?.modelRole,
    };
  }

  protected resolveStructuredSelection(options: StructuredOptions): InferenceModelSelection {
    return this.resolveGenerateSelection(options);
  }

  protected isOk(res: { status: number }): boolean {
    return res.status >= 200 && res.status < 300;
  }

  // The sentence stays fixed so failure codes can name the status; the body may echo the prompt.
  private refused(operation: string, res: Response): ProviderHttpError {
    return ProviderHttpError.fromResponse(`${this.label} ${operation} failed: ${res.status}`, res);
  }

  // Fail-closed model guard: a config typo or an unverified-model swap throws before any
  // customer content is sent, never after. The model id is config, not content.
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

  private async readResponse(res: Response): Promise<Uint8Array> {
    return new Uint8Array(await res.arrayBuffer());
  }

  private parseResponse<T>(
    raw: Uint8Array,
    schema: ZodType<T, ZodTypeDef, unknown>,
    kind: ResponseKind,
  ): T {
    return this.parseJson(new TextDecoder().decode(raw), schema, kind);
  }

  // A JSON parser's message can quote the body, so neither it nor the schema issues are kept.
  private parseJson<T>(
    text: string,
    schema: ZodType<T, ZodTypeDef, unknown>,
    kind: ResponseKind,
  ): T {
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      throw this.malformed(kind);
    }
    const parsed = schema.safeParse(value);
    if (!parsed.success) throw this.malformed(kind);
    return parsed.data;
  }

  private malformed(kind: ResponseKind): Error {
    return new Error(`${this.label} returned a malformed ${kind} response`);
  }

  private async verifyResponse(
    res: Response,
    requestText: string,
    responseBytes: Uint8Array,
    selection: InferenceModelSelection,
    nonce: string,
    operation: InferenceOperation,
  ): Promise<void> {
    const verifier = this.responseVerifier;
    if (!verifier) return;
    await this.timed('verify_receipt', selection, operation, () =>
      verifier.verifyReceipt(this.receiptId(res), {
        requestSha256: this.sha256(new TextEncoder().encode(requestText)),
        responseSha256: this.sha256(responseBytes),
        model: selection.model,
        modelRevision: selection.revision,
        modelRole: selection.role,
        nonce,
      }),
    );
  }

  private async attest(
    selection: InferenceModelSelection,
    operation: InferenceOperation,
    endpoint: string,
  ): Promise<void> {
    const verifier = this.responseVerifier;
    if (!verifier) return;
    await this.timed('attest', selection, operation, () =>
      verifier.ensureAttested(this.attestationContext(selection, endpoint)),
    );
  }

  private timed<T>(
    phase: InferenceCallPhase,
    selection: InferenceModelSelection,
    operation: InferenceOperation,
    step: () => Promise<T>,
  ): Promise<T> {
    if (!this.timer) return step();
    const label = {
      model: selection.model,
      operation,
      ...(selection.role ? { role: selection.role } : {}),
    };
    return this.timer(phase, label, step);
  }

  private nonce(): string {
    return randomBytes(32).toString('base64');
  }

  private sha256(value: Uint8Array): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private joinChunks(chunks: readonly Uint8Array[], length: number): Uint8Array {
    const joined = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      joined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return joined;
  }
}
