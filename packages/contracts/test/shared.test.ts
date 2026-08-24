// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { base64Ed25519SignatureSchema, canonicalBase64BytesSchema } from '../src/shared.js';

describe('canonicalBase64BytesSchema', () => {
  it('accepts canonical bounded base64 bytes', () => {
    const schema = canonicalBase64BytesSchema({ maxDecodedBytes: 3 });
    expect(schema.parse('AQID')).toBe('AQID');
  });

  it('rejects empty, non-canonical, and oversized decoded bytes', () => {
    const schema = canonicalBase64BytesSchema({ maxDecodedBytes: 2 });
    for (const value of ['', 'A', 'AQID', 'AQID====']) {
      expect(schema.safeParse(value).success).toBe(false);
    }
    expect(schema.safeParse('AQI=').success).toBe(true);
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
