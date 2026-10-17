// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { isRecord } from '../src/json.js';

describe('isRecord', () => {
  it('accepts a plain object and rejects null, arrays and primitives', () => {
    expect(isRecord({ a: 1 })).toBe(true);
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord('x')).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });
});
