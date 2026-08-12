// SPDX-License-Identifier: Apache-2.0
import { createHash, generateKeyPairSync, sign } from 'node:crypto';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const publicJwk = publicKey.export({ format: 'jwk' });
if (!publicJwk.x) throw new Error('aci_test_fixture_key_missing');
const publicKeyHex = Buffer.from(publicJwk.x, 'base64url').toString('hex');

export const FIXTURE_NOW = new Date('2026-08-09T12:00:00.000Z');
export const FIXTURE_WORKLOAD_ID = 'workload-a';
export const FIXTURE_KEY_ID = 'receipt-key-1';

export const FIXTURE_KEYSET = {
  not_after: Math.floor(FIXTURE_NOW.getTime() / 1_000) + 3_600,
  receipt_signing_keys: [{ key_id: FIXTURE_KEY_ID, algo: 'ed25519', public_key: publicKeyHex }],
  e2ee_public_keys: [],
};

export const FIXTURE_KEYSET_DIGEST = `sha256:${createHash('sha256')
  .update(canonicalJson(FIXTURE_KEYSET))
  .digest('hex')}`;

export const FIXTURE_ATTESTATION = {
  api_version: 'aci/1',
  workload_id: FIXTURE_WORKLOAD_ID,
  workload_keyset_digest: FIXTURE_KEYSET_DIGEST,
  attestation: {
    workload_keyset: FIXTURE_KEYSET,
    report_data: '00'.repeat(32),
  },
};

export function signedReceipt(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const unsigned = {
    api_version: 'aci/1',
    receipt_id: 'receipt-1',
    key_id: FIXTURE_KEY_ID,
    workload_id: FIXTURE_WORKLOAD_ID,
    workload_keyset_digest: FIXTURE_KEYSET_DIGEST,
    expires_at: '2026-08-09T13:00:00.000Z',
    event_log: [
      { type: 'upstream.verified', result: 'verified', required: true, session_id: 'session-1' },
    ],
    ...overrides,
  };
  return {
    ...unsigned,
    signature: sign(null, Buffer.from(canonicalJson(unsigned)), privateKey).toString('hex'),
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}
