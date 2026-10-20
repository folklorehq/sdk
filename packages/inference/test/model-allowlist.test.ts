// SPDX-License-Identifier: Apache-2.0
import { INFERENCE_MODEL_CATALOG } from '@folklore/contracts';
import { describe, expect, it } from 'vitest';
import { DEFAULT_VERIFIED_MODELS, parseModelAllowlist } from '../src/model-allowlist.js';

describe('parseModelAllowlist', () => {
  it('returns the fallback when the value is unset', () => {
    expect(parseModelAllowlist(undefined)).toEqual(DEFAULT_VERIFIED_MODELS);
  });

  it('falls back to the verified default on an empty/whitespace value (never widens the guard)', () => {
    expect(parseModelAllowlist('')).toEqual(DEFAULT_VERIFIED_MODELS);
    expect(parseModelAllowlist('  ,  ')).toEqual(DEFAULT_VERIFIED_MODELS);
  });

  it('parses a comma-separated list and trims entries', () => {
    expect(parseModelAllowlist('a/one, b/two ,c/three')).toEqual(['a/one', 'b/two', 'c/three']);
  });

  it('honors an explicit custom fallback', () => {
    expect(parseModelAllowlist(undefined, ['only/model'])).toEqual(['only/model']);
  });

  it('includes the live-verified confidential models by default', () => {
    expect(DEFAULT_VERIFIED_MODELS).toEqual([
      'moonshotai/kimi-k3',
      'moonshotai/kimi-k2.6',
      'z-ai/glm-5.3',
      'z-ai/glm-5.2',
      'z-ai/glm-5.1',
      'qwen/qwen3-32b',
      'qwen/qwen3-embedding-8b',
    ]);
  });
});

describe('DEFAULT_VERIFIED_MODELS', () => {
  it('is priced in the inference catalog under provider phala', () => {
    for (const model of DEFAULT_VERIFIED_MODELS) {
      expect(Object.hasOwn(INFERENCE_MODEL_CATALOG, model), model).toBe(true);
      expect(INFERENCE_MODEL_CATALOG[model].provider).toBe('phala');
    }
  });
});
