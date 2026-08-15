// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import type { AciSession, InferenceModelRole, InferenceTrustPolicyV2 } from '@folklore/contracts';
import { describe, expect, it, vi } from 'vitest';
import { ACI_POLICY_FIXTURE, ACI_SESSION_FIXTURE } from '../../contracts/test/fixtures/aci-v1.js';
import { AciSessionVerifier } from '../src/aci/AciSessionVerifier.js';
import type {
  AciTrustContext,
  AciSessionCandidate,
  AciSessionEvidenceVerifierPort,
  AciSessionVerificationInput,
  TrustedTimeReadContext,
  VerifiedAciKeyset,
  VerifiedAciSessionEvidenceBindings,
} from '../src/ports.js';

const NOW = 1_750_000_100;
const TRUST_CONTEXT: AciTrustContext = {
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  bootEpoch: 'boot-1',
  checkpointDigest: 'a'.repeat(64),
};
const ACTIVATION_GENERATION = 11;
const UPSTREAM_CHANNEL_KEY_DIGEST =
  'sha256:a4bfdc16981feebca6c891c30594fd12093328893084ee4765ffb3b9f166fc3c';
const ROLES: readonly InferenceModelRole[] = ['embed', 'generate', 'critique', 'judge'];
const POLICY: InferenceTrustPolicyV2 = {
  ...ACI_POLICY_FIXTURE,
  channelPolicy: {
    acceptedBindings: [
      {
        type: 'tls_spki_sha256',
        domains: ['upstream.example.com'],
      },
    ],
  },
  requiredSessionClaims: ['tee_attested'],
};
const KEYSET: VerifiedAciKeyset = {
  workloadId: `sha256:${'1'.repeat(64)}`,
  workloadKeysetDigest: `sha256:${'2'.repeat(64)}`,
  version: 1,
  notAfter: NOW + 3_600,
  receiptSigningKeys: [{ keyId: 'receipt-1', algorithm: 'ed25519', publicKey: '3'.repeat(64) }],
  e2eePublicKeys: [
    {
      keyId: 'e2ee-1',
      algorithm: 'x25519-aes-256-gcm-hkdf-sha256',
      publicKey: '4'.repeat(64),
    },
  ],
  tlsPublicKeys: [{ spkiSha256: 'd1'.repeat(32), domain: 'upstream.example.com' }],
  channelPins: [
    {
      type: 'tls_spki_sha256',
      value: 'd1'.repeat(32),
      domain: 'upstream.example.com',
    },
  ],
  channelKeyDigest: `sha256:${'5'.repeat(64)}`,
};
const SESSION = ACI_SESSION_FIXTURE;

type CandidateOverrides = Partial<AciSessionCandidate> & { readonly session?: AciSession };

class AciSessionEvidenceVerifierDouble implements AciSessionEvidenceVerifierPort {
  calls = 0;

  constructor(
    private readonly override?: (
      session: AciSession,
      bindings: VerifiedAciSessionEvidenceBindings,
    ) => VerifiedAciSessionEvidenceBindings | Promise<VerifiedAciSessionEvidenceBindings>,
  ) {}

  async verify(input: Parameters<AciSessionEvidenceVerifierPort['verify']>[0]) {
    this.calls += 1;
    const session = JSON.parse(new TextDecoder().decode(input.sessionBytes)) as AciSession;
    const bindings = {
      sessionId: session.session_id,
      claims: session.claims,
      identity: session.identity ?? null,
      channelBindings: session.channel_binding,
      establishedAt: session.established_at,
      expiresAt: session.expires_at,
      channelKeyDigest: `sha256:${createHash('sha256')
        .update(canonicalJson({ channel_binding: session.channel_binding }))
        .digest('hex')}`,
      upstreamIdentityDigest: withDerivedBindings(session).upstreamIdentityDigest,
    } satisfies VerifiedAciSessionEvidenceBindings;
    return this.override === undefined ? bindings : this.override(session, bindings);
  }
}

function createVerifier(
  policy = POLICY,
  evidenceVerifier = new AciSessionEvidenceVerifierDouble(),
  contexts: TrustedTimeReadContext[] = [],
) {
  return new AciSessionVerifier({
    policy,
    trustedTimeAuthority: {
      read: async (context) => {
        contexts.push(context ?? {});
        return {
          trustedNow: NOW,
          ...TRUST_CONTEXT,
        };
      },
    },
    trustedTimeContext: TRUST_CONTEXT,
    evidenceVerifier,
  });
}

