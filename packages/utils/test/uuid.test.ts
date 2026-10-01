// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { RFC_UUID_PATTERN_SOURCE, isRfcUuid } from '../src/uuid.js';

const V8_POOL_ID = 'c0626b90-f744-863b-9254-c3ba1d8dd760';

describe('isRfcUuid', () => {
  it.each([
    V8_POOL_ID,
    '42c6d7ec-ff31-86af-8d3d-5544b072d90a',
    '22222222-2222-4222-8222-222222222222',
    '4dca5f02-5e18-596a-bdea-fa5de2c6a61c',
    'C0626B90-F744-863B-9254-C3BA1D8DD760',
  ])('accepts an RFC 9562 version 1-8 id %s', (value) => {
    expect(isRfcUuid(value)).toBe(true);
  });

  it.each([
    '00000000-0000-0000-0000-000000000000',
    'c0626b90-f744-063b-9254-c3ba1d8dd760',
    'c0626b90-f744-963b-9254-c3ba1d8dd760',
    'c0626b90-f744-863b-c254-c3ba1d8dd760',
    'c0626b90f744863b9254c3ba1d8dd760',
    ` ${V8_POOL_ID}`,
    'not-a-uuid',
  ])('refuses nil, unknown-version, non-RFC-variant or malformed %s', (value) => {
    expect(isRfcUuid(value)).toBe(false);
  });

  it('exposes the same pattern for composition into route matchers', () => {
    const matcher = new RegExp(`^/x/(${RFC_UUID_PATTERN_SOURCE})$`, 'i');
    expect(matcher.exec(`/x/${V8_POOL_ID}`)?.[1]).toBe(V8_POOL_ID);
    expect(matcher.test('/x/c0626b90-f744-963b-9254-c3ba1d8dd760')).toBe(false);
  });
});
