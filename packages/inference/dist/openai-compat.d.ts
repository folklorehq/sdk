import type { TelemetryClient } from '@folklore/telemetry';
import type { EmbedOptions, GenerateOptions, InferenceBackend, InferenceResponseVerifier, StructuredOptions } from './ports.js';
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
/** Technology-agnostic OpenAI-compatible client; carries no TEE attestation — use `TeeEndpointBackend` when that's needed (ADL #15/#16/#19). */
export declare class OpenAICompatBackend implements InferenceBackend {
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
    constructor(config: OpenAICompatConfig);
    embed(text: string, options?: EmbedOptions): Promise<number[]>;
    generate(prompt: string, options?: GenerateOptions): Promise<string>;
    generateStructured(prompt: string, options: StructuredOptions): Promise<unknown>;
    stream(prompt: string, options?: GenerateOptions): AsyncIterable<string>;
    close(): Promise<void>;
    private messages;
    private toolRequestBody;
    private parseToolArguments;
    protected headers(): Record<string, string>;
    protected isOk(res: {
        status: number;
    }): boolean;
    private assertModelAllowed;
    private receiptId;
}
//# sourceMappingURL=openai-compat.d.ts.map