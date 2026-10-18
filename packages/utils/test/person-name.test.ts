// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { normalizePersonName } from '../src/person-name.js';

describe('normalizePersonName', () => {
  it('folds accents and case', () => {
    expect(normalizePersonName('José  Núñez')).toBe('jose nunez');
    expect(normalizePersonName('José  Núñez')).toBe(normalizePersonName('jose nunez'));
  });

  it('folds full-width letters and the ideographic space', () => {
    expect(normalizePersonName('ＪＯＨＮ　ＤＯＥ')).toBe('john doe');
  });

  it('folds the sharp s through its upper-case form', () => {
    expect(normalizePersonName('Straße')).toBe(normalizePersonName('STRASSE'));
  });

  it('collapses tabs and newlines to one space', () => {
    expect(normalizePersonName('Ada\t\n Lovelace')).toBe('ada lovelace');
  });

  it('trims edge whitespace', () => {
    expect(normalizePersonName('  Ada Lovelace \n')).toBe('ada lovelace');
  });

  it.each(['', '   ', '\t\n'])('gives null for blank input %j', (blank) => {
    expect(normalizePersonName(blank)).toBeNull();
  });

  it('folds precomposed and combining forms of the same name', () => {
    expect(normalizePersonName('Zoë')).toBe(normalizePersonName('Zoë'));
  });

  it('gives null for a name that is only combining marks and whitespace', () => {
    expect(normalizePersonName(' ́ ')).toBeNull();
  });
});
