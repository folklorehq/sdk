// SPDX-License-Identifier: Apache-2.0
import { createPublicKey, verify, type KeyObject } from 'node:crypto';

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const ED25519_PUBLIC_KEY_BYTES = 32;
const ED25519_SIGNATURE_BYTES = 64;

export interface Ed25519SignatureInput {
  readonly message: string | Uint8Array;
  readonly publicKey: Uint8Array;
  readonly signature: Uint8Array;
}

export function ed25519PublicKeyFromRaw(rawPublicKey: Uint8Array): KeyObject {
  // OpenSSL ignores bytes after the SPKI, so an over-long key would import as its 32-byte prefix.
  if (rawPublicKey.byteLength !== ED25519_PUBLIC_KEY_BYTES) {
    throw new TypeError('ed25519_public_key_length');
  }
  return createPublicKey({
    key: Buffer.concat([ED25519_SPKI_PREFIX, rawPublicKey]),
    format: 'der',
    type: 'spki',
  });
}

export function verifyEd25519Signature(input: Ed25519SignatureInput): boolean {
  if (input.signature.byteLength !== ED25519_SIGNATURE_BYTES) {
    throw new TypeError('ed25519_signature_length');
  }
  const message =
    typeof input.message === 'string' ? Buffer.from(input.message, 'utf8') : input.message;
  return verify(null, message, ed25519PublicKeyFromRaw(input.publicKey), input.signature);
}
