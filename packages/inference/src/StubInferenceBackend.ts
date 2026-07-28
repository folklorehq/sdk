// SPDX-License-Identifier: Apache-2.0
import type {
  InferenceBackend,
  EmbedOptions,
  GenerateOptions,
  StructuredOptions,
} from './ports.js';

const STUB_DIM = 768;
const NUM_HASHES = 8;

const STOP_WORDS = new Set([
  'the',
  'a',
  'an',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'of',
  'in',
  'to',
  'for',
  'on',
  'at',
  'by',
  'with',
  'from',
  'this',
  'that',
  'these',
  'those',
  'and',
  'or',
  'but',
  'not',
  'it',
  'its',
  'as',
  'we',
  'our',
  'you',
  'your',
  'they',
  'their',
  'can',
  'also',
  'just',
  'about',
  'after',
  'all',
  'into',
  'than',
  'then',
  'up',
  'out',
  'so',
  'if',
  'no',
  'yes',
]);

/** Dev-only stub backend for testing the ingestion pipeline without a real LLM. */
export class StubInferenceBackend implements InferenceBackend {
  private tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
  }

  // FNV-1a 32-bit with a per-hash seed so each "projection" uses a different hash.
  private hashWord(word: string, seed: number): number {
    let h = (2166136261 ^ seed) >>> 0;
    for (let i = 0; i < word.length; i++) {
      h = ((h ^ word.charCodeAt(i)) * 16777619) >>> 0;
    }
    return h % STUB_DIM;
  }

  async embed(text: string, _options?: EmbedOptions): Promise<number[]> {
    const vec = new Float64Array(STUB_DIM);
    const tokens = this.tokenize(text);

    for (const token of tokens) {
      for (let s = 0; s < NUM_HASHES; s++) {
        const pos = this.hashWord(token, s);
        vec[pos] = (vec[pos] ?? 0) + 1.0 / Math.sqrt(NUM_HASHES);
      }
    }

    const norm = Math.sqrt(Array.from(vec).reduce((s, v) => s + v * v, 0));
    if (norm === 0) {
      // Empty or all-stopword text: return a sparse sentinel vector at dim 0.
      vec[0] = 1;
      return Array.from(vec);
    }
    return Array.from(vec).map((v) => v / norm);
  }

  async generate(_prompt: string, _options?: GenerateOptions): Promise<string> {
    return '{"name":"stub-theme","summary":"stub"}';
  }

  async generateStructured(_prompt: string, _options: StructuredOptions): Promise<unknown> {
    return {};
  }

  async *stream(_prompt: string, _options?: GenerateOptions): AsyncIterable<string> {
    yield '{"name":"stub-theme","summary":"stub"}';
  }

  async close(): Promise<void> {}
}
