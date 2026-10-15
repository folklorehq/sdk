// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  CLEAR_ENTITY_PATTERN,
  HASHED_ENTITY_PATTERN,
  HASHED_ENTITY_PREFIX,
  isClearEntity,
  isStorableEntity,
} from '../src/index.js';

const CLEAR = ['issue:42', 'pr#7', 'issue:123456'];
const NOT_CLEAR = [
  'issue:1234567',
  'PR#7',
  'acme/web',
  'src/app.ts',
  'finance/layoffs q3.xlsx',
  'pages/[id].tsx',
  'C024BE91L',
  '',
];
const HASHED = `${HASHED_ENTITY_PREFIX}${'0123456789abcdef'.repeat(2)}`;

describe('isClearEntity', () => {
  it.each(CLEAR)('keeps the numeric ref %s readable', (entity) => {
    expect(isClearEntity(entity)).toBe(true);
  });

  it.each(NOT_CLEAR)('refuses %j as a readable entity', (entity) => {
    expect(isClearEntity(entity)).toBe(false);
  });

  it('refuses a hashed entity as readable', () => {
    expect(isClearEntity(HASHED)).toBe(false);
  });
});

describe('isStorableEntity', () => {
  it.each([...CLEAR, HASHED])('stores %s', (entity) => {
    expect(isStorableEntity(entity)).toBe(true);
  });

  it.each([
    ...NOT_CLEAR,
    `${HASHED_ENTITY_PREFIX}${'a'.repeat(31)}`,
    `${HASHED_ENTITY_PREFIX}${'a'.repeat(33)}`,
    `${HASHED_ENTITY_PREFIX}${'A'.repeat(32)}`,
    `${HASHED_ENTITY_PREFIX}${'g'.repeat(32)}`,
    `x${HASHED}`,
  ])('refuses %j', (entity) => {
    expect(isStorableEntity(entity)).toBe(false);
  });

  it.each([7, null, undefined, {}, ['issue:4']])('refuses the non-string %j', (entity) => {
    expect(isStorableEntity(entity)).toBe(false);
  });
});

describe('entity patterns', () => {
  it('anchors both patterns so a storable form cannot be a substring of plaintext', () => {
    expect(CLEAR_ENTITY_PATTERN.source.startsWith('^')).toBe(true);
    expect(CLEAR_ENTITY_PATTERN.source.endsWith('$')).toBe(true);
    expect(HASHED_ENTITY_PATTERN.source.startsWith('^')).toBe(true);
    expect(HASHED_ENTITY_PATTERN.source.endsWith('$')).toBe(true);
  });

  it('carries no flags that would loosen a match', () => {
    expect(CLEAR_ENTITY_PATTERN.flags).toBe('');
    expect(HASHED_ENTITY_PATTERN.flags).toBe('');
  });
});
