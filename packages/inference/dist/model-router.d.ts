import type { AttestationReport, EmbedOptions, GenerateOptions, InferenceBackend, InferenceTask, StructuredOptions } from './ports.js';
/** Maps a coarse task class to the model name that should serve it. */
export type TaskModelMap = Partial<Record<InferenceTask, string>>;
/** Build a task→model map; tasks left unmapped fall through to the backend's default model. */
export declare function tieredTaskModels(smallModel: string, largeModel?: string): TaskModelMap;
/** Wraps a backend and substitutes the task-configured model for untagged `generate`/`stream` calls; everything else delegates unchanged. */
export declare class RoutingInferenceBackend implements InferenceBackend {
    private readonly base;
    private readonly taskModels;
    constructor(base: InferenceBackend, taskModels: TaskModelMap);
    embed(text: string, options?: EmbedOptions): Promise<number[]>;
    generate(prompt: string, options?: GenerateOptions): Promise<string>;
    stream(prompt: string, options?: GenerateOptions): AsyncIterable<string>;
    getAttestationReport?: () => Promise<AttestationReport | null>;
    generateStructured?: (prompt: string, options: StructuredOptions) => Promise<unknown>;
    close(): Promise<void>;
    private route;
    private routeStructured;
}
//# sourceMappingURL=model-router.d.ts.map