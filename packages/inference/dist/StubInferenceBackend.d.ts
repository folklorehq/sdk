import type { InferenceBackend, EmbedOptions, GenerateOptions, StructuredOptions } from './ports.js';
/** Dev-only stub backend for testing the ingestion pipeline without a real LLM. */
export declare class StubInferenceBackend implements InferenceBackend {
    private tokenize;
    private hashWord;
    embed(text: string, _options?: EmbedOptions): Promise<number[]>;
    generate(_prompt: string, _options?: GenerateOptions): Promise<string>;
    generateStructured(_prompt: string, _options: StructuredOptions): Promise<unknown>;
    stream(_prompt: string, _options?: GenerateOptions): AsyncIterable<string>;
    close(): Promise<void>;
}
//# sourceMappingURL=StubInferenceBackend.d.ts.map