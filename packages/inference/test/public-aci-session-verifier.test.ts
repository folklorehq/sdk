// SPDX-License-Identifier: Apache-2.0
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { aciSessionSchema, type AciReceipt, type AciSession } from '@folklore/contracts';
import { canonicalJson } from '@folklore/utils';
import { describe, expect, it } from 'vitest';

import {
  PublicAciSessionVerifier,
  type PublicAciSessionPolicy,
} from '../src/aci/PublicAciSessionVerifier.js';
import { DEFAULT_VERIFIED_MODELS, attestedUpstreamModelId } from '../src/model-allowlist.js';

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

const MAX_SESSION_BYTES = 8_388_608;
const OBSERVED_GPU_EVIDENCE_BYTES = 819_485;
const MULTIPART_BOUNDARY = 'aci-evidence-250c87de73891fc021999f62';

function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function multipartEvidence(partBytes: number): Buffer {
  return Buffer.concat([
    Buffer.from(`--${MULTIPART_BOUNDARY}\r\ncontent-type: application/octet-stream\r\n\r\n`),
    randomBytes(partBytes),
    Buffer.from(`\r\n--${MULTIPART_BOUNDARY}--\r\n`),
  ]);
}

function multipartEvidenceRef(bytes: Buffer, digested: Buffer = bytes) {
  return {
    digest: `sha256:${sha256Hex(digested)}`,
    data: `data:multipart/mixed;boundary=${MULTIPART_BOUNDARY};base64,${bytes.toString('base64')}`,
  };
}

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
    evidenceFreeVerifiers: [],
  };
}

const chutesVerifier = 'private-ai-verifier/chutes/v1';
const chutesChannel = {
  type: 'e2ee_public_key_sha256' as const,
  domains: ['inference.example.com'],
  algorithms: ['chutes-ml-kem-768' as const],
  providers: ['chutes'],
};
const chutesBinding = (overrides: Record<string, unknown> = {}) => ({
  type: 'e2ee_public_key_sha256',
  provider: 'chutes',
  key_id: 'instance-1',
  algorithm: 'chutes-ml-kem-768',
  public_key_sha256: 'e'.repeat(64),
  ...overrides,
});
// Phala's public transparency session for qwen/qwen3-embedding-8b, fetched 2026-10-11.
const observedSession = JSON.parse(
  readFileSync(
    new URL('./fixtures/phala-public/chutes-embed-session.json', import.meta.url),
    'utf8',
  ),
) as Record<string, unknown>;
const OBSERVED_SESSION_ID = '5f0afd6e7d5dad1b0cbd007954aa1c4c3e7a06485b98dbdd709ce38fefa08c0d';

function chutesPolicy(verifiers: readonly string[] = [chutesVerifier]): PublicAciSessionPolicy {
  const base = policy();
  return {
    ...base,
    acceptedChannelBindings: [chutesChannel, ...base.acceptedChannelBindings],
    evidenceFreeVerifiers: verifiers,
  };
}

