// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  buildRecoveryFileContents,
  deriveRecoveryMaterial,
  generateRecoveryMaterial,
  isRecoveryPublicKeyHex,
  recoveryFingerprint,
  toRecoverySubmission,
} from '../src/index.js';

// Canonical BIP39 256-bit all-zero-entropy test vector (24 words).
const PHRASE =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon ' +
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon ' +
  'abandon abandon abandon art';

describe('deriveRecoveryMaterial', () => {
  it('is deterministic — same phrase yields the same X25519 keypair', () => {
    const a = deriveRecoveryMaterial(PHRASE);
    const b = deriveRecoveryMaterial(PHRASE);
    expect(a.publicKeyHex).toBe(b.publicKeyHex);
    expect(a.privateKeyHex).toBe(b.privateKeyHex);
  });

  it('derives a raw 32-byte X25519 keypair (64 hex chars)', () => {
    const m = deriveRecoveryMaterial(PHRASE);
    expect(m.publicKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(m.privateKeyHex).toMatch(/^[0-9a-f]{64}$/);
    expect(isRecoveryPublicKeyHex(m.publicKeyHex)).toBe(true);
  });

  it('normalizes whitespace/casing before deriving', () => {
    const spaced = deriveRecoveryMaterial(`  ${PHRASE.replace(/ /g, '  ')}  `);
    expect(spaced.publicKeyHex).toBe(deriveRecoveryMaterial(PHRASE).publicKeyHex);
  });

  it('rejects an invalid phrase', () => {
    expect(() => deriveRecoveryMaterial('not a real bip39 phrase at all nope')).toThrow(/invalid/);
  });
});

describe('generateRecoveryMaterial', () => {
  it('produces a fresh, valid 24-word phrase each call', () => {
    const a = generateRecoveryMaterial();
    const b = generateRecoveryMaterial();
    expect(a.words).toHaveLength(24);
    expect(a.mnemonic).not.toBe(b.mnemonic);
    // Re-deriving from the generated phrase reproduces the same keypair.
    expect(deriveRecoveryMaterial(a.mnemonic).publicKeyHex).toBe(a.publicKeyHex);
  });
});

describe('recoveryFingerprint', () => {
  it('is a stable, grouped digest of the public key', () => {
    const m = deriveRecoveryMaterial(PHRASE);
    expect(recoveryFingerprint(m.publicKeyHex)).toBe(m.fingerprint);
    expect(m.fingerprint).toMatch(/^([0-9a-f]{4}-){3}[0-9a-f]{4}$/);
  });
});

describe('toRecoverySubmission', () => {
  it('carries only the public key + fingerprint, never the secret material', () => {
    const m = deriveRecoveryMaterial(PHRASE);
    const submission = toRecoverySubmission(m);
    expect(submission).toEqual({ publicKeyHex: m.publicKeyHex, fingerprint: m.fingerprint });
    expect(JSON.stringify(submission)).not.toContain(m.privateKeyHex);
    expect(JSON.stringify(submission)).not.toContain(m.words[0]);
  });
});

describe('buildRecoveryFileContents', () => {
  it('includes every word, the pubkey, and prominent warnings', () => {
    const m = deriveRecoveryMaterial(PHRASE);
    const file = buildRecoveryFileContents(m, { orgName: 'Acme', generatedAt: new Date(0) });
    for (const word of m.words) expect(file).toContain(word);
    expect(file).toContain(m.publicKeyHex);
    expect(file).toContain('CANNOT recover');
    expect(file).toContain('Acme');
  });
});
