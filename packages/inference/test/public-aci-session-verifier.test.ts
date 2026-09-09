// SPDX-License-Identifier: Apache-2.0
import { createHash, generateKeyPairSync, sign } from 'node:crypto';

import { aciSessionSchema, type AciReceipt, type AciSession } from '@folklore/contracts';
import { canonicalJson } from '@folklore/utils';
import { describe, expect, it } from 'vitest';

import {
  PublicAciSessionVerifier,
  type PublicAciSessionPolicy,
} from '../src/aci/PublicAciSessionVerifier.js';

const origin = 'https://inference.example.com';
const workloadKeysetDigest = `sha256:${'a'.repeat(64)}`;
const channelBinding = {
  type: 'tls_spki_sha256' as const,
  origin,
  spki_sha256: 'b'.repeat(64),
};
const evidence = Buffer.from('public-evidence');
const evidenceDigest = `sha256:${createHash('sha256').update(evidence).digest('hex')}`;

function makeSession(extra: Record<string, unknown> = {}): AciSession {
  return aciSessionSchema.parse({
    api_version: 'aci/1',
    upstream_name: 'upstream',
    endpoint: origin,
    verifier_id: 'gateway-verifier',
    established_at: 100,
    expires_at: 200,
    channel_binding: [channelBinding],
    claims: {
      tee_attested: { status: 'asserted', source: 'hardware_proven', reason: 'verified' },
    },
    evidence: {
      digest: evidenceDigest,
      data: `data:application/octet-stream;base64,${evidence.toString('base64')}`,
    },
    ...extra,
  });
}

function policy(): PublicAciSessionPolicy {
  return {
    origin,
    workloadKeysetDigest,
    model: 'model-a',
    maxSessionLifetimeSeconds: 100,
    requiredSessionClaims: ['tee_attested'],
    permittedClaimSources: ['hardware_proven'],
    channelKeyDigest: createHash('sha256')
      .update(canonicalJson({ channel_binding: [channelBinding] }))
      .digest('hex'),
  };
}

function signedReceipt(
  sessionId: string,
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  servedAt = 150,
): AciReceipt {
  const unsigned = {
    api_version: 'aci/1' as const,
    receipt_id: 'receipt-1',
    workload_keyset_digest: workloadKeysetDigest,
    endpoint: '/v1/chat/completions',
    method: 'POST',
    served_at: servedAt,
    event_log: [
      { type: 'request.received' as const, body_hash: `sha256:${'1'.repeat(64)}` },
      { type: 'request.forwarded' as const, body_hash: `sha256:${'1'.repeat(64)}` },
      {
        type: 'upstream.verified' as const,
        model_id: 'model-a',
        result: 'verified' as const,
        required: true,
        session_id: sessionId,
      },
      { type: 'response.returned' as const, body_hash: `sha256:${'2'.repeat(64)}` },
    ],
    key_id: 'receipt-key',
  };
  return {
    ...unsigned,
    signature: sign(null, Buffer.from(canonicalJson(unsigned)), privateKey).toString('hex'),
  };
}

function setup(extraSession: Record<string, unknown> = {}, servedAt = 150) {
  const keys = generateKeyPairSync('ed25519');
  const parsedSession = makeSession();
  const session = { ...parsedSession, ...extraSession } as AciSession;
  const sessionId = createHash('sha256').update(canonicalJson(session)).digest('hex');
  const receipt = signedReceipt(sessionId, keys.privateKey, servedAt);
  const publicKey = keys.publicKey
    .export({ format: 'der', type: 'spki' })
    .subarray(-32)
    .toString('hex');
  const verifier = new PublicAciSessionVerifier(async (input) => {
    expect(String(input)).toBe(`${origin}/v1/aci/sessions/${sessionId}`);
    const response = new Response(JSON.stringify(session), {
      status: 200,
      headers: { location: origin },
    });
    Object.defineProperty(response, 'url', { value: `${origin}/v1/aci/sessions/${sessionId}` });
    return response;
  });
  return {
    verifier,
    input: {
      receipt,
      keyset: {
        workloadKeysetDigest,
        receiptSigningKeys: [{ keyId: 'receipt-key', algorithm: 'ed25519', publicKey }],
      },
      policy: policy(),
      trustedNow: 150,
    },
  };
}

describe('PublicAciSessionVerifier', () => {
  it('rejects a signed session whose channels differ from the authorized role digest', async () => {
    const { verifier, input } = setup({
      channel_binding: [{ ...channelBinding, spki_sha256: 'c'.repeat(64) }],
    });
    await expect(verifier.verify(input)).rejects.toThrow('channel policy');
  });

  it.each(['', 'a'.repeat(63), `sha256:${'a'.repeat(64)}`, 'A'.repeat(64)])(
    'rejects a malformed signed role channel digest %s',
    async (channelKeyDigest) => {
      const { verifier, input } = setup();
      input.policy = { ...input.policy, channelKeyDigest };
      await expect(verifier.verify(input)).rejects.toThrow('signed channel digest');
    },
  );

  it('rejects a session longer than the signed policy permits', async () => {
    const { verifier, input } = setup();
    input.policy = { ...input.policy, maxSessionLifetimeSeconds: 99 };
    await expect(verifier.verify(input)).rejects.toThrow();
  });

  it.each(['https://user:password@inference.example.com', `${origin}/`])(
    'rejects a noncanonical policy origin before fetching: %s',
    async (badOrigin) => {
      const { verifier, input } = setup();
      input.policy = { ...input.policy, origin: badOrigin };
      await expect(verifier.verify(input)).rejects.toThrow('policy origin');
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5])(
    'rejects invalid maximum session lifetime %s',
    async (maximum) => {
      const { verifier, input } = setup();
      input.policy = { ...input.policy, maxSessionLifetimeSeconds: maximum };
      await expect(verifier.verify(input)).rejects.toThrow();
    },
  );

  it.each([99, 200])('rejects a signed receipt outside session validity: %s', async (servedAt) => {
    const { verifier, input } = setup({}, servedAt);
    await expect(verifier.verify(input)).rejects.toThrow('time or content binding');
  });

  it('verifies a quote-bound, content-addressed public session', async () => {
    const { verifier, input } = setup();
    await expect(verifier.verify(input)).resolves.toMatchObject({
      verificationMode: 'gateway-authenticated-public-session',
      model: 'model-a',
    });
  });

  it('rejects an unknown top-level session field', async () => {
    const { verifier, input } = setup({ unknown: true });
    await expect(verifier.verify(input)).rejects.toThrow();
  });

  it('rejects oversized session evidence', async () => {
    const { verifier, input } = setup({
      evidence: {
        digest: `sha256:${'c'.repeat(64)}`,
        data: `data:application/octet-stream;base64,${Buffer.alloc(1_048_577).toString('base64')}`,
      },
    });
    await expect(verifier.verify(input)).rejects.toThrow();
  });
});
