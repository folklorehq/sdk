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
const alias = 'qwen/qwen3-embedding-8b';
const attestedModel = 'Qwen/Qwen3-Embedding-8B-TEE';
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
    model: alias,
    maxSessionLifetimeSeconds: 100,
    requiredSessionClaims: ['tee_attested'],
    permittedClaimSources: ['hardware_proven'],
    acceptedChannelBindings: [
      {
        type: 'e2ee_public_key_sha256',
        domains: ['inference.example.com'],
        algorithms: ['x25519-aes-256-gcm-hkdf-sha256'],
      },
      { type: 'tls_spki_sha256', domains: ['inference.example.com'] },
    ],
  };
}

const e2eeBinding = (algorithm: string) => ({
  type: 'e2ee_public_key_sha256',
  provider: 'upstream',
  algorithm,
  public_key_sha256: 'e'.repeat(64),
});

type UpstreamOverride = Record<string, unknown>;
type ReceiptShape = Readonly<{ model?: string; beforeForward?: string[]; beforeReturn?: string[] }>;

function upstreamEvent(sessionId: string, override: UpstreamOverride = {}) {
  return {
    type: 'upstream.verified' as const,
    model_id: attestedModel,
    result: 'verified' as const,
    required: true,
    ...(override.result === 'failed' ? {} : { session_id: sessionId }),
    ...override,
  };
}

function signedReceipt(
  sessionId: string,
  privateKey: ReturnType<typeof generateKeyPairSync>['privateKey'],
  servedAt = 150,
  upstream: readonly UpstreamOverride[] | undefined = undefined,
  shape: ReceiptShape = {},
): AciReceipt {
  const extension = (type: string) => ({ type }) as unknown as AciReceipt['event_log'][number];
  const unsigned = {
    api_version: 'aci/1' as const,
    receipt_id: 'receipt-1',
    ...(shape.model === undefined ? {} : { model: shape.model }),
    workload_keyset_digest: workloadKeysetDigest,
    endpoint: '/v1/chat/completions',
    method: 'POST',
    served_at: servedAt,
    event_log: [
      { type: 'request.received' as const, body_hash: `sha256:${'1'.repeat(64)}` },
      ...(shape.beforeForward ?? []).map(extension),
      { type: 'request.forwarded' as const, body_hash: `sha256:${'1'.repeat(64)}` },
      ...(upstream ?? [{}]).map((override) => upstreamEvent(sessionId, override)),
      ...(shape.beforeReturn ?? []).map(extension),
      { type: 'response.returned' as const, body_hash: `sha256:${'2'.repeat(64)}` },
    ],
    key_id: 'receipt-key',
  };
  return {
    ...unsigned,
    signature: sign(null, Buffer.from(canonicalJson(unsigned)), privateKey).toString('hex'),
  };
}

