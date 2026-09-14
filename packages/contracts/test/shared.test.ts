// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import {
  base64Ed25519SignatureSchema,
  canonicalBase64BytesSchema,
  canonicalJson,
  decodeCanonicalBase64,
} from '../src/shared.js';

describe('canonicalBase64BytesSchema', () => {
  it('accepts canonical bounded base64 bytes', () => {
    const schema = canonicalBase64BytesSchema({ maxDecodedBytes: 3 });
    expect(schema.parse('AQID')).toBe('AQID');
  });

  it('validates and decodes canonical bytes without a Buffer global', () => {
    vi.stubGlobal('Buffer', undefined);
    try {
      expect(canonicalBase64BytesSchema({ maxDecodedBytes: 3 }).parse('AQID')).toBe('AQID');
      expect([...decodeCanonicalBase64('AQID', 3)]).toEqual([1, 2, 3]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects malformed and non-canonical encodings', () => {
    const schema = canonicalBase64BytesSchema({ maxDecodedBytes: 2 });
    for (const value of ['', 'A', 'AAA', 'AAA==', 'AA=A', 'A===', 'AB==', 'AAB=', 'AQID====']) {
      expect(schema.safeParse(value).success).toBe(false);
    }
  });

  it('enforces the maximum decoded byte count at the exact boundary', () => {
    const schema = canonicalBase64BytesSchema({ maxDecodedBytes: 2 });
    expect(schema.safeParse('AQI=').success).toBe(true);
    expect(schema.safeParse('AQID').success).toBe(false);
  });

  it('requires canonical 64-byte Ed25519 signature encoding', () => {
    expect(
      base64Ed25519SignatureSchema.safeParse(Buffer.alloc(64).toString('base64')).success,
    ).toBe(true);
    expect(
      base64Ed25519SignatureSchema.safeParse(Buffer.alloc(63).toString('base64')).success,
    ).toBe(false);
    expect(
      base64Ed25519SignatureSchema.safeParse(Buffer.alloc(65).toString('base64')).success,
    ).toBe(false);
  });
});

describe('canonicalJson', () => {
  it('uses the browser-safe utility subpath', () => {
    expect(canonicalJson({ b: [2, { z: true, a: null }], a: 'one' })).toBe(
      '{"a":"one","b":[2,{"a":null,"z":true}]}',
    );
  });
});
