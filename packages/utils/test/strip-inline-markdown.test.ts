// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { stripInlineMarkdown } from '../src/text.js';

describe('stripInlineMarkdown', () => {
  it('reduces links to their text and drops images', () => {
    expect(stripInlineMarkdown('See [the doc](https://x.example) ![chart](c.png) now')).toBe(
      'See the doc now',
    );
  });

  it('removes emphasis and code span delimiters', () => {
    expect(stripInlineMarkdown('**bold** and _soft_ and ~~gone~~ and `code`')).toBe(
      'bold and soft and gone and code',
    );
  });

  it('keeps delimiters that are not emphasis', () => {
    expect(stripInlineMarkdown('snake_case and 2*3')).toBe('snake_case and 2*3');
  });

  it('collapses whitespace', () => {
    expect(stripInlineMarkdown('  a \n  b ')).toBe('a b');
  });
});
