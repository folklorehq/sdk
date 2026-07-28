// SPDX-License-Identifier: Apache-2.0
import { extractJsonObject } from '@folklore/utils';
import { ACI_RECEIPT_ID_HEADER } from './aci-verifier.js';
const DEFAULT_EMBED_MODEL = 'nomic-embed-text';
const DEFAULT_GENERATE_MODEL = 'qwen2.5:7b';
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_LABEL = 'OpenAI-compatible endpoint';
const STREAM_TIMEOUT_MULTIPLIER = 5;
/** Technology-agnostic OpenAI-compatible client; carries no TEE attestation — use `TeeEndpointBackend` when that's needed. */
export class OpenAICompatBackend {
    baseUrl;
    apiKey;
    embedModel;
    generateModel;
    embedDimensions;
    timeoutMs;
    label;
    modelAllowlist;
    responseVerifier;
    telemetry;
    constructor(config) {
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
    async embed(text, options) {
        const model = options?.model ?? this.embedModel;
        this.assertModelAllowed(model);
        await this.responseVerifier?.ensureAttested();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);
        const start = Date.now();
        try {
            const body = { model, input: text };
            // Only request matryoshka truncation when a dimension is explicitly configured;
            // providers like RedPill/qwen return their native dimension and reject the param.
            if (this.embedDimensions !== undefined)
                body['dimensions'] = this.embedDimensions;
            const res = await fetch(`${this.baseUrl}/v1/embeddings`, {
                method: 'POST',
                headers: this.headers(),
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            if (!this.isOk(res)) {
                throw new Error(`${this.label} embed failed: ${res.status}`);
            }
            const data = (await res.json());
            const embedding = data.data[0]?.embedding;
            if (!embedding)
                throw new Error(`${this.label} returned no embedding`);
            if (this.embedDimensions !== undefined && embedding.length !== this.embedDimensions) {
                throw new Error(`${this.label} returned ${embedding.length}-dim embedding, expected ${this.embedDimensions}`);
            }
            await this.responseVerifier?.verifyReceipt(this.receiptId(res));
            this.telemetry?.track('inference.embed', 'system', { model, latencyMs: Date.now() - start });
            return embedding;
        }
        catch (err) {
            this.telemetry?.track('inference.error', 'system', { model, errorType: 'embed_failed' });
            throw err;
        }
        finally {
            clearTimeout(timer);
        }
    }
    async generate(prompt, options) {
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
            const data = (await res.json());
            const content = data.choices[0]?.message?.content;
            if (content === undefined)
                throw new Error(`${this.label} returned no content`);
            await this.responseVerifier?.verifyReceipt(this.receiptId(res));
            this.telemetry?.track('inference.generate', 'system', {
                model,
                latencyMs: Date.now() - start,
            });
            return content;
        }
        catch (err) {
            this.telemetry?.track('inference.error', 'system', { model, errorType: 'generate_failed' });
            throw err;
        }
        finally {
            clearTimeout(timer);
        }
    }
    async generateStructured(prompt, options) {
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
            const data = (await res.json());
            const parsed = this.parseToolArguments(data, options.tool.name);
            await this.responseVerifier?.verifyReceipt(this.receiptId(res));
            this.telemetry?.track('inference.generate', 'system', {
                model,
                latencyMs: Date.now() - start,
            });
            return parsed;
        }
        catch (err) {
            this.telemetry?.track('inference.error', 'system', { model, errorType: 'structured_failed' });
            throw err;
        }
        finally {
            clearTimeout(timer);
        }
    }
    async *stream(prompt, options) {
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
                    if (done)
                        break;
                    buffer += decoder.decode(value, { stream: true });
                    const lines = buffer.split('\n');
                    buffer = lines.pop() ?? '';
                    for (const line of lines) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data: '))
                            continue;
                        const payload = trimmed.slice('data: '.length);
                        if (payload === '[DONE]')
                            return;
                        const chunk = JSON.parse(payload);
                        const token = chunk.choices[0]?.delta?.content;
                        if (token)
                            yield token;
                    }
                }
            }
            finally {
                reader.releaseLock();
            }
        }
        finally {
            clearTimeout(timer);
        }
    }
    async close() {
        // Stateless HTTP client — nothing to tear down.
    }
    messages(prompt, options) {
        const messages = [];
        if (options?.systemPrompt)
            messages.push({ role: 'system', content: options.systemPrompt });
        messages.push({ role: 'user', content: prompt });
        return messages;
    }
    toolRequestBody(model, prompt, options) {
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
    parseToolArguments(data, toolName) {
        const message = data.choices[0]?.message;
        const raw = message?.tool_calls?.[0]?.function.arguments ?? message?.content ?? undefined;
        if (raw === undefined || raw === null) {
            throw new Error(`${this.label} returned no tool call for "${toolName}"`);
        }
        return JSON.parse(extractJsonObject(raw));
    }
    headers() {
        const h = { 'Content-Type': 'application/json' };
        if (this.apiKey)
            h['Authorization'] = `Bearer ${this.apiKey}`;
        return h;
    }
    isOk(res) {
        return res.status >= 200 && res.status < 300;
    }
    // Fail-closed model guard: a config typo or an unverified-model swap throws before any
    // customer content is sent, never after. The model id is config, not content.
    assertModelAllowed(model) {
        if (this.modelAllowlist && !this.modelAllowlist.includes(model)) {
            this.telemetry?.track('inference.model_rejected', 'system', { model });
            throw new Error(`${this.label} refused model "${model}": not in the verified-model allowlist`);
        }
    }
    receiptId(res) {
        return res.headers?.get(ACI_RECEIPT_ID_HEADER) ?? null;
    }
}
//# sourceMappingURL=openai-compat.js.map