function encodeSession(session: AciSession): Uint8Array {
  try {
    return new TextEncoder().encode(JSON.stringify(session));
  } catch {
    return new TextEncoder().encode(JSON.stringify(SESSION));
  }
}

function candidate(
  role: InferenceModelRole,
  overrides: CandidateOverrides = {},
): AciSessionCandidate {
  const session = overrides.session ?? SESSION;
  return {
    ...baseCandidate(role),
    ...overrides,
    session,
    sessionBytes: overrides.sessionBytes ?? encodeSession(session),
  };
}

function baseCandidate(role: InferenceModelRole): AciSessionCandidate {
  const roleModel = POLICY.roleModels[role];
  return {
    role,
    model: roleModel.model,
    modelRevision: roleModel.revision,
    workloadKeysetDigest: KEYSET.workloadKeysetDigest,
    channelKeyDigest: UPSTREAM_CHANNEL_KEY_DIGEST,
    policyGeneration: POLICY.generation,
    activationGeneration: ACTIVATION_GENERATION,
    session: SESSION,
    sessionBytes: encodeSession(SESSION),
  };
}

function input(candidates = ROLES.map((role) => candidate(role))) {
  return {
    keyset: KEYSET,
    candidates,
    highWater: {
      minimumPolicyGeneration: POLICY.generation,
      minimumActivationGeneration: ACTIVATION_GENERATION,
      minimumKeysetVersion: KEYSET.version,
      supersededKeysetDigests: [],
    },
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function withDerivedBindings(session: AciSession): {
  session: AciSession;
  channelKeyDigest: string;
  upstreamIdentityDigest: string;
} {
  const material = {
    upstream_name: session.upstream_name,
    endpoint: session.endpoint ?? null,
    verifier_id: session.verifier_id,
    identity: session.identity ?? null,
    channel_binding: session.channel_binding,
    claims: session.claims,
    evidence_digest: session.evidence.digest ?? null,
  };
  return {
    session: {
      ...session,
      session_id: `as_${createHash('sha256').update(canonicalJson(material)).digest('hex')}`,
    },
    channelKeyDigest: `sha256:${createHash('sha256')
      .update(canonicalJson({ channel_binding: session.channel_binding }))
      .digest('hex')}`,
    upstreamIdentityDigest: `sha256:${createHash('sha256')
      .update(
        canonicalJson({
          upstream_name: session.upstream_name,
          url_origin: session.endpoint ?? null,
          verifier_id: session.verifier_id,
          channel_bindings: session.channel_binding,
          claims: session.claims,
        }),
      )
      .digest('hex')}`,
  };
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    code,
    message: `ACI session verification failed: ${code}`,
    name: 'AciSessionVerificationError',
  });
}

