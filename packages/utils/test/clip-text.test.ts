// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { clipText } from '../src/text.js';

describe('clipText', () => {
  it('returns text within the limit unchanged', () => {
    expect(clipText('abc', 3)).toBe('abc');
  });

  it('cuts to the limit when there is no suffix', () => {
    expect(clipText('abcdef', 4)).toBe('abcd');
  });

  it('counts the suffix inside the limit', () => {
    expect(clipText('abcdef', 4, '…')).toBe('abc…');
  });

  it('drops a high surrogate left dangling at the cut', () => {
    expect(clipText('ab😀cd', 3)).toBe('ab');
  });

  it('keeps a surrogate pair that fits whole', () => {
    expect(clipText('ab😀cd', 4)).toBe('ab😀');
  });

  it('never splits a pair when a suffix takes the last unit', () => {
    expect(clipText('ab😀cd', 4, '…')).toBe('ab…');
  });
});
