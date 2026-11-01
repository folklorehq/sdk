// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { formatList } from '../src/text.js';

describe('formatList', () => {
  it('returns an empty string for no items', () => {
    expect(formatList([])).toBe('');
  });

  it('returns a single item as is', () => {
    expect(formatList(['Cursor'])).toBe('Cursor');
  });

  it('joins two items with "and"', () => {
    expect(formatList(['Claude Desktop', 'Cursor'])).toBe('Claude Desktop and Cursor');
  });

  it('separates the leading items with commas and joins the last with "and", without a serial comma', () => {
    expect(formatList(['Claude Desktop', 'Claude Code', 'Cursor'])).toBe(
      'Claude Desktop, Claude Code and Cursor',
    );
    expect(formatList(['a', 'b', 'c', 'd'])).toBe('a, b, c and d');
  });
});
