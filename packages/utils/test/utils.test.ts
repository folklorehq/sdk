// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { deterministicUuid, sha256Hex } from '../src/hash.js';
import { canonicalJson, canonicalJsonHash } from '../src/canonical-json.js';
import { collapseWhitespace, escapeRegExp, initials, truncate } from '../src/text.js';
import { toVectorLiteral } from '../src/vector.js';
import { mulberry32, seedFromString } from '../src/random.js';
import { mapWithConcurrency } from '../src/async.js';

describe('mapWithConcurrency', () => {
  it('preserves input order in the result', async () => {
    const out = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (n) => n * 10);
    expect(out).toEqual([10, 20, 30, 40, 50]);
  });

  it('never runs more than `limit` tasks at once', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapWithConcurrency([1, 2, 3, 4, 5, 6], 2, async (n) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      return n;
    });
    expect(peak).toBeLessThanOrEqual(2);
  });
});

describe('hash', () => {
  it('sha256Hex is stable and hex', () => {
    expect(sha256Hex('abc')).toBe(sha256Hex('abc'));
    expect(sha256Hex('abc')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('deterministicUuid is stable and well-formed', () => {
    const a = deterministicUuid('theme', 'container-1');
    expect(a).toBe(deterministicUuid('theme', 'container-1'));
    expect(a).not.toBe(deterministicUuid('theme', 'container-2'));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe('canonical JSON', () => {
  it('orders object keys recursively before hashing', () => {
    expect(canonicalJson({ b: [2, { z: true, a: null }], a: 'one' })).toBe(
      '{"a":"one","b":[2,{"a":null,"z":true}]}',
    );
    expect(canonicalJsonHash({ a: 'one', b: [2, { a: null, z: true }] })).toBe(
      canonicalJsonHash({ b: [2, { z: true, a: null }], a: 'one' }),
    );
  });
});

describe('random', () => {
  it('mulberry32 yields a stable known sequence for a fixed seed', () => {
    const next = mulberry32(12345);
    expect([next(), next(), next(), next()]).toEqual([
      0.9797282677609473, 0.3067522644996643, 0.484205421525985, 0.817934412509203,
    ]);
  });

  it('mulberry32 is deterministic across instances', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('seedFromString folds a string into a char-code sum', () => {
    expect(seedFromString('abc')).toBe(294);
  });
});

describe('vector', () => {
  it('renders a pgvector literal', () => {
    expect(toVectorLiteral([1, 2, 3])).toBe('[1,2,3]');
  });
});

describe('text', () => {
  it('collapses whitespace', () => {
    expect(collapseWhitespace('  a\n  b\t c ')).toBe('a b c');
  });
  it('truncates with an ellipsis', () => {
    expect(truncate('hello world', 5)).toBe('hello…');
    expect(truncate('  hi  ', 10)).toBe('hi');
  });
  it('takes up to two leading initials', () => {
    expect(initials('Ada Lovelace')).toBe('AL');
    expect(initials('Grace Brewster Hopper')).toBe('GB');
    expect(initials('Cher')).toBe('C');
  });
  it('escapes regex metacharacters', () => {
    expect(escapeRegExp('a.b*c')).toBe('a\\.b\\*c');
    expect(new RegExp(escapeRegExp('a.b')).test('axb')).toBe(false);
  });
});
