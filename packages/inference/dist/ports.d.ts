/** InferenceBackend port — all inference MUST happen inside the customer's box; sending fact content to an external API is structurally prohibited (ADL #15/#16/#19). */
export interface EmbedOptions {
    /** Override the default embedding model for this call. */
    model?: string;
}
export interface GenerateOptions {
    /** Override the default generation model for this call. */
    model?: string;
    /** System prompt to prepend before the user prompt. */
    systemPrompt?: string;
    /** Maximum number of tokens to generate. */
    maxTokens?: number;
    /** Sampling temperature (0 = deterministic, higher = more creative). */
    temperature?: number;
    /** Coarse task class for tiered model routing (picks a small/large model); ignored by non-routing backends. */
    task?: InferenceTask;
}
/** Coarse task classes for tiered routing — the first group is cheap/structured, the last two need a frontier model. */
export type InferenceTask = 'labeling' | 'noise-filter' | 'classification' | 'extraction' | 'synthesis' | 'query';
/** One forced function the model must call, returning a single JSON object argument. */
export interface ToolSpec {
    name: string;
    description: string;
    /** JSON Schema for the tool's single object argument (the structured output shape). */
    parameters: Record<string, unknown>;
}
export interface StructuredOptions extends GenerateOptions {
    tool: ToolSpec;
}
export interface AttestationReport {
    /** Hex-encoded TDX attestation quote issued by the Phala dstack daemon. */
    quote: string;
    /** ISO 8601 timestamp of when the quote was obtained. */
    timestamp: string;
}
/** Proves an inference response came from a TEE-verified (confidential) upstream (ADL #30/#40). */
export interface InferenceResponseVerifier {
    /** Pin + verify the gateway's ACI attestation once; throws (fail-closed) if unverifiable. */
    ensureAttested(): Promise<void>;
    /** Verify the per-response receipt for `receiptId`; throws if it is missing or unverified. */
    verifyReceipt(receiptId: string | null): Promise<void>;
}
export interface InferenceBackend {
    /** Generate a fixed-size embedding vector for the given text. */
    embed(text: string, options?: EmbedOptions): Promise<number[]>;
    /** Generate a completion for the given prompt and return the full response string. */
    generate(prompt: string, options?: GenerateOptions): Promise<string>;
    /** Force a tool call and return its parsed JSON argument; optional (a backend may omit it). */
    generateStructured?(prompt: string, options: StructuredOptions): Promise<unknown>;
    /** Stream a completion token by token. */
    stream(prompt: string, options?: GenerateOptions): AsyncIterable<string>;
    /** Return a TEE attestation report for the current CVM, or null if not running inside a TEE. */
    getAttestationReport?(): Promise<AttestationReport | null>;
    /** Release any resources held by the backend (connections, timers, etc.). */
    close(): Promise<void>;
}
//# sourceMappingURL=ports.d.ts.map