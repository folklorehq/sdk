// SPDX-License-Identifier: Apache-2.0
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

  it('includes the three live-verified confidential models by default', () => {
    expect(DEFAULT_VERIFIED_MODELS).toEqual([
      'z-ai/glm-5.2',
      'qwen/qwen3-32b',
      'qwen/qwen3-embedding-8b',
    ]);
  });
});
