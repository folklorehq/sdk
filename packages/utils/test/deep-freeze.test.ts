// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { deepFreeze } from '../src/deep-freeze.js';

describe('deepFreeze', () => {
  it('freezes objects and arrays all the way down and returns the same value', () => {
    const value = { a: { b: [{ c: 1 }] }, d: [1, 2] };
    expect(deepFreeze(value)).toBe(value);
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.a)).toBe(true);
    expect(Object.isFrozen(value.a.b)).toBe(true);
    expect(Object.isFrozen(value.a.b[0])).toBe(true);
    expect(Object.isFrozen(value.d)).toBe(true);
  });

  it('passes primitives and null through', () => {
    expect(deepFreeze(3)).toBe(3);
    expect(deepFreeze('x')).toBe('x');
    expect(deepFreeze(null)).toBeNull();
  });

  it('survives a cycle and shared members', () => {
    const shared = { n: 1 };
    const cyclic: { self?: unknown; shared: unknown; again: unknown } = { shared, again: shared };
    cyclic.self = cyclic;
    expect(() => deepFreeze(cyclic)).not.toThrow();
    expect(Object.isFrozen(shared)).toBe(true);
  });

  it('makes a write throw in strict mode', () => {
    const value = deepFreeze({ nested: { n: 1 } });
    expect(() => {
      (value.nested as { n: number }).n = 2;
    }).toThrow(TypeError);
  });
});