function evidenceFreeSetup(
  extra: Record<string, unknown> = {},
  upstream: readonly UpstreamOverride[] | undefined = undefined,
  sessionPolicy: PublicAciSessionPolicy = chutesPolicy(),
  servedAt = 150,
) {
  const { verifier, input } = setup(
    {
      verifier_id: chutesVerifier,
      channel_binding: [chutesBinding()],
      evidence: {},
      ...extra,
    },
    servedAt,
    upstream,
  );
  return { verifier, input: { ...input, policy: sessionPolicy } };
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
  const body = JSON.stringify(session);
  const verifier = new PublicAciSessionVerifier(async (input) => {
    expect(String(input)).toBe(`${origin}/v1/aci/sessions/${sessionId}`);
    const response = new Response(body, {
      status: 200,
      headers: { location: origin },
    });
    Object.defineProperty(response, 'url', { value: `${origin}/v1/aci/sessions/${sessionId}` });
    return response;
  });
  return {
    verifier,
    sessionBytes: Buffer.byteLength(body),
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
        data.endsWith(',')
          ? 'public_aci_session_evidence_encoding_invalid'
          : 'public_aci_session_schema_invalid',
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
    await expect(verifier.verify(input)).rejects.toThrow(
      'public_aci_session_channel_policy_failed',
    );
  });

  it('rejects an unlisted e2ee algorithm even beside an accepted TLS binding', async () => {
    const { verifier, input } = setup({
      channel_binding: [channelBinding, e2eeBinding('secp256k1-aes-256-gcm-hkdf-sha256')],
    });
    await expect(verifier.verify(input)).rejects.toThrow(
      'public_aci_session_channel_policy_failed',
    );
  });

  it('rejects a TLS binding when the policy accepts only e2ee', async () => {
    const { verifier, input } = setup();
    input.policy = {
      ...input.policy,
      acceptedChannelBindings: input.policy.acceptedChannelBindings.filter(
        (binding) => binding.type === 'e2ee_public_key_sha256',
      ),
    };
    await expect(verifier.verify(input)).rejects.toThrow(
      'public_aci_session_channel_policy_failed',
    );
  });

  it('rejects a policy that accepts no channel binding', async () => {
    const { verifier, input } = setup();
    input.policy = { ...input.policy, acceptedChannelBindings: [] };
    await expect(verifier.verify(input)).rejects.toThrow('public_aci_channel_policy_invalid');
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
      await expect(verifier.verify(input)).rejects.toThrow('public_aci_policy_origin_invalid');
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
    await expect(verifier.verify(input)).rejects.toThrow('public_aci_session_binding_invalid');
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
    ['no upstream event', [], 'public_aci_upstream_event_absent'],
    ['only a failed upstream event', [failed], 'public_aci_upstream_result_unverified'],
    ['a verified but optional upstream', [{ required: false }], 'public_aci_upstream_not_required'],
    [
      'an attested id that differs only in case',
      [{ model_id: 'Qwen/qwen3-embedding-8b-tee' }],
      'public_aci_upstream_model_case_mismatch',
    ],
    [
      'the gateway alias as the upstream id',
      [{ model_id: alias }],
      'public_aci_upstream_model_mismatch',
    ],
    [
      'another attested model',
      [{ model_id: 'Qwen/Qwen3-32B-TEE' }],
      'public_aci_upstream_model_mismatch',
    ],
    [
      'a failed event beside a verified optional one',
      [failed, { required: false }],
      'public_aci_upstream_not_required',
    ],
    [
      'an optional event beside a required other model',
      [{ required: false }, { model_id: 'Qwen/Qwen3-32B-TEE' }],
      'public_aci_upstream_model_mismatch',
    ],
    [
      'a case-only mismatch beside another model',
      [{ model_id: alias }, { model_id: 'QWEN/QWEN3-EMBEDDING-8B-TEE' }],
      'public_aci_upstream_model_case_mismatch',
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
    expect(await refusal(verifier.verify(input))).toBe('public_aci_upstream_model_alias_unmapped');
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
    expect(await refusal(aliased.verifier.verify(aliased.input))).toBe(
      'public_aci_upstream_model_mismatch',
    );
  });

  it.each(DEFAULT_VERIFIED_MODELS)('maps verified model %s to an attested upstream id', (model) => {
    expect(attestedUpstreamModelId(model)).toBeTypeOf('string');
  });

  it.each(['__proto__', 'constructor'])('leaves the alias %s unmapped', (name) => {
    expect(attestedUpstreamModelId(name)).toBeUndefined();
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
    await expect(verifier.verify(input)).rejects.toThrow('public_aci_session_schema_invalid');
  });

  it('accepts an allowlisted evidence-free session behind a verified upstream', async () => {
    const { verifier, input } = evidenceFreeSetup();
    await expect(verifier.verify(input)).resolves.toMatchObject({
      verifierId: chutesVerifier,
      evidenceMode: 'verifier-attested',
      evidenceDigest: null,
    });
  });

  it('keeps the hashed-evidence mode for a session that carries evidence', async () => {
    const { verifier, input } = setup();
    await expect(verifier.verify({ ...input, policy: chutesPolicy() })).resolves.toMatchObject({
      evidenceMode: 'hashed',
      evidenceDigest,
    });
  });

  it.each<[string, PublicAciSessionPolicy]>([
    ['a policy that allowlists no verifier', chutesPolicy([])],
    ['a policy that allowlists another verifier', chutesPolicy(['private-ai-verifier/other/v1'])],
  ])('refuses an evidence-free session under %s', async (_label, sessionPolicy) => {
    const { verifier, input } = evidenceFreeSetup({}, undefined, sessionPolicy);
    await expect(refusal(verifier.verify(input))).resolves.toBe(
      'public_aci_session_evidence_missing',
    );
  });

  it('refuses an evidence-free session from a verifier differing only in case', async () => {
    const { verifier, input } = evidenceFreeSetup({ verifier_id: chutesVerifier.toUpperCase() });
    await expect(refusal(verifier.verify(input))).resolves.toBe(
      'public_aci_session_evidence_missing',
    );
  });

  it.each<[string, readonly UpstreamOverride[], string]>([
    ['a failed upstream', [failed], 'public_aci_upstream_result_unverified'],
    ['an optional upstream', [{ required: false }], 'public_aci_upstream_not_required'],
    [
      'another attested model',
      [{ model_id: 'Qwen/Qwen3-32B-TEE' }],
      'public_aci_upstream_model_mismatch',
    ],
  ])(
    'refuses an allowlisted evidence-free session behind %s',
    async (_label, upstream, expected) => {
      const { verifier, input } = evidenceFreeSetup({}, upstream);
      await expect(refusal(verifier.verify(input))).resolves.toBe(expected);
    },
  );

  it.each<[string, Record<string, unknown>, string]>([
    [
      'an unreviewed channel algorithm',
      { channel_binding: [chutesBinding({ algorithm: 'kyber-512' })] },
      'public_aci_session_channel_policy_failed',
    ],
    [
      'the reviewed algorithm from another provider',
      { channel_binding: [chutesBinding({ provider: 'other' })] },
      'public_aci_session_channel_policy_failed',
    ],
    [
      'a required claim from an unpermitted source',
      {
        claims: {
          tee_attested: { status: 'asserted', source: 'verifier_derived', reason: 'verified' },
        },
      },
      'public_aci_session_claim_policy_failed',
    ],
    [
      'a lifetime longer than the policy permits',
      { expires_at: 201, established_at: 100 },
      'public_aci_session_binding_invalid',
    ],
    [
      'evidence that is not empty',
      { evidence: { note: 'partial' } },
      'public_aci_session_schema_invalid',
    ],
    ['an unknown top-level field', { unknown: true }, 'public_aci_session_schema_invalid'],
  ])('refuses an allowlisted evidence-free session with %s', async (_label, extra, expected) => {
    const { verifier, input } = evidenceFreeSetup(extra);
    await expect(refusal(verifier.verify(input))).resolves.toBe(expected);
  });

  it.each([99, 200])(
    'refuses an allowlisted evidence-free session served outside its window: %s',
    async (servedAt) => {
      const { verifier, input } = evidenceFreeSetup({}, undefined, chutesPolicy(), servedAt);
      await expect(refusal(verifier.verify(input))).resolves.toBe(
        'public_aci_session_binding_invalid',
      );
    },
  );

  it('refuses an allowlisted evidence-free session that does not hash to the cited id', async () => {
    const { input } = evidenceFreeSetup();
    const event = input.receipt.event_log.find((entry) => entry.type === 'upstream.verified');
    const citedId = event && 'session_id' in event ? event.session_id : undefined;
    const substituted = { ...makeSession(), verifier_id: chutesVerifier, evidence: {} };
    const verifier = new PublicAciSessionVerifier(async () => {
      const response = new Response(
        JSON.stringify({ ...substituted, channel_binding: [chutesBinding()], expires_at: 199 }),
        { status: 200 },
      );
      Object.defineProperty(response, 'url', { value: `${origin}/v1/aci/sessions/${citedId}` });
      return response;
    });
    await expect(refusal(verifier.verify(input))).resolves.toBe(
      'public_aci_session_binding_invalid',
    );
  });

  it('refuses the reviewed chutes algorithm under a policy without the chutes channel', async () => {
    const { verifier, input } = evidenceFreeSetup({}, undefined, {
      ...policy(),
      evidenceFreeVerifiers: [chutesVerifier],
    });
    await expect(refusal(verifier.verify(input))).resolves.toBe(
      'public_aci_session_channel_policy_failed',
    );
  });

  it('accepts the observed Phala chutes session end to end', async () => {
    const servedAt = 1_791_763_000;
    const { verifier, input } = setup(observedSession, servedAt);
    await expect(
      verifier.verify({
        ...input,
        trustedNow: servedAt,
        policy: { ...chutesPolicy(), maxSessionLifetimeSeconds: 3_600 },
      }),
    ).resolves.toMatchObject({
      sessionId: OBSERVED_SESSION_ID,
      upstreamName: 'chutes-qwen3-embedding-8b',
      evidenceMode: 'verifier-attested',
    });
  });

  it('refuses the observed Phala chutes session when no verifier is allowlisted', async () => {
    const servedAt = 1_791_763_000;
    const { verifier, input } = setup(observedSession, servedAt);
    await expect(
      refusal(
        verifier.verify({
          ...input,
          trustedNow: servedAt,
          policy: { ...chutesPolicy([]), maxSessionLifetimeSeconds: 3_600 },
        }),
      ),
    ).resolves.toBe('public_aci_session_evidence_missing');
  });

  it.each<[string, Record<string, unknown>]>([
    ['a null evidence member', { evidence: null }],
    [
      'evidence data without a digest',
      { evidence: { data: `data:application/octet-stream;base64,${evidence.toString('base64')}` } },
    ],
  ])('refuses %s as missing evidence', async (_label, extra) => {
    const { verifier, input } = setup(extra);
    await expect(refusal(verifier.verify(input))).resolves.toBe(
      'public_aci_session_evidence_missing',
    );
  });

  it('refuses a receipt outside the contract schema by a fixed sentence', async () => {
    const { verifier, input } = setup();
    await expect(
      refusal(verifier.verify({ ...input, receipt: { ...input.receipt, event_log: [] } })),
    ).resolves.toBe('public_aci_receipt_schema_invalid');
  });

  it('refuses a large evidence blob that does not hash to its digest', async () => {
    const { verifier, input } = setup({
      evidence: {
        digest: `sha256:${'c'.repeat(64)}`,
        data: `data:application/octet-stream;base64,${Buffer.alloc(1_048_577).toString('base64')}`,
      },
    });
    await expect(refusal(verifier.verify(input))).resolves.toBe(
      'public_aci_session_evidence_digest_mismatch',
    );
  });

  it('verifies a session over 1 MiB whose multipart GPU evidence hashes to its digest', async () => {
    const bytes = multipartEvidence(OBSERVED_GPU_EVIDENCE_BYTES);
    const { verifier, input, sessionBytes } = setup({ evidence: multipartEvidenceRef(bytes) });
    expect(sessionBytes).toBeGreaterThan(1_048_576);
    await expect(verifier.verify(input)).resolves.toMatchObject({
      evidenceMode: 'hashed',
      evidenceDigest: `sha256:${sha256Hex(bytes)}`,
    });
  });

  it('refuses large multipart evidence whose digest names other bytes', async () => {
    const bytes = multipartEvidence(OBSERVED_GPU_EVIDENCE_BYTES);
    const tampered = Buffer.from(bytes);
    const last = tampered.length - 1;
    tampered.writeUInt8(tampered.readUInt8(last) ^ 1, last);
    const { verifier, input } = setup({ evidence: multipartEvidenceRef(tampered, bytes) });
    await expect(refusal(verifier.verify(input))).resolves.toBe(
      'public_aci_session_evidence_digest_mismatch',
    );
  });

  it('refuses evidence data past the contract cap while the session is under its own', async () => {
    const bytes = Buffer.alloc(6_000_003);
    const { verifier, input, sessionBytes } = setup({ evidence: multipartEvidenceRef(bytes) });
    expect(sessionBytes).toBeLessThanOrEqual(MAX_SESSION_BYTES);
    await expect(refusal(verifier.verify(input))).resolves.toBe(
      'public_aci_session_schema_invalid',
    );
  });

  it('refuses a session body over the cap before parsing it', async () => {
    const bytes = Buffer.alloc(6_300_000);
    const { verifier, input, sessionBytes } = setup({ evidence: multipartEvidenceRef(bytes) });
    expect(sessionBytes).toBeGreaterThan(MAX_SESSION_BYTES);
    await expect(refusal(verifier.verify(input))).resolves.toBe('public_aci_session_too_large');
  });
});
