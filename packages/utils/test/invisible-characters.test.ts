// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  INVISIBLE_CHARACTER_CLASS,
  hasInvisibleCharacter,
  stripInvisibleCharacters,
} from '../src/text.js';

const INVISIBLE = ['\u200B', '\u200C', '\u200D', '\u2060', '\uFEFF'];

describe('invisible characters', () => {
  it('names the class as escapes so it can be embedded in a pattern', () => {
    expect(INVISIBLE_CHARACTER_CLASS).toBe('\\u200B-\\u200D\\u2060\\uFEFF');
    expect(new RegExp(`^[${INVISIBLE_CHARACTER_CLASS}]$`).test('\u200C')).toBe(true);
  });

  it.each(INVISIBLE)('detects and strips %s', (char) => {
    expect(hasInvisibleCharacter(`a${char}b`)).toBe(true);
    expect(stripInvisibleCharacters(`a${char}b`)).toBe('ab');
  });

  it('leaves visible text alone, and repeated calls keep no regex state', () => {
    expect(hasInvisibleCharacter('plain text')).toBe(false);
    expect(hasInvisibleCharacter('a\u200Bb')).toBe(true);
    expect(hasInvisibleCharacter('a\u200Bb')).toBe(true);
    expect(stripInvisibleCharacters('a\u200Bb\u200Bc')).toBe('abc');
    expect(stripInvisibleCharacters('a\u200Bb\u200Bc')).toBe('abc');
  });
});
