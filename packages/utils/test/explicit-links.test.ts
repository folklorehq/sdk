// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { extractExplicitLinks } from '../src/text.js';

describe('extractExplicitLinks', () => {
  it('extracts unique URLs and issue references without changing their existing grouping', () => {
    expect(extractExplicitLinks('fixes #3, see https://example.com/x and #12')).toEqual([
      'https://example.com/x',
      '#3',
      '#12',
    ]);
  });

  it('does not treat an embedded hash as an issue reference', () => {
    expect(
      extractExplicitLinks('hash#3 and #3 again https://example.com/x https://example.com/x'),
    ).toEqual(['https://example.com/x', '#3']);
  });
});