describe('AciSessionVerifier', () => {
  it('passes the configured context to every security trusted-time read', async () => {
    const contexts: TrustedTimeReadContext[] = [];
    await createVerifier(POLICY, new AciSessionEvidenceVerifierDouble(), contexts).verifyAndSelect(
      input(),
    );

    expect(contexts).toEqual([TRUST_CONTEXT, TRUST_CONTEXT]);
  });
  it('fails closed when V2 trusted time is not configured', async () => {
    await expectCode(
      new AciSessionVerifier({
        policy: POLICY,
        trustedTimeAuthority: {
          read: async () => {
            throw new Error('missing trusted time');
          },
        },
        trustedTimeContext: TRUST_CONTEXT,
        evidenceVerifier: new AciSessionEvidenceVerifierDouble(),
      }).verifyAndSelect(input()),
      'clock_invalid',
    );
  });
  it('rejects a malformed trust policy at construction', () => {
    const policy = { ...POLICY, requiredSessionClaims: [] } as unknown as InferenceTrustPolicyV2;

    expect(() => createVerifier(policy)).toThrowError(
      expect.objectContaining({
        code: 'policy_invalid',
        message: 'ACI session verification failed: policy_invalid',
      }),
    );
  });

  it('rejects candidates that do not cover every required role', async () => {
    const verifier = createVerifier();

    await expect(
      verifier.verifyAndSelect(input(ROLES.slice(0, -1).map((role) => candidate(role)))),
    ).rejects.toMatchObject({
      code: 'role_incomplete',
      message: 'ACI session verification failed: role_incomplete',
      name: 'AciSessionVerificationError',
    });
  });

  it('accepts official endpoint-null E2EE bindings when policy accepts the key metadata', async () => {
    const base = {
      ...POLICY,
      channelPolicy: {
        acceptedBindings: [
          {
            type: 'e2ee_public_key_sha256' as const,
            domains: ['upstream.example.com'],
            algorithms: ['x25519-aes-256-gcm-hkdf-sha256' as const],
          },
        ],
      },
    } satisfies InferenceTrustPolicyV2;
    const session = withDerivedBindings({
      ...SESSION,
      endpoint: null,
      channel_binding: [
        {
          type: 'e2ee_public_key_sha256',
          provider: 'phala',
          key_id: 'e2ee-1',
          algorithm: 'x25519-aes-256-gcm-hkdf-sha256',
          public_key_sha256: '4'.repeat(64),
        },
      ],
    }).session;
    const channelKeyDigest = withDerivedBindings(session).channelKeyDigest;
    const candidates = ROLES.map((role) => candidate(role, { session, channelKeyDigest }));

    await expect(createVerifier(base).verifyAndSelect(input(candidates))).resolves.toMatchObject({
      generate: { sessionId: session.session_id },
    });
  });

  it('rejects evidence that resolves after the aggregate verification deadline', async () => {
    const monotonicNow = vi.spyOn(performance, 'now');
    let elapsed = 10_000;
    monotonicNow.mockImplementation(() => elapsed);
    const verifier = new AciSessionVerifier({
      policy: POLICY,
      trustedTimeAuthority: {
        read: async () => ({
          trustedNow: NOW,
          ...TRUST_CONTEXT,
        }),
      },
      trustedTimeContext: TRUST_CONTEXT,
      evidenceVerifierTimeoutMs: 100,
      evidenceVerifier: new AciSessionEvidenceVerifierDouble((_session, bindings) => {
        elapsed = 10_101;
        return bindings;
      }),
    });

    try {
      await expectCode(verifier.verifyAndSelect(input()), 'session_evidence_verification_failed');
    } finally {
      monotonicNow.mockRestore();
    }
  });

  it('rejects evidence that resolves at the exact aggregate verification deadline', async () => {
    const monotonicNow = vi.spyOn(performance, 'now');
    let elapsed = 20_000;
    monotonicNow.mockImplementation(() => elapsed);
    const evidenceVerifier = new AciSessionEvidenceVerifierDouble((_session, bindings) => {
      elapsed = 20_100;
      return bindings;
    });
    const verifier = new AciSessionVerifier({
      policy: POLICY,
      trustedTimeAuthority: {
        read: async () => ({
          trustedNow: NOW,
          ...TRUST_CONTEXT,
        }),
      },
      trustedTimeContext: TRUST_CONTEXT,
      evidenceVerifierTimeoutMs: 100,
      evidenceVerifier,
    });

    try {
      await expectCode(verifier.verifyAndSelect(input()), 'session_evidence_verification_failed');
      expect(evidenceVerifier.calls).toBe(1);
    } finally {
      monotonicNow.mockRestore();
    }
  });

  it('normalizes injected clock failures to content-free clock_invalid', async () => {
    const verifier = new AciSessionVerifier({
      policy: POLICY,
      trustedTimeAuthority: {
        read: async () => {
          throw new Error('secret-clock-content');
        },
      },
      trustedTimeContext: TRUST_CONTEXT,
      evidenceVerifier: new AciSessionEvidenceVerifierDouble(),
    });

    await expectCode(verifier.verifyAndSelect(input()), 'clock_invalid');
  });

  it('rejects over-deep supplied session identity without surfacing RangeError', async () => {
    let identity: Record<string, unknown> = { leaf: 'redacted' };
    for (let index = 0; index < 12_000; index += 1) identity = { nested: identity };
    const supplied = { ...SESSION, identity } as AciSession;

    await expectCode(
      createVerifier().verifyAndSelect(
        input(
          ROLES.map((role) =>
            candidate(role, { session: supplied, sessionBytes: encodeSession(SESSION) }),
          ),
        ),
      ),
      'session_malformed',
    );
  });

  it('selects one policy-bound session for every role', async () => {
    const evidenceVerifier = new AciSessionEvidenceVerifierDouble();
    const verifier = createVerifier(POLICY, evidenceVerifier);

    const selected = await verifier.verifyAndSelect(input());

    expect(evidenceVerifier.calls).toBe(ROLES.length);
    expect(Object.keys(selected).sort()).toEqual(['critique', 'embed', 'generate', 'judge']);
    for (const role of ROLES) {
      expect(selected[role]).toEqual({
        role,
        model: 'z-ai/glm-5.2',
        modelRevision: '2026-08-09',
        sessionId: ACI_SESSION_FIXTURE.session_id,
        establishedAt: 1_750_000_000,
        expiresAt: 1_750_003_600,
        workloadKeysetDigest: `sha256:${'2'.repeat(64)}`,
        channelKeyDigest: UPSTREAM_CHANNEL_KEY_DIGEST,
        upstreamIdentityDigest: withDerivedBindings(SESSION).upstreamIdentityDigest,
        channelPins: [
          {
            type: 'tls_spki_sha256',
            value: 'd1'.repeat(32),
            domain: 'upstream.example.com',
          },
        ],
      });
    }
  });

  it('accepts bounded verifier-specific identity fields when evidence binds them', async () => {
    const derived = withDerivedBindings({
      ...SESSION,
      identity: { provider_key: 'redacted', nested: { tier: 'hardware' } },
    });
    const candidates = ROLES.map((role) =>
      candidate(role, { session: derived.session, channelKeyDigest: derived.channelKeyDigest }),
    );

    const selected = await createVerifier().verifyAndSelect(input(candidates));

    expect(selected.embed.sessionId).toBe(derived.session.session_id);
  });

  it('rejects when verified session evidence bindings do not match TS-derived values', async () => {
    const evidenceVerifier = new AciSessionEvidenceVerifierDouble((_session, bindings) => ({
      ...bindings,
      sessionId: 'as_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    }));

    await expectCode(
      createVerifier(POLICY, evidenceVerifier).verifyAndSelect(input()),
      'session_evidence_binding_mismatch',
    );
  });

  it('fails closed when session evidence is missing or the injected verifier rejects', async () => {
    const missingEvidence = withDerivedBindings({ ...SESSION, evidence: {} }).session;
    await expectCode(
      createVerifier().verifyAndSelect(
        input(ROLES.map((role) => candidate(role, { session: missingEvidence }))),
      ),
      'session_evidence_missing',
    );

    const rejectingVerifier = new AciSessionEvidenceVerifierDouble(() => {
      throw new Error('native verifier unavailable');
    });
    await expectCode(
      createVerifier(POLICY, rejectingVerifier).verifyAndSelect(input()),
      'session_evidence_verification_failed',
    );
  });

  it('requires the exact policy model and revision for each candidate role', async () => {
    const verifier = createVerifier();
    const wrongModel = ROLES.map((role) =>
      candidate(role, role === 'embed' ? { model: 'other/model' } : {}),
    );
    const wrongRevision = ROLES.map((role) =>
      candidate(role, role === 'embed' ? { modelRevision: 'other-revision' } : {}),
    );

    await expectCode(verifier.verifyAndSelect(input(wrongModel)), 'no_eligible_session');
    await expectCode(verifier.verifyAndSelect(input(wrongRevision)), 'no_eligible_session');
  });

  it('rejects generation rollback and superseded keyset replay', async () => {
    const verifier = createVerifier();
    const baseline = input();

    await expectCode(
      verifier.verifyAndSelect({
        ...baseline,
        highWater: { ...baseline.highWater, minimumPolicyGeneration: POLICY.generation + 1 },
      }),
      'policy_generation_decreased',
    );
    await expectCode(
      verifier.verifyAndSelect({
        ...baseline,
        highWater: { ...baseline.highWater, minimumKeysetVersion: KEYSET.version + 1 },
      }),
      'keyset_version_decreased',
    );
    await expectCode(
      verifier.verifyAndSelect({
        ...baseline,
        highWater: {
          ...baseline.highWater,
          minimumActivationGeneration: ACTIVATION_GENERATION + 1,
        },
      }),
      'activation_generation_decreased',
    );
    await expectCode(
      verifier.verifyAndSelect({
        ...baseline,
        highWater: {
          ...baseline.highWater,
          supersededKeysetDigests: [KEYSET.workloadKeysetDigest],
        },
      }),
      'keyset_superseded',
    );
  });

  it('rejects malformed generation, high-water, and digest inputs', async () => {
    const verifier = createVerifier();
    const baseline = input();
    const malformedInputs = [
      { ...baseline, highWater: { ...baseline.highWater, minimumPolicyGeneration: 1.5 } },
      { ...baseline, highWater: { ...baseline.highWater, minimumActivationGeneration: -1 } },
      { ...baseline, highWater: { ...baseline.highWater, minimumKeysetVersion: 1.5 } },
      { ...baseline, keyset: { ...KEYSET, workloadKeysetDigest: 'not-a-digest' } },
      {
        ...baseline,
        candidates: baseline.candidates.map((item, index) =>
          index === 0 ? { ...item, channelKeyDigest: 'not-a-digest' } : item,
        ),
      },
    ];

    for (const malformed of malformedInputs) {
      await expectCode(
        verifier.verifyAndSelect(malformed as AciSessionVerificationInput),
        'input_invalid',
      );
    }
  });

  it('rejects candidates associated with mixed keyset or generation state', async () => {
    const verifier = createVerifier();
    const mismatches = [
      { workloadKeysetDigest: `sha256:${'6'.repeat(64)}` },
      { policyGeneration: POLICY.generation + 1 },
      { activationGeneration: ACTIVATION_GENERATION + 1 },
    ];

    for (const mismatch of mismatches) {
      const candidates = ROLES.map((role) => candidate(role, role === 'embed' ? mismatch : {}));
      await expectCode(verifier.verifyAndSelect(input(candidates)), 'mixed_state');
    }
  });

  it('rejects a session whose content-addressed identifier does not match its material', async () => {
    const verifier = createVerifier();
    const candidates = ROLES.map((role) =>
      candidate(role, {
        session: { ...SESSION, upstream_name: 'substituted-upstream' },
      }),
    );

    await expectCode(verifier.verifyAndSelect(input(candidates)), 'session_id_mismatch');
  });

  it.each([
    ['literal', '"api_version":"aci/0","api_version":"aci/1"'],
    ['escaped alias', '"api_version":"aci/0","api_\\u0076ersion":"aci/1"'],
  ])('rejects %s duplicate keys in raw session bytes', async (_kind, fields) => {
    const verifier = createVerifier();
    const text = JSON.stringify(SESSION).replace('"api_version":"aci/1"', fields);
    const candidates = ROLES.map((role) =>
      candidate(role, { sessionBytes: new TextEncoder().encode(text) }),
    );

    await expectCode(verifier.verifyAndSelect(input(candidates)), 'session_malformed');
  });

  it('rejects malformed runtime session fields before canonical interpretation', async () => {
    const verifier = createVerifier();
    const session = {
      ...SESSION,
      established_at: String(SESSION.established_at),
    } as unknown as AciSession;
    const candidates = ROLES.map((role) => candidate(role, { session }));

    await expectCode(verifier.verifyAndSelect(input(candidates)), 'session_malformed');
  });

  it('rejects non-integer and non-plain canonical session material', async () => {
    const verifier = createVerifier();
    const invalidValues: readonly unknown[] = [
      1.5,
      Number.MAX_SAFE_INTEGER + 1,
      Number.NaN,
      new Date('2026-08-13T00:00:00.000Z'),
    ];

    for (const invalidValue of invalidValues) {
      const session = {
        ...SESSION,
        claims: {
          ...SESSION.claims,
          extra: { content_marker_must_not_escape: invalidValue },
        },
      } as unknown as AciSession;
      const candidates = ROLES.map((role) => candidate(role, { session }));

      await expectCode(verifier.verifyAndSelect(input(candidates)), 'session_malformed');
    }
  });

  it('bounds canonical session material by cycles, depth, nodes, and bytes', async () => {
    const verifier = createVerifier();
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    let tooDeep: Record<string, unknown> = {};
    for (let index = 0; index < 40; index += 1) tooDeep = { nested: tooDeep };
    const invalidValues: readonly unknown[] = [
      cyclic,
      tooDeep,
      Array.from({ length: 4_096 }, () => null),
      'content_marker_must_not_escape'.repeat(40_000),
    ];

    for (const invalidValue of invalidValues) {
      const session = {
        ...SESSION,
        claims: { ...SESSION.claims, extra: { invalid: invalidValue } },
      } as unknown as AciSession;
      const candidates = ROLES.map((role) => candidate(role, { session }));

      await expectCode(verifier.verifyAndSelect(input(candidates)), 'session_malformed');
    }
  });

  it('restores omitted optional session material as null when recomputing the identifier', async () => {
    const verifier = createVerifier();
    const session = withDerivedBindings({
      api_version: SESSION.api_version,
      session_id: SESSION.session_id,
      upstream_name: SESSION.upstream_name,
      verifier_id: SESSION.verifier_id,
      established_at: SESSION.established_at,
      expires_at: SESSION.expires_at,
      channel_binding: SESSION.channel_binding,
      claims: SESSION.claims,
      evidence: SESSION.evidence,
    }).session;
    const candidates = ROLES.map((role) => candidate(role, { session }));

    const selected = await verifier.verifyAndSelect(input(candidates));
    expect(selected.embed.sessionId).toBe(session.session_id);
  });

  it('rejects evidence bytes that do not match the session evidence digest', async () => {
    const verifier = createVerifier();
    const candidates = ROLES.map((role) =>
      candidate(role, {
        session: {
          ...SESSION,
          evidence: {
            ...SESSION.evidence,
            data: 'data:text/plain;base64,eHl6',
          },
        },
      }),
    );

    await expectCode(verifier.verifyAndSelect(input(candidates)), 'evidence_digest_mismatch');
  });

  it('rejects non-canonical Base64 evidence data even when permissive decoding yields the digest', async () => {
    const verifier = createVerifier();
    const session = {
      ...SESSION,
      evidence: {
        ...SESSION.evidence,
        data: 'data:text/plain;base64,ZXhhbXBsZS1ldmlkZW5jZQ====',
      },
    } as unknown as AciSession;
    const candidates = ROLES.map((role) => candidate(role, { session }));

    await expectCode(verifier.verifyAndSelect(input(candidates)), 'evidence_digest_mismatch');
  });

  it('rejects Base64URL evidence under the standard Base64 data-URI marker', async () => {
    const verifier = createVerifier();
    const evidenceBytes = Buffer.from([0xfb]);
    const derived = withDerivedBindings({
      ...SESSION,
      evidence: {
        digest: `sha256:${createHash('sha256').update(evidenceBytes).digest('hex')}`,
        data: `data:application/octet-stream;base64,${evidenceBytes.toString('base64url')}`,
      },
    });
    const candidates = ROLES.map((role) =>
      candidate(role, { session: derived.session, channelKeyDigest: derived.channelKeyDigest }),
    );

    await expectCode(verifier.verifyAndSelect(input(candidates)), 'evidence_digest_mismatch');
  });

  it('requires every policy claim to be asserted by a permitted source', async () => {
    const verifier = createVerifier();
    const invalidSessions = [
      withDerivedBindings({
        ...SESSION,
        claims: { ...SESSION.claims, tee_attested: { status: 'unknown' as const } },
      }).session,
      withDerivedBindings({
        ...SESSION,
        claims: {
          ...SESSION.claims,
          tee_attested: {
            status: 'asserted' as const,
            source: 'provider_asserted' as const,
            reason: 'provider says so',
          },
        },
      }).session,
    ];

    for (const session of invalidSessions) {
      const candidates = ROLES.map((role) => candidate(role, role === 'embed' ? { session } : {}));
      await expectCode(verifier.verifyAndSelect(input(candidates)), 'no_eligible_session');
    }
  });

  it('appraises upstream bindings independently from aggregator keyset pins', async () => {
    const verifier = createVerifier();
    const candidates = ROLES.map((role) =>
      candidate(role, { channelKeyDigest: UPSTREAM_CHANNEL_KEY_DIGEST }),
    );
    const baseline = input(candidates);

    const selected = await verifier.verifyAndSelect({
      ...baseline,
      keyset: {
        ...KEYSET,
        channelPins: [
          {
            type: 'tls_spki_sha256',
            value: 'aa'.repeat(32),
            domain: 'inference.phala.com',
          },
        ],
      },
    });

    expect(selected.embed.channelKeyDigest).toBe(UPSTREAM_CHANNEL_KEY_DIGEST);
    expect(selected.embed.channelPins).toEqual([
      {
        type: 'tls_spki_sha256',
        value: 'd1'.repeat(32),
        domain: 'upstream.example.com',
      },
    ]);
  });

  it('normalizes E2EE session pins from the official binding without an endpoint domain', async () => {
    const policy: InferenceTrustPolicyV2 = {
      ...POLICY,
      channelPolicy: {
        acceptedBindings: [
          {
            type: 'e2ee_public_key_sha256',
            domains: ['upstream.example.com'],
            algorithms: ['x25519-aes-256-gcm-hkdf-sha256'],
          },
        ],
      },
    };
    const session = withDerivedBindings({
      ...SESSION,
      channel_binding: [
        {
          type: 'e2ee_public_key_sha256',
          provider: 'upstream-provider',
          key_id: 'e2ee-1',
          algorithm: 'x25519-aes-256-gcm-hkdf-sha256',
          public_key_sha256: 'e2'.repeat(32),
        },
      ],
    });
    const verifier = createVerifier(policy);
    const selected = await verifier.verifyAndSelect({
      ...input(
        ROLES.map((role) =>
          candidate(role, { session: session.session, channelKeyDigest: session.channelKeyDigest }),
        ),
      ),
    });

    expect(selected.embed.channelPins).toEqual([
      {
        type: 'e2ee_public_key_sha256',
        value: 'e2'.repeat(32),
        provider: 'upstream-provider',
        keyId: 'e2ee-1',
        algorithm: 'x25519-aes-256-gcm-hkdf-sha256',
      },
    ]);
  });

  it('accepts a policy-authorized TLS certificate binding', async () => {
    const policy = {
      ...POLICY,
      channelPolicy: {
        acceptedBindings: [
          { type: 'tls_certificate_sha256' as const, domains: ['upstream.example.com'] },
        ],
      },
    };
    const verifier = createVerifier(policy);
    const derived = withDerivedBindings({
      ...SESSION,
      channel_binding: [
        {
          type: 'tls_certificate_sha256',
          origin: 'https://upstream.example.com',
          certificate_sha256: 'ab'.repeat(32),
        },
      ],
    });
    const candidates = ROLES.map((role) =>
      candidate(role, { session: derived.session, channelKeyDigest: derived.channelKeyDigest }),
    );

    const selected = await verifier.verifyAndSelect(input(candidates));

    expect(selected.embed.channelPins[0]).toEqual({
      type: 'tls_certificate_sha256',
      value: 'ab'.repeat(32),
      domain: 'upstream.example.com',
    });
  });

  it('rejects a non-HTTPS session endpoint and TLS binding at runtime', async () => {
    const verifier = createVerifier();
    const derived = withDerivedBindings({
      ...SESSION,
      endpoint: 'http://upstream.example.com',
      channel_binding: [
        {
          type: 'tls_spki_sha256',
          origin: 'http://upstream.example.com',
          spki_sha256: 'd1'.repeat(32),
        },
      ],
    } as AciSession);
    const candidates = ROLES.map((role) =>
      candidate(role, { session: derived.session, channelKeyDigest: derived.channelKeyDigest }),
    );

    await expectCode(verifier.verifyAndSelect(input(candidates)), 'session_malformed');
  });

  it('requires an authorized E2EE algorithm and endpoint domain', async () => {
    const policy = {
      ...POLICY,
      channelPolicy: {
        acceptedBindings: [
          {
            type: 'e2ee_public_key_sha256' as const,
            domains: ['upstream.example.com'],
            algorithms: ['x25519-aes-256-gcm-hkdf-sha256' as const],
          },
        ],
      },
    };
    const verifier = createVerifier(policy);
    const derived = withDerivedBindings({
      ...SESSION,
      channel_binding: [
        {
          type: 'e2ee_public_key_sha256',
          provider: 'demo-upstream',
          key_id: 'e2ee-upstream',
          algorithm: 'x25519-aes-256-gcm-hkdf-sha256',
          public_key_sha256: 'cd'.repeat(32),
        },
      ],
    });
    const candidates = ROLES.map((role) =>
      candidate(role, { session: derived.session, channelKeyDigest: derived.channelKeyDigest }),
    );

    const selected = await verifier.verifyAndSelect(input(candidates));
    expect(selected.embed.channelPins[0]).toMatchObject({
      type: 'e2ee_public_key_sha256',
      algorithm: 'x25519-aes-256-gcm-hkdf-sha256',
      provider: 'demo-upstream',
    });

    const disallowed = withDerivedBindings({
      ...derived.session,
      endpoint: 'https://other.example.com',
    });
    const rejected = ROLES.map((role) =>
      candidate(role, {
        session: disallowed.session,
        channelKeyDigest: disallowed.channelKeyDigest,
      }),
    );
    await expectCode(verifier.verifyAndSelect(input(rejected)), 'channel_binding_mismatch');
  });

  it('rejects a candidate channel digest that does not match its canonical binding material', async () => {
    const verifier = createVerifier();
    const candidates = ROLES.map((role) =>
      candidate(role, role === 'embed' ? { channelKeyDigest: `sha256:${'7'.repeat(64)}` } : {}),
    );

    await expectCode(verifier.verifyAndSelect(input(candidates)), 'channel_binding_mismatch');
  });

  it('enforces maximum lifetime, current eligibility, and future clock skew', async () => {
    const verifier = createVerifier();
    const ineligibleSessions = [
      { ...SESSION, expires_at: SESSION.established_at + POLICY.maxSessionLifetimeSeconds + 1 },
      { ...SESSION, expires_at: NOW },
      {
        ...SESSION,
        established_at: NOW + POLICY.clockSkewSeconds + 1,
        expires_at: NOW + POLICY.clockSkewSeconds + 601,
      },
    ];

    for (const session of ineligibleSessions) {
      const candidates = ROLES.map((role) => candidate(role, role === 'embed' ? { session } : {}));
      await expectCode(verifier.verifyAndSelect(input(candidates)), 'no_eligible_session');
    }

    const boundarySession = {
      ...SESSION,
      established_at: NOW + POLICY.clockSkewSeconds,
      expires_at: NOW + POLICY.clockSkewSeconds + 600,
    };
    const boundaryCandidates = ROLES.map((role) =>
      candidate(role, role === 'embed' ? { session: boundarySession } : {}),
    );
    const selected = await verifier.verifyAndSelect(input(boundaryCandidates));
    expect(selected.embed.establishedAt).toBe(NOW + POLICY.clockSkewSeconds);
  });

  it('rejects an expired verified keyset', async () => {
    const verifier = createVerifier();
    const baseline = input();

    await expectCode(
      verifier.verifyAndSelect({
        ...baseline,
        keyset: { ...KEYSET, notAfter: NOW },
      }),
      'keyset_expired',
    );
  });

  it('rejects a non-integer, non-finite, unsafe, or negative clock value', async () => {
    const invalidTimes = [NOW + 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1, -1];

    for (const invalidTime of invalidTimes) {
      const verifier = new AciSessionVerifier({
        policy: POLICY,
        trustedTimeAuthority: {
          read: async () => ({ trustedNow: invalidTime, ...TRUST_CONTEXT }),
        },
        trustedTimeContext: TRUST_CONTEXT,
        evidenceVerifier: new AciSessionEvidenceVerifierDouble(),
      });
      await expectCode(verifier.verifyAndSelect(input()), 'clock_invalid');
    }
  });

  it('selects latest-established then lexicographically smallest session id', async () => {
    const verifier = createVerifier();
    const older = candidate('embed', {
      session: { ...SESSION, established_at: NOW - 200, expires_at: NOW + 400 },
    });
    const tiedSessions = ['alpha-upstream', 'omega-upstream'].map(
      (upstreamName) =>
        withDerivedBindings({
          ...SESSION,
          upstream_name: upstreamName,
          established_at: NOW - 50,
          expires_at: NOW + 550,
        }).session,
    );
    const tiedCandidates = tiedSessions.map((session) => candidate('embed', { session }));
    const expectedSessionId = tiedSessions.map((session) => session.session_id).sort()[0];
    const otherRoles = ROLES.filter((role) => role !== 'embed').map((role) => candidate(role));
    const candidates = [older, ...tiedCandidates, ...otherRoles];

    const forward = await verifier.verifyAndSelect(input(candidates));
    const reverse = await verifier.verifyAndSelect(input([...candidates].reverse()));

    expect(forward.embed.sessionId).toBe(expectedSessionId);
    expect(reverse.embed.sessionId).toBe(expectedSessionId);
  });

  it('publishes a deeply immutable result without aliasing keyset pins', async () => {
    const verifier = createVerifier();

    const selected = await verifier.verifyAndSelect(input());

    expect(Object.isFrozen(selected)).toBe(true);
    expect(Object.isFrozen(selected.embed)).toBe(true);
    expect(Object.isFrozen(selected.embed.channelPins)).toBe(true);
    expect(Object.isFrozen(selected.embed.channelPins[0])).toBe(true);
    expect(selected.embed.channelPins).not.toBe(KEYSET.channelPins);
    expect(selected.embed.channelPins[0]).not.toBe(KEYSET.channelPins[0]);
  });
});