function setup(
  extraSession: Record<string, unknown> = {},
  servedAt = 150,
  upstream: readonly UpstreamOverride[] | undefined = undefined,
  shape: ReceiptShape = {},
) {
  const keys = generateKeyPairSync('ed25519');
  const parsedSession = makeSession();
  const session = { ...parsedSession, ...extraSession } as AciSession;
  const sessionId = createHash('sha256').update(canonicalJson(session)).digest('hex');
  const receipt = signedReceipt(sessionId, keys.privateKey, servedAt, upstream, shape);
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

async function refusal(verification: Promise<unknown>): Promise<string | undefined> {
  return verification.then(
    () => undefined,
    (caught: unknown) => (caught instanceof Error ? caught.message : undefined),
  );
}

describe('PublicAciSessionVerifier', () => {
  it.each(['/w==', '_w', '_w=='])(
    'requires canonical padded standard base64: %s',
    async (payload) => {
      const bytes = Buffer.from([255]);
      const { verifier, input } = setup({
        evidence: {
          digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
          data: `data:application/octet-stream;base64,${payload}`,
        },
      });
      if (payload === '/w==') await expect(verifier.verify(input)).resolves.toBeDefined();
      else await expect(verifier.verify(input)).rejects.toThrow();
    },
  );

  it.each([
    ['no comma', 'data:application/octet-stream;base64'],
    ['empty payload', 'data:application/octet-stream;base64,'],
    ['not a data URI', 'https://inference.example.com/evidence'],
  ])(
    'rejects evidence whose digest would bind an empty or unstructured body: %s',
    async (_name, data) => {
      const empty = Buffer.alloc(0);
      const { verifier, input } = setup({
        evidence: { digest: `sha256:${createHash('sha256').update(empty).digest('hex')}`, data },
      });
      // The contract schema rejects unstructured URIs before the verifier runs; the verifier
      // itself rejects the structurally valid but empty payload. Both paths must fail closed.
      await expect(verifier.verify(input)).rejects.toThrow(
        data.endsWith(',') ? 'evidence encoding' : /evidence|Invalid/,
      );
    },
  );

  it('accepts an upstream channel key the provider policy accepts by type', async () => {
    const { verifier, input } = setup({
      channel_binding: [{ ...channelBinding, spki_sha256: 'c'.repeat(64) }],
    });
    await expect(verifier.verify(input)).resolves.toMatchObject({
      channelBindings: [{ ...channelBinding, spki_sha256: 'c'.repeat(64) }],
    });
  });

  it('accepts an accepted binding next to one the policy does not name', async () => {
    const { verifier, input } = setup({
      channel_binding: [
        { type: 'quantum_tunnel', value: 'x' },
        e2eeBinding('x25519-aes-256-gcm-hkdf-sha256'),
      ],
    });
    await expect(verifier.verify(input)).resolves.toBeDefined();
  });

  it.each([
    ['an unknown binding type', [{ type: 'quantum_tunnel', value: 'x' }]],
    [
      'an e2ee algorithm the policy does not list',
      [e2eeBinding('secp256k1-aes-256-gcm-hkdf-sha256')],
    ],
  ])('rejects a session whose only channel binding is %s', async (_label, channel_binding) => {
    const { verifier, input } = setup({ channel_binding });
    await expect(verifier.verify(input)).rejects.toThrow('channel policy');
  });

  it('rejects an unlisted e2ee algorithm even beside an accepted TLS binding', async () => {
    const { verifier, input } = setup({
      channel_binding: [channelBinding, e2eeBinding('secp256k1-aes-256-gcm-hkdf-sha256')],
    });
    await expect(verifier.verify(input)).rejects.toThrow('channel policy');
  });

  it('rejects a TLS binding when the policy accepts only e2ee', async () => {
    const { verifier, input } = setup();
    input.policy = {
      ...input.policy,
      acceptedChannelBindings: input.policy.acceptedChannelBindings.filter(
        (binding) => binding.type === 'e2ee_public_key_sha256',
      ),
    };
    await expect(verifier.verify(input)).rejects.toThrow('channel policy');
  });

  it('rejects a policy that accepts no channel binding', async () => {
    const { verifier, input } = setup();
    input.policy = { ...input.policy, acceptedChannelBindings: [] };
    await expect(verifier.verify(input)).rejects.toThrow('channel policy is invalid');
  });

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
      model: alias,
    });
  });

  const failed = { result: 'failed', required: false, reason: 'quote rejected' };

  it.each<[string, readonly UpstreamOverride[], string]>([
    ['no upstream event', [], 'public ACI upstream event is absent'],
    ['only a failed upstream event', [failed], 'public ACI upstream result is not verified'],
    [
      'a verified but optional upstream',
      [{ required: false }],
      'public ACI upstream is not required',
    ],
    [
      'an attested id that differs only in case',
      [{ model_id: 'Qwen/qwen3-embedding-8b-tee' }],
      'public ACI upstream model differs only in case',
    ],
    [
      'the gateway alias as the upstream id',
      [{ model_id: alias }],
      'public ACI upstream model does not match',
    ],
    [
      'another attested model',
      [{ model_id: 'Qwen/Qwen3-32B-TEE' }],
      'public ACI upstream model does not match',
    ],
    [
      'a failed event beside a verified optional one',
      [failed, { required: false }],
      'public ACI upstream is not required',
    ],
    [
      'an optional event beside a required other model',
      [{ required: false }, { model_id: 'Qwen/Qwen3-32B-TEE' }],
      'public ACI upstream model does not match',
    ],
    [
      'a case-only mismatch beside another model',
      [{ model_id: alias }, { model_id: 'QWEN/QWEN3-EMBEDDING-8B-TEE' }],
      'public ACI upstream model differs only in case',
    ],
  ])('refuses %s with its own fixed sentence', async (_label, upstream, sentence) => {
    const { verifier, input } = setup({}, 150, upstream);
    const message = await refusal(verifier.verify(input));
    expect(message).toBe(sentence);
    expect(message).not.toMatch(/qwen|quote rejected|receipt-1/i);
  });

  it('refuses an alias with no attested upstream mapping', async () => {
    const { verifier, input } = setup({}, 150, [{ model_id: 'model-a' }]);
    input.policy = { ...input.policy, model: 'model-a' };
    expect(await refusal(verifier.verify(input))).toBe(
      'public ACI upstream model alias is unmapped',
    );
  });

  it.each([
    ['z-ai/glm-5.2', 'zai-org/GLM-5.2-TEE'],
    ['qwen/qwen3-32b', 'Qwen/Qwen3-32B-TEE'],
    ['qwen/qwen3-embedding-8b', 'Qwen/Qwen3-Embedding-8B-TEE'],
  ])('accepts %s only by its exact attested upstream id %s', async (model, upstreamId) => {
    const accepted = setup({}, 150, [{ model_id: upstreamId }]);
    accepted.input.policy = { ...accepted.input.policy, model };
    await expect(accepted.verifier.verify(accepted.input)).resolves.toMatchObject({ model });
    const aliased = setup({}, 150, [{ model_id: model }]);
    aliased.input.policy = { ...aliased.input.policy, model };
    await expect(aliased.verifier.verify(aliased.input)).rejects.toThrow();
  });

  it('accepts the observed gateway receipt shape', async () => {
    const { verifier, input } = setup({}, 150, [{}], {
      model: alias,
      beforeForward: ['middleware.forwarded', 'route.selected'],
      beforeReturn: ['response.received'],
    });
    await expect(verifier.verify(input)).resolves.toMatchObject({ model: alias });
  });

  it('accepts a matching upstream event beside refused ones', async () => {
    const { verifier, input } = setup({}, 150, [failed, { model_id: alias }, {}]);
    await expect(verifier.verify(input)).resolves.toMatchObject({ model: alias });
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
