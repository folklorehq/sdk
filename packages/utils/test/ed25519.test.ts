// SPDX-License-Identifier: Apache-2.0
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ed25519PublicKeyFromRaw, verifyEd25519Signature } from '../src/signing/ed25519.js';

const RAW_PUBLIC_KEY_BYTES = 32;
const SPKI_HEADER_BYTES = 12;
const MESSAGE = 'folklore.assignment-ack.v1\u0000payload';

function withTrailing(bytes: Uint8Array, extra: number): Uint8Array {
  return Uint8Array.from([...bytes, ...new Uint8Array(extra).fill(0xaa)]);
}

function signed() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = new Uint8Array(
    publicKey.export({ type: 'spki', format: 'der' }).subarray(SPKI_HEADER_BYTES),
  );
  return {
    publicKey: raw,
    signature: new Uint8Array(sign(null, Buffer.from(MESSAGE, 'utf8'), privateKey)),
  };
}

describe('ed25519PublicKeyFromRaw', () => {
  it('rebuilds a key that verifies signatures from the raw 32-byte public key', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const raw = publicKey.export({ type: 'spki', format: 'der' }).subarray(SPKI_HEADER_BYTES);
    expect(raw.byteLength).toBe(RAW_PUBLIC_KEY_BYTES);

    const rebuilt = ed25519PublicKeyFromRaw(raw);
    const message = Buffer.from('payload');
    expect(verify(null, message, rebuilt, sign(null, message, privateKey))).toBe(true);
    expect(rebuilt.asymmetricKeyType).toBe('ed25519');
  });

  it.each([RAW_PUBLIC_KEY_BYTES - 1, RAW_PUBLIC_KEY_BYTES + 1])(
    'rejects a key of %i bytes',
    (length) => {
      expect(() => ed25519PublicKeyFromRaw(new Uint8Array(length))).toThrow(
        'ed25519_public_key_length',
      );
    },
  );
});

describe('verifyEd25519Signature', () => {
  it('accepts a signature by the raw key over the utf-8 message', () => {
    expect(verifyEd25519Signature({ message: MESSAGE, ...signed() })).toBe(true);
  });

  it('accepts the same message given as bytes', () => {
    expect(verifyEd25519Signature({ message: Buffer.from(MESSAGE, 'utf8'), ...signed() })).toBe(
      true,
    );
  });

  it('rejects a signature with a flipped byte', () => {
    const { publicKey, signature } = signed();
    const flipped = Uint8Array.from(signature);
    flipped[0] = (flipped[0] ?? 0) ^ 1;
    expect(verifyEd25519Signature({ message: MESSAGE, publicKey, signature: flipped })).toBe(false);
  });

  it('rejects a changed message', () => {
    expect(verifyEd25519Signature({ message: `${MESSAGE}!`, ...signed() })).toBe(false);
  });

  it('rejects a signature checked against another key', () => {
    const { signature } = signed();
    const { publicKey } = signed();
    expect(verifyEd25519Signature({ message: MESSAGE, publicKey, signature })).toBe(false);
  });

  it.each([
    ['31 bytes', (key: Uint8Array) => key.subarray(0, 31)],
    ['33 bytes, the real key and one trailing byte', (key: Uint8Array) => withTrailing(key, 1)],
    ['64 bytes, the real key and 32 trailing bytes', (key: Uint8Array) => withTrailing(key, 32)],
  ])('throws for a public key of %s', (_label, resize) => {
    const { publicKey, signature } = signed();
    expect(() =>
      verifyEd25519Signature({ message: MESSAGE, publicKey: resize(publicKey), signature }),
    ).toThrow('ed25519_public_key_length');
  });

  it.each([
    ['63 bytes', (signature: Uint8Array) => signature.subarray(0, 63)],
    [
      '65 bytes, the real signature and one trailing byte',
      (signature: Uint8Array) => withTrailing(signature, 1),
    ],
  ])('throws for a signature of %s', (_label, resize) => {
    const { publicKey, signature } = signed();
    expect(() =>
      verifyEd25519Signature({ message: MESSAGE, publicKey, signature: resize(signature) }),
    ).toThrow('ed25519_signature_length');
  });
});
