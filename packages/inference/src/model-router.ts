// SPDX-License-Identifier: Apache-2.0
import type {
  AttestationReport,
  EmbedOptions,
  GenerateOptions,
  InferenceBackend,
  InferenceTask,
  StructuredOptions,
} from './ports.js';

/** Maps a coarse task class to the model name that should serve it. */
export type TaskModelMap = Partial<Record<InferenceTask, string>>;

/** Build a task→model map; tasks left unmapped fall through to the backend's default model. */
export function tieredTaskModels(smallModel: string, largeModel?: string): TaskModelMap {
  const map: TaskModelMap = {
    labeling: smallModel,
    'noise-filter': smallModel,
    classification: smallModel,
    extraction: smallModel,
  };
  if (largeModel !== undefined) {
    map.synthesis = largeModel;
    map.query = largeModel;
  }
  return map;
}

/** Wraps a backend and substitutes the task-configured model for untagged `generate`/`stream` calls; everything else delegates unchanged. */
export class RoutingInferenceBackend implements InferenceBackend {
  constructor(
    private readonly base: InferenceBackend,
    private readonly taskModels: TaskModelMap,
  ) {
    if (base.getAttestationReport) {
      this.getAttestationReport = (): Promise<AttestationReport | null> =>
        base.getAttestationReport!();
    }
    if (base.generateStructured) {
      this.generateStructured = (prompt: string, options: StructuredOptions): Promise<unknown> =>
        base.generateStructured!(prompt, this.routeStructured(options));
    }
  }

  embed(text: string, options?: EmbedOptions): Promise<number[]> {
    return this.base.embed(text, options);
  }

  generate(prompt: string, options?: GenerateOptions): Promise<string> {
    return this.base.generate(prompt, this.route(options));
  }

  stream(prompt: string, options?: GenerateOptions): AsyncIterable<string> {
    return this.base.stream(prompt, this.route(options));
  }

  getAttestationReport?: () => Promise<AttestationReport | null>;

  generateStructured?: (prompt: string, options: StructuredOptions) => Promise<unknown>;

  close(): Promise<void> {
    return this.base.close();
  }

  private route(options?: GenerateOptions): GenerateOptions | undefined {
    if (options?.model !== undefined || options?.task === undefined) return options;
    const model = this.taskModels[options.task];
    return model === undefined ? options : { ...options, model };
  }

  private routeStructured(options: StructuredOptions): StructuredOptions {
    const routed = this.route(options);
    return routed === undefined ? options : { ...options, ...routed };
  }
}
