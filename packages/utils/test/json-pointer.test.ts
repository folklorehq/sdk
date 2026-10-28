// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { resolveJsonPointer } from '../src/json-pointer.js';

const DOCUMENT = {
  a: [{ b: 'deep' }, 7],
  'x/y': 'slash',
  'x~y': 'tilde',
  'k~/': 'both',
  empty: '',
  nothing: null,
  text: 'abc',
};

describe('resolveJsonPointer', () => {
  it('returns the whole document for the empty pointer', () => {
    expect(resolveJsonPointer(DOCUMENT, '')).toBe(DOCUMENT);
  });

  it('walks objects and array indexes', () => {
    expect(resolveJsonPointer(DOCUMENT, '/a/0/b')).toBe('deep');
    expect(resolveJsonPointer(DOCUMENT, '/a/1')).toBe(7);
  });

  it('unescapes ~1 as a slash and ~0 as a tilde', () => {
    expect(resolveJsonPointer(DOCUMENT, '/x~1y')).toBe('slash');
    expect(resolveJsonPointer(DOCUMENT, '/x~0y')).toBe('tilde');
    expect(resolveJsonPointer(DOCUMENT, '/k~0~1')).toBe('both');
  });

  it('returns undefined for a missing key', () => {
    expect(resolveJsonPointer(DOCUMENT, '/missing')).toBeUndefined();
    expect(resolveJsonPointer(DOCUMENT, '/a/0/missing')).toBeUndefined();
  });

  it('returns undefined for an index past the end', () => {
    expect(resolveJsonPointer(DOCUMENT, '/a/2')).toBeUndefined();
  });

  it('returns undefined for a non-numeric array segment', () => {
    expect(resolveJsonPointer(DOCUMENT, '/a/first')).toBeUndefined();
    expect(resolveJsonPointer(DOCUMENT, '/a/01')).toBeUndefined();
    expect(resolveJsonPointer(DOCUMENT, '/a/-1')).toBeUndefined();
  });

  it('returns undefined when the pointer goes through a string, a null or a number', () => {
    expect(resolveJsonPointer(DOCUMENT, '/text/0')).toBeUndefined();
    expect(resolveJsonPointer(DOCUMENT, '/text/length')).toBeUndefined();
    expect(resolveJsonPointer(DOCUMENT, '/nothing/x')).toBeUndefined();
    expect(resolveJsonPointer(DOCUMENT, '/a/1/x')).toBeUndefined();
  });

  it('reads own properties only and never the prototype', () => {
    expect(resolveJsonPointer(DOCUMENT, '/__proto__')).toBeUndefined();
    expect(resolveJsonPointer(DOCUMENT, '/constructor')).toBeUndefined();
    expect(resolveJsonPointer(DOCUMENT, '/a/length')).toBeUndefined();
    expect(resolveJsonPointer({}, '/toString')).toBeUndefined();
  });

  it('reads a literal __proto__ key set as an own property', () => {
    const parsed = JSON.parse('{"__proto__":{"polluted":1}}') as unknown;
    expect(resolveJsonPointer(parsed, '/__proto__/polluted')).toBe(1);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('returns undefined for a pointer that does not start with a slash', () => {
    expect(resolveJsonPointer(DOCUMENT, 'a')).toBeUndefined();
  });

  it('keeps an empty-string value and distinguishes it from a missing key', () => {
    expect(resolveJsonPointer(DOCUMENT, '/empty')).toBe('');
    expect(resolveJsonPointer(DOCUMENT, '/nothing')).toBeNull();
  });
});
