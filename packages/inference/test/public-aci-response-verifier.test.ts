// SPDX-License-Identifier: Apache-2.0
import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from '@folklore/utils';
import { ACI_POLICY_FIXTURE } from '../../contracts/test/fixtures/aci-v1.js';
import type { InferenceTrustPolicyV2, AciReceipt } from '@folklore/contracts';
import type { VerifiedAciKeyset } from '../src/ports.js';
import { PublicAciResponseVerifier } from '../src/aci/PublicAciResponseVerifier.js';

const origin = 'https://inference.phala.com';
const requestSha256 = 'a'.repeat(64);
const responseSha256 = 'b'.repeat(64);

function fixture() {
  const pair = generateKeyPairSync('ed25519');
  const rawPublicKey = pair.publicKey
    .export({ type: 'spki', format: 'der' })
    .subarray(-32)
    .toString('hex');
  const keyset: VerifiedAciKeyset = {
    workloadId: 'sha256:' + '1'.repeat(64),
    workloadKeysetDigest: 'sha256:' + '2'.repeat(64),
    version: 1,
    notAfter: 2_000_000_000,
    receiptSigningKeys: [{ keyId: 'receipt-1', algorithm: 'ed25519', publicKey: rawPublicKey }],
    e2eePublicKeys: [],
    tlsPublicKeys: [],
    channelPins: [],
    channelKeyDigest: 'sha256:' + '3'.repeat(64),
  };
  const unsigned = {
    api_version: 'aci/1' as const,
    receipt_id: 'receipt-1',
    workload_keyset_digest: keyset.workloadKeysetDigest,
    model: 'model-1',
    endpoint: '/v1/chat/completions' as const,
    method: 'POST' as const,
    served_at: 1_700_000_000,
    event_log: [
      { type: 'request.received' as const, body_hash: `sha256:${requestSha256}` },
      { type: 'request.forwarded' as const, body_hash: `sha256:${requestSha256}` },
      {
        type: 'upstream.verified' as const,
        model_id: 'model-1',
        result: 'verified' as const,
        required: true,
        session_id: 'a'.repeat(64),
      },
      { type: 'response.returned' as const, body_hash: `sha256:${responseSha256}` },
    ],
    key_id: 'receipt-1',
  };
  const receipt: AciReceipt = {
    ...unsigned,
    signature: sign(null, Buffer.from(canonicalJson(unsigned)), pair.privateKey).toString('hex'),
  };
  const policy = {
    ...ACI_POLICY_FIXTURE,
    origin,
    evidence: { ...ACI_POLICY_FIXTURE.evidence, profile: 'dstack-tdx-public-v1' },
    roleModels: {
      ...ACI_POLICY_FIXTURE.roleModels,
      generate: { model: 'model-1', revision: 'rev-1' },
    },
  } as InferenceTrustPolicyV2;
  return { keyset, receipt, policy };
}

describe('PublicAciResponseVerifier', () => {
  it('verifies a real signed receipt against backend hashes and mandatory session verification', async () => {
    const f = fixture();
    const reportVerifier = { verify: vi.fn(async () => f.keyset) } as never;
    const session = vi.fn(async () => ({ sessionId: 's'.repeat(64) }));
    const response = new Response(JSON.stringify(f.receipt), { status: 200 });
    Object.defineProperty(response, 'url', { value: `${origin}/v1/aci/receipts/receipt-1` });
    const verifier = new PublicAciResponseVerifier({
      reportVerifier,
      policy: f.policy,
      fetchImpl: vi.fn(async () => response),
      verifySession: session,
    });
    await verifier.ensureAttested({
      model: 'model-1',
      modelRevision: 'rev-1',
      modelRole: 'generate',
      endpoint: '/v1/chat/completions',
    });
    await expect(
      verifier.verifyReceipt('receipt-1', {
        requestSha256,
        responseSha256,
        model: 'model-1',
        modelRevision: 'rev-1',
        modelRole: 'generate',
        nonce: 'nonce',
      }),
    ).resolves.toBeUndefined();
    expect(session).toHaveBeenCalledOnce();
  });

  it('rejects a second attestation before the single receipt is consumed', async () => {
    const f = fixture();
    const verifier = new PublicAciResponseVerifier({
      reportVerifier: { verify: vi.fn(async () => f.keyset) } as never,
      policy: f.policy,
      fetchImpl: vi.fn(async () => {
        const response = new Response(JSON.stringify(f.receipt), { status: 200 });
        Object.defineProperty(response, 'url', { value: `${origin}/v1/aci/receipts/receipt-1` });
        return response;
      }),
      verifySession: vi.fn(async () => ({ sessionId: 'a'.repeat(64) })),
    });
    const context = {
      model: 'model-1',
      modelRevision: 'rev-1',
      endpoint: '/v1/chat/completions' as const,
    };
    await verifier.ensureAttested(context);
    await expect(verifier.ensureAttested(context)).rejects.toThrow();
  });

  it('fails closed when the mandatory public session verifier rejects', async () => {
    const f = fixture();
    const response = new Response(JSON.stringify(f.receipt), { status: 200 });
    Object.defineProperty(response, 'url', { value: `${origin}/v1/aci/receipts/receipt-1` });
    const verifier = new PublicAciResponseVerifier({
      reportVerifier: { verify: vi.fn(async () => f.keyset) } as never,
      policy: f.policy,
      fetchImpl: vi.fn(async () => response),
      verifySession: vi.fn(async () => {
        throw new Error('session rejected');
      }),
    });
    await verifier.ensureAttested({
      model: 'model-1',
      modelRevision: 'rev-1',
      endpoint: '/v1/chat/completions',
    });
    await expect(
      verifier.verifyReceipt('receipt-1', {
        requestSha256,
        responseSha256,
        model: 'model-1',
        modelRevision: 'rev-1',
        nonce: 'nonce',
      }),
    ).rejects.toThrow();
  });
});
