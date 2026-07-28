// SPDX-License-Identifier: Apache-2.0
import { x25519 } from '@noble/curves/ed25519';
import { sha256 } from '@noble/hashes/sha2';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils';
import { generateMnemonic, mnemonicToEntropy, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

// 256-bit entropy → 24-word BIP39 phrase.
const RECOVERY_ENTROPY_BITS = 256;
// Domain separation: the X25519 seed is a hash of the BIP39 entropy under this label, never the
// raw entropy — so the recovery private key is a distinct derived secret. The runbook
// (docs/security/master-key-recovery.md) MUST reproduce this exact string byte-for-byte, or a
// sealed recovery blob becomes undecryptable.
const X25519_DERIVATION_DOMAIN = 'folklore-recovery-x25519-v1';
const FINGERPRINT_BYTES = 8;
const RAW_KEY_HEX_LENGTH = 64;

export interface RecoveryMaterial {
  mnemonic: string;
  words: string[];
  publicKeyHex: string;
  privateKeyHex: string;
  fingerprint: string;
}

export interface RecoverySubmission {
  publicKeyHex: string;
  fingerprint: string;
}

function deriveX25519Seed(mnemonic: string): Uint8Array {
  const entropy = mnemonicToEntropy(mnemonic, wordlist);
  return sha256(concatBytes(utf8ToBytes(X25519_DERIVATION_DOMAIN), entropy));
}

export function recoveryFingerprint(publicKeyHex: string): string {
  const digest = sha256(hexToBytes(publicKeyHex));
  const groups = bytesToHex(digest.slice(0, FINGERPRINT_BYTES)).match(/.{4}/g);
  return groups ? groups.join('-') : '';
}

export function deriveRecoveryMaterial(mnemonic: string): RecoveryMaterial {
  const phrase = mnemonic.trim().replace(/\s+/g, ' ');
  if (!validateMnemonic(phrase, wordlist)) {
    throw new Error('invalid BIP39 recovery phrase');
  }
  const seed = deriveX25519Seed(phrase);
  const publicKeyHex = bytesToHex(x25519.getPublicKey(seed));
  return {
    mnemonic: phrase,
    words: phrase.split(' '),
    publicKeyHex,
    privateKeyHex: bytesToHex(seed),
    fingerprint: recoveryFingerprint(publicKeyHex),
  };
}

export function generateRecoveryMaterial(): RecoveryMaterial {
  return deriveRecoveryMaterial(generateMnemonic(wordlist, RECOVERY_ENTROPY_BITS));
}

export function toRecoverySubmission(material: RecoveryMaterial): RecoverySubmission {
  return { publicKeyHex: material.publicKeyHex, fingerprint: material.fingerprint };
}

export function isRecoveryPublicKeyHex(value: string): boolean {
  return new RegExp(`^[0-9a-fA-F]{${RAW_KEY_HEX_LENGTH}}$`).test(value);
}
