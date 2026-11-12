// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  RFC_UUID_PATTERN_SOURCE,
  isLowercaseRfcUuid,
  isRfcUuid,
  uuidV7Millis,
} from '../src/uuid.js';

const V8_POOL_ID = '018f2e3d-4c5b-8a69-b7c8-d9e0f1a2b3c4';

describe('isRfcUuid', () => {
  it.each([
    V8_POOL_ID,
    '0193a1b2-c3d4-8e5f-9a6b-7c8d9e0f1a2b',
    '22222222-2222-4222-8222-222222222222',
    '4dca5f02-5e18-596a-bdea-fa5de2c6a61c',
    '018F2E3D-4C5B-8A69-B7C8-D9E0F1A2B3C4',
  ])('accepts an RFC 9562 version 1-8 id %s', (value) => {
    expect(isRfcUuid(value)).toBe(true);
  });

  it.each([
    '00000000-0000-0000-0000-000000000000',
    '018f2e3d-4c5b-0a69-b7c8-d9e0f1a2b3c4',
    '018f2e3d-4c5b-9a69-b7c8-d9e0f1a2b3c4',
    '018f2e3d-4c5b-8a69-c7c8-d9e0f1a2b3c4',
    '018f2e3d4c5b8a69b7c8d9e0f1a2b3c4',
    ` ${V8_POOL_ID}`,
    'not-a-uuid',
  ])('refuses nil, unknown-version, non-RFC-variant or malformed %s', (value) => {
    expect(isRfcUuid(value)).toBe(false);
  });

  it('exposes the same pattern for composition into route matchers', () => {
    const matcher = new RegExp(`^/x/(${RFC_UUID_PATTERN_SOURCE})$`, 'i');
    expect(matcher.exec(`/x/${V8_POOL_ID}`)?.[1]).toBe(V8_POOL_ID);
    expect(matcher.test('/x/018f2e3d-4c5b-9a69-b7c8-d9e0f1a2b3c4')).toBe(false);
  });
});

describe('id case and version helpers', () => {
  it('refuses an uppercase id as lowercase and reads the 48-bit timestamp of a v7 id in either case', () => {
    expect(isLowercaseRfcUuid(V8_POOL_ID)).toBe(true);
    expect(isLowercaseRfcUuid(V8_POOL_ID.toUpperCase())).toBe(false);
    expect(isLowercaseRfcUuid('018f2e3d-4c5b-9a69-b7c8-d9e0f1a2b3c4')).toBe(false);
    expect(uuidV7Millis('01900000-0000-7000-8000-000000000001')).toBe(0x019000000000);
    expect(uuidV7Millis('0190ABCD-EF01-7123-9ABC-DEF012345678')).toBe(0x0190abcdef01);
    expect(uuidV7Millis(V8_POOL_ID)).toBeNull();
    expect(uuidV7Millis('01900000-0000-7000-c000-000000000001')).toBeNull();
    expect(uuidV7Millis('link-1')).toBeNull();
  });
});
