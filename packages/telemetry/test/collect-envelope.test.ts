// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { parseCollectEnvelope } from '../src/collect-envelope.js';

const VALID = { v: 1, event: 'page_viewed', properties: { page: '/' } };

describe('parseCollectEnvelope', () => {
  it('returns the typed envelope for exactly v, event and properties', () => {
    expect(parseCollectEnvelope(VALID)).toEqual(VALID);
  });

  it.each([
    ['an unknown version', { ...VALID, v: 2 }],
    ['a string version', { ...VALID, v: '1' }],
    ['an extra key', { ...VALID, extra: 1 }],
    ['a missing key', { v: 1, event: 'page_viewed' }],
    ['a non-string event', { ...VALID, event: 7 }],
    ['array properties', { ...VALID, properties: [] }],
    ['null properties', { ...VALID, properties: null }],
    ['an array body', [VALID]],
    ['null', null],
    ['a string', 'x'],
    ['a number', 1],
  ])('refuses %s', (_name, body) => {
    expect(parseCollectEnvelope(body)).toBeUndefined();
  });

  it('refuses inherited keys that only look present', () => {
    const inherited = Object.create({ v: 1, event: 'page_viewed', properties: {} });
    expect(parseCollectEnvelope(inherited)).toBeUndefined();
  });

  it('refuses a body whose own keys include __proto__', () => {
    const body = JSON.parse('{"v":1,"event":"page_viewed","properties":{},"__proto__":{}}');
    expect(parseCollectEnvelope(body)).toBeUndefined();
  });

  it('refuses a symbol-keyed extra property', () => {
    expect(parseCollectEnvelope({ ...VALID, [Symbol('x')]: 1 })).toBeUndefined();
  });

  it('refuses a body that reuses prototype key names in place of the envelope keys', () => {
    const body = JSON.parse('{"v":1,"event":"x","constructor":{}}');
    expect(parseCollectEnvelope(body)).toBeUndefined();
  });
});
