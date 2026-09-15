// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { digest64Schema } from '@folklore/contracts';
import {
  bigintFromMonotonicRawNanosecondsV1,
  digest64FromSha256DigestV1,
  evidenceVersionTokenV1Schema,
  fixedWidthSequenceV1Schema,
  forwardAuthorityTokenV1Schema,
  forwardLeaseBindingDigestV1Schema,
  mintSha256DigestV1,
  monotonicRawNanosecondsV1FromBigInt,
  monotonicRawNanosecondsV1Schema,
  parseForwardAuthorityTokenV1,
  parseForwardLeaseBindingDigestV1,
  parseSha256DigestV1,
  s3ObjectVersionIdV1Schema,
  sha256DigestV1FromDigest64,
  sha256DigestV1Schema,
} from '../src/aci/official-aci-digests.js';

const HEX64 = 'a'.repeat(64);

describe('Sha256DigestV1', () => {
  it('parses and mints one canonical prefixed SHA-256 digest', () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const expected = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    const minted = mintSha256DigestV1(bytes);
    expect(minted).toBe(expected);
    expect(sha256DigestV1Schema.parse(minted)).toBe(minted);
  });

  it('parses a valid prefixed digest and rejects malformed values', () => {
    const value = `sha256:${HEX64}`;
    expect(parseSha256DigestV1(value)).toBe(value);
    expect(() => parseSha256DigestV1(HEX64)).toThrow();
    expect(() => parseSha256DigestV1(`sha256:${'A'.repeat(64)}`)).toThrow();
    expect(() => parseSha256DigestV1(`sha256:${'a'.repeat(63)}`)).toThrow();
    expect(() => parseSha256DigestV1(`sha256:${HEX64}extra`)).toThrow();
  });

  it('round-trips with Digest64 by adding and stripping exactly one prefix', () => {
    const digest64 = digest64Schema.parse(HEX64);
    const branded = sha256DigestV1FromDigest64(digest64);
    expect(branded).toBe(`sha256:${HEX64}`);
    expect(digest64FromSha256DigestV1(branded)).toBe(HEX64);
  });

  it('rejects a Digest64 conversion when the source is not 64 lowercase hex', () => {
    expect(() => sha256DigestV1FromDigest64('nope' as never)).toThrow();
  });

  it('rejects stripping when the prefix is missing', () => {
    expect(() => digest64FromSha256DigestV1(HEX64 as never)).toThrow();
  });
});

describe('branded custody primitives', () => {
  it('accepts a 16-digit fixed width sequence and rejects other widths', () => {
    expect(fixedWidthSequenceV1Schema.parse('0000000000000001')).toBe('0000000000000001');
    expect(() => fixedWidthSequenceV1Schema.parse('1')).toThrow();
    expect(() => fixedWidthSequenceV1Schema.parse('a'.repeat(16))).toThrow();
  });

  it('accepts non-empty S3 version id and evidence version token', () => {
    expect(s3ObjectVersionIdV1Schema.parse('v-1')).toBe('v-1');
    expect(() => s3ObjectVersionIdV1Schema.parse('')).toThrow();
    expect(evidenceVersionTokenV1Schema.parse('t-1')).toBe('t-1');
    expect(() => evidenceVersionTokenV1Schema.parse('')).toThrow();
  });

  it('parses descriptor authority lease and monotonic tokens only through Zod brands', () => {
    const value = `sha256:${HEX64}`;
    expect(parseForwardAuthorityTokenV1(value)).toBe(value);
    expect(parseForwardLeaseBindingDigestV1(value)).toBe(value);
    expect(() => parseForwardAuthorityTokenV1(HEX64)).toThrow();
    expect(() => forwardAuthorityTokenV1Schema.parse(HEX64)).toThrow();
    expect(() => forwardLeaseBindingDigestV1Schema.parse(HEX64)).toThrow();
    const monotonic = monotonicRawNanosecondsV1FromBigInt(5_000_000_000n);
    expect(bigintFromMonotonicRawNanosecondsV1(monotonic)).toBe(5_000_000_000n);
    expect(() => monotonicRawNanosecondsV1Schema.parse('-1')).toThrow();
  });
});

describe('MonotonicRawNanosecondsV1', () => {
  it('round-trips a bigint through the branded decimal string', () => {
    const ns = 1234567890123456789n;
    const branded = monotonicRawNanosecondsV1FromBigInt(ns);
    expect(branded).toBe('1234567890123456789');
    expect(monotonicRawNanosecondsV1Schema.parse(branded)).toBe(branded);
    expect(bigintFromMonotonicRawNanosecondsV1(branded)).toBe(ns);
  });

  it('accepts zero and rejects negatives, leading zeros, and non-digits', () => {
    expect(monotonicRawNanosecondsV1FromBigInt(0n)).toBe('0');
    expect(() => monotonicRawNanosecondsV1FromBigInt(-1n)).toThrow();
    expect(() => monotonicRawNanosecondsV1Schema.parse('01')).toThrow();
    expect(() => monotonicRawNanosecondsV1Schema.parse('1.0')).toThrow();
  });
});
