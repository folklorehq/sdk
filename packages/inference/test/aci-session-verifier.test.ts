// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  aciSessionSchema,
  inferenceTrustPolicyV2Schema,
  type AciDstackRawEvidenceV1,
  type AciSession,
  type InferenceModelRole,
  type InferenceTrustPolicyV2,
} from '@folklore/contracts';
import { RawEvidenceDigestAuthority } from './doubles/aci/RawEvidenceDigestAuthority.js';
import { describe, expect, it, vi } from 'vitest';
import { ACI_POLICY_FIXTURE, ACI_SESSION_FIXTURE } from '../../contracts/test/fixtures/aci-v1.js';
import { AciSessionVerifier, LegacyAciSessionVerifier } from '../src/aci/AciSessionVerifier.js';
import { AciNativeSessionEvidenceVerifier } from '../src/aci/AciNativeSessionEvidenceVerifier.js';
import { containsReservedRawEvidenceMarker } from '../src/aci/raw-evidence-classification.js';
import type {
  AciTrustContext,
  AciSessionCandidate,
  AciSessionEvidenceVerifierPort,
  LegacyAciSessionEvidenceVerifierPort,
  AciNativeEvidenceVerificationInputV2,
  AciSessionVerificationInput,
  AciTrustHighWater,
  TrustedTimeReadContext,
  VerifiedAciKeyset,
  VerifiedAciSessionEvidenceBindings,
  VerifiedAciSessionEvidenceBindingsV2,
} from '../src/ports.js';
import { InMemoryAciKeysetHighWaterAuthority } from './doubles/aci/InMemoryAciStores.js';

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
const POLICY: InferenceTrustPolicyV2 = inferenceTrustPolicyV2Schema.parse({
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
});
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
const SESSION = aciSessionSchema.parse(ACI_SESSION_FIXTURE);
const RAW_EVIDENCE_FIXTURE = JSON.parse(
  readFileSync(
    new URL('./fixtures/official-aci/dstack-tdx-lite-raw-evidence.json', import.meta.url),
    'utf8',
  ),
) as AciDstackRawEvidenceV1;
const RAW_EVIDENCE_DIGEST_AUTHORITY = new RawEvidenceDigestAuthority();

function keysetAuthority(
  overrides: Partial<AciTrustHighWater> = {},
): InMemoryAciKeysetHighWaterAuthority {
  return new InMemoryAciKeysetHighWaterAuthority({
    generation: 1,
    policyGeneration: POLICY.generation,
    activationGeneration: ACTIVATION_GENERATION,
    keysetVersion: KEYSET.version,
    currentKeysetDigest: KEYSET.workloadKeysetDigest,
    supersededKeysetDigests: [],
    trustContext: TRUST_CONTEXT,
    ...overrides,
  });
}

type CandidateOverrides = Partial<AciSessionCandidate> & { readonly session?: AciSession };

class AciSessionEvidenceVerifierDouble implements LegacyAciSessionEvidenceVerifierPort {
  calls = 0;
  readonly evidenceBytes: Uint8Array[] = [];

  constructor(
    private readonly override?: (
      session: AciSession,
      bindings: VerifiedAciSessionEvidenceBindings,
    ) => VerifiedAciSessionEvidenceBindings | Promise<VerifiedAciSessionEvidenceBindings>,
  ) {}

  async verify(input: Parameters<LegacyAciSessionEvidenceVerifierPort['verify']>[0]) {
    this.calls += 1;
    this.evidenceBytes.push(Uint8Array.from(input.evidenceBytes));
    const session = JSON.parse(new TextDecoder().decode(input.sessionBytes)) as AciSession;
    const bindings = {
      sessionId: sessionId(session),
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

function testTranscriptDigest(input: AciNativeEvidenceVerificationInputV2): string {
  return `sha256:${createHash('sha256')
    .update('folklore.aci-native-transcript.test.v1\u0000')
    .update(input.expectation.evidenceDigest)
    .digest('hex')}`;
}

const strictEvidenceVerifier: AciSessionEvidenceVerifierPort = {
  verify: async (input) => {
    const session = JSON.parse(new TextDecoder().decode(input.subjectBytes)) as AciSession;
    const bindings = withDerivedBindings(session);
    return {
      sessionId: input.expectation.expectedSessionId,
      claims: session.claims,
      identity: session.identity ?? null,
      channelBindings: session.channel_binding,
      establishedAt: session.established_at,
      expiresAt: session.expires_at,
      channelKeyDigest: bindings.channelKeyDigest,
      upstreamIdentityDigest: bindings.upstreamIdentityDigest,
      evidenceTranscriptDigest: testTranscriptDigest(input),
    };
  },
};

function createVerifier(
  policy = POLICY,
  evidenceVerifier: LegacyAciSessionEvidenceVerifierPort = new AciSessionEvidenceVerifierDouble(),
  contexts: TrustedTimeReadContext[] = [],
  authority = keysetAuthority(),
) {
  return new LegacyAciSessionVerifier({
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
    keysetHighWaterAuthority: authority,
  });
}

function createStrictVerifier(
  evidenceVerifier: AciSessionEvidenceVerifierPort,
  timeoutMs?: number,
) {
  return new AciSessionVerifier({
    policy: POLICY,
    trustedTimeAuthority: { read: async () => ({ trustedNow: NOW, ...TRUST_CONTEXT }) },
    trustedTimeContext: TRUST_CONTEXT,
    evidenceVerifier,
    rawEvidenceDigestAuthority: RAW_EVIDENCE_DIGEST_AUTHORITY,
    nativeVerifierTimeoutMs: timeoutMs,
    keysetHighWaterAuthority: keysetAuthority(),
  });
}

function encodeSession(session: AciSession): Uint8Array {
  try {
    return new TextEncoder().encode(JSON.stringify(session));
  } catch {
    return new TextEncoder().encode(JSON.stringify(SESSION));
  }
}

function nativeSessionInput(session: AciSession): Omit<
  AciNativeEvidenceVerificationInputV2,
  'expectation'
> & {
  readonly expectation: Omit<
    AciNativeEvidenceVerificationInputV2['expectation'],
    'deadline' | 'signal'
  >;
} {
  return {
    evidence: RAW_EVIDENCE_FIXTURE,
    subjectBytes: encodeSession(session),
    expectation: {
      purpose: 'session',
      subjectDigest: sessionSubjectDigest(session),
      reportNonce: null,
      expectedSessionId: sessionId(session),
      expectedWorkloadKeysetDigest: KEYSET.workloadKeysetDigest,
      evidenceDigest: `sha256:${'7'.repeat(64)}`,
      evaluationTimeUnixSeconds: NOW,
      policyAnchors: POLICY,
    },
  };
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
    sessionId: overrides.sessionId ?? safeSessionId(session),
    channelKeyDigest: overrides.channelKeyDigest ?? safeChannelKeyDigest(session),
    sessionBytes: overrides.sessionBytes ?? encodeSession(session),
  };
}

function baseCandidate(role: InferenceModelRole): AciSessionCandidate {
  const roleModel = POLICY.roleModels[role];
  return {
    role,
    model: roleModel.model,
    modelRevision: roleModel.revision,
    sessionId: sessionId(SESSION),
    workloadKeysetDigest: KEYSET.workloadKeysetDigest,
    channelKeyDigest: UPSTREAM_CHANNEL_KEY_DIGEST,
    policyGeneration: POLICY.generation,
    activationGeneration: ACTIVATION_GENERATION,
    session: SESSION,
    sessionBytes: encodeSession(SESSION),
  };
}

function input(
  candidates = ROLES.map((role) => candidate(role)),
  keyset: VerifiedAciKeyset = KEYSET,
) {
  return {
    keyset,
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
  return {
    session,
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

function rawSession(
  sessionId = sessionSubjectDigest(SESSION),
  workloadKeysetDigest = KEYSET.workloadKeysetDigest,
  extra: Record<string, unknown> = {},
): AciSession {
  const evidence: AciDstackRawEvidenceV1 & Record<string, unknown> = {
    ...RAW_EVIDENCE_FIXTURE,
    session_id: sessionId,
    workload_keyset_digest: workloadKeysetDigest,
    ...extra,
  };
  const bytes = new TextEncoder().encode(JSON.stringify(evidence));
  return {
    ...SESSION,
    evidence: {
      digest: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      data: `data:application/octet-stream;base64,${Buffer.from(bytes).toString('base64')}`,
    },
  };
}

function defineOwnProto<T extends object>(target: T, value: unknown): T {
  Object.defineProperty(target, '__proto__', {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
  return target;
}

function sessionSubjectDigest(session: AciSession): string {
  return `sha256:${createHash('sha256')
    .update(canonicalJson({ ...session, evidence: null }))
    .digest('hex')}`;
}

function safeChannelKeyDigest(session: AciSession): string {
  try {
    return withDerivedBindings(session).channelKeyDigest;
  } catch {
    return UPSTREAM_CHANNEL_KEY_DIGEST;
  }
}

function sessionId(session: AciSession): string {
  return createHash('sha256').update(canonicalJson(session)).digest('hex');
}

function safeSessionId(session: AciSession): string {
  try {
    return sessionId(session);
  } catch {
    return '0'.repeat(64);
  }
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toMatchObject({
    code,
    message: `ACI session verification failed: ${code}`,
    name: 'AciSessionVerificationError',
  });
}

describe('AciSessionVerifier', () => {
  it.each([
    ['BOM', '\uFEFF{"format":"dstack-native-evidence"}'],
    ['comment', '{/*x*/"format":"dstack-native-evidence"}'],
    ['trailing comma', '{"format":"dstack-native-evidence",}'],
    ['extra token', '{"format":"dstack-native-evidence"}true'],
  ])('fails closed on %s session evidence carrying the reserved marker', (_kind, text) => {
    expect(containsReservedRawEvidenceMarker(new TextEncoder().encode(text))).toBe(true);
  });

  it('fails closed when a benign session evidence root precedes a reserved-marker root', () => {
    const text =
      '{"format":"provider-json-v7","payload":"opaque"}' + '{"format":"dstack-native-evidence"}';

    expect(containsReservedRawEvidenceMarker(new TextEncoder().encode(text))).toBe(true);
  });

  it.each(['null', 'true', 'false', '0', '-1'])(
    'rejects a %s root before reserved-marker evidence before legacy verification',
    async (primitive) => {
      const evidenceBytes = new TextEncoder().encode(
        `${primitive}{"format":"dstack-native-evidence"}`,
      );
      const session = withDerivedBindings({
        ...SESSION,
        evidence: {
          digest: `sha256:${createHash('sha256').update(evidenceBytes).digest('hex')}`,
          data: `data:application/octet-stream;base64,${Buffer.from(evidenceBytes).toString('base64')}`,
        },
      }).session;
      const legacyPort = new AciSessionEvidenceVerifierDouble();

      await expect(
        createVerifier(POLICY, legacyPort).verifyAndSelect(
          input(ROLES.map((role) => candidate(role, { session }))),
        ),
      ).rejects.toBeDefined();
      expect(legacyPort.calls).toBe(0);
    },
  );

  it('preserves genuinely opaque non-JSON legacy session evidence', () => {
    expect(
      containsReservedRawEvidenceMarker(new TextEncoder().encode('opaque-provider-evidence')),
    ).toBe(false);
  });

  it('accepts opaque provider evidence but keeps the reserved native marker out of legacy verification', async () => {
    for (const evidenceBytes of [
      new TextEncoder().encode('{"format":"provider-json-v7","payload":"opaque"}'),
      new TextEncoder().encode(
        '{"format":"provider-json-v7","duplicate":1,"duplicate":2,"é":"opaque"}',
      ),
    ]) {
      const session = withDerivedBindings({
        ...SESSION,
        evidence: {
          digest: `sha256:${createHash('sha256').update(evidenceBytes).digest('hex')}`,
          data: `data:application/octet-stream;base64,${Buffer.from(evidenceBytes).toString('base64')}`,
        },
      }).session;
      const legacyPort = new AciSessionEvidenceVerifierDouble();

      await expect(
        createVerifier(POLICY, legacyPort).verifyAndSelect(
          input(ROLES.map((role) => candidate(role, { session }))),
        ),
      ).resolves.toBeDefined();
      expect(legacyPort.calls).toBe(ROLES.length);
    }

    for (const evidenceBytes of [
      new TextEncoder().encode('{"format":"dstack-native-evidence"}'),
      new TextEncoder().encode('{"format":"dstack-native-evidence","quote_base64":"malformed"}'),
      new TextEncoder().encode('{"wrapper":{"format":"dstack-native-evidence"}}'),
      new TextEncoder().encode('{"format":"provider-json-v7","format":"dstack-native-evidence"}'),
    ]) {
      const session = withDerivedBindings({
        ...SESSION,
        evidence: {
          digest: `sha256:${createHash('sha256').update(evidenceBytes).digest('hex')}`,
          data: `data:application/octet-stream;base64,${Buffer.from(evidenceBytes).toString('base64')}`,
        },
      }).session;
      const legacyPort = new AciSessionEvidenceVerifierDouble();

      await expect(
        createVerifier(POLICY, legacyPort).verifyAndSelect(
          input(ROLES.map((role) => candidate(role, { session }))),
        ),
      ).rejects.toBeDefined();
      expect(legacyPort.calls).toBe(0);
    }
  });

  it.each([
    [
      'a marker inside nested JSON string nodes',
      {
        payload: JSON.stringify({
          nested: JSON.stringify({ format: 'dstack-native-evidence' }),
        }),
      },
    ],
    [
      'a marker inside a JSON string array element',
      { payload: [JSON.stringify({ format: 'dstack-native-evidence' })] },
    ],
    [
      'escaped marker property names and values inside a JSON string',
      { payload: '{"\\u0066ormat":"dstack-native-\\u0065vidence"}' },
    ],
    [
      'root evidence encoded beyond the inspection limit',
      Array.from({ length: 10 }).reduce<string>(
        (nested) => JSON.stringify(nested),
        JSON.stringify({ format: 'provider-json-v7' }),
      ),
    ],
    [
      'embedded JSON deeper than the inspection limit',
      {
        payload: Array.from({ length: 10 }).reduce<string>(
          (nested) => JSON.stringify(nested),
          JSON.stringify({ format: 'provider-json-v7' }),
        ),
      },
    ],
    [
      'evidence exceeding the inspection node budget',
      { values: Array.from({ length: 5_000 }, (_, index) => `opaque-${index}`) },
    ],
  ])('rejects %s before legacy session verification', async (_name, evidence) => {
    const evidenceBytes = new TextEncoder().encode(JSON.stringify(evidence));
    const session = withDerivedBindings({
      ...SESSION,
      evidence: {
        digest: `sha256:${createHash('sha256').update(evidenceBytes).digest('hex')}`,
        data: `data:application/octet-stream;base64,${Buffer.from(evidenceBytes).toString('base64')}`,
      },
    }).session;
    const legacyPort = new AciSessionEvidenceVerifierDouble();

    await expect(
      createVerifier(POLICY, legacyPort).verifyAndSelect(
        input(ROLES.map((role) => candidate(role, { session }))),
      ),
    ).rejects.toBeDefined();
    expect(legacyPort.calls).toBe(0);
  });

  it('constructs trusted native evidence expectations', async () => {
    const session = rawSession();
    const subjectDigest = sessionSubjectDigest(session);
    const expectedSessionId = sessionId(session);
    expect(subjectDigest).toBe(
      'sha256:14d6cacafcd1eb81d7afff83e67c1a3b496aa7d3804a15d402461ffba20fdcbc',
    );
    expect(subjectDigest).not.toBe(expectedSessionId);
    const inputs: AciNativeEvidenceVerificationInputV2[] = [];
    const bindings = withDerivedBindings(session);
    const evidenceVerifier: AciSessionEvidenceVerifierPort = {
      verify: vi.fn(async (nativeInput) => {
        inputs.push(nativeInput);
        const parsedSession = JSON.parse(
          new TextDecoder().decode(nativeInput.subjectBytes),
        ) as AciSession;
        const parsedBindings = withDerivedBindings(parsedSession);
        return {
          sessionId: nativeInput.expectation.expectedSessionId,
          claims: parsedSession.claims,
          identity: parsedSession.identity ?? null,
          channelBindings: parsedSession.channel_binding,
          establishedAt: parsedSession.established_at,
          expiresAt: parsedSession.expires_at,
          channelKeyDigest: parsedBindings.channelKeyDigest,
          upstreamIdentityDigest: parsedBindings.upstreamIdentityDigest,
          evidenceTranscriptDigest: testTranscriptDigest(nativeInput),
        };
      }),
    };
    const candidates = ROLES.map((role) => candidate(role, { session }));

    await createStrictVerifier(evidenceVerifier).verifyAndSelect(input(candidates));

    expect(inputs).toHaveLength(4);
    expect(inputs[0]?.expectation).toMatchObject({
      purpose: 'session',
      subjectDigest,
      reportNonce: null,
      expectedSessionId,
      expectedWorkloadKeysetDigest: KEYSET.workloadKeysetDigest,
      evaluationTimeUnixSeconds: NOW,
    });
    const subjectBytes = inputs[0]?.subjectBytes;
    expect(subjectBytes).toEqual(
      new TextEncoder().encode(canonicalJson({ ...session, evidence: null })),
    );
    expect(
      `sha256:${createHash('sha256')
        .update(subjectBytes ?? new Uint8Array())
        .digest('hex')}`,
    ).toBe(inputs[0]?.expectation.subjectDigest);
    expect(inputs[0]?.evidence.session_id).toBe(subjectDigest);
    expect(inputs[0]?.expectation.expectedSessionId).toBe(expectedSessionId);
    expect(inputs[0]?.expectation.evidenceDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(inputs[0]?.expectation.signal).toBeInstanceOf(AbortSignal);
    expect(inputs[0]?.expectation.deadline).toBeGreaterThan(0);
    expect(Object.keys(inputs[0] ?? {}).sort()).toEqual([
      'evidence',
      'expectation',
      'subjectBytes',
    ]);

    const fullIdSubstitution = rawSession(expectedSessionId);
    const substitutionPort = { verify: vi.fn(async () => bindings as never) };
    await expectCode(
      createStrictVerifier(substitutionPort).verifyAndSelect(
        input(ROLES.map((role) => candidate(role, { session: fullIdSubstitution }))),
      ),
      'session_evidence_binding_mismatch',
    );
    expect(substitutionPort.verify).not.toHaveBeenCalled();

    for (const conflict of [
      rawSession('conflicting-session'),
      rawSession(sessionSubjectDigest(SESSION), `sha256:${'f'.repeat(64)}`),
      rawSession(sessionSubjectDigest(SESSION), KEYSET.workloadKeysetDigest, {
        quoteVerified: true,
      }),
    ]) {
      const rejectingPort = { verify: vi.fn(async () => bindings as never) };
      await expect(
        createStrictVerifier(rejectingPort).verifyAndSelect(
          input(ROLES.map((role) => candidate(role, { session: conflict }))),
        ),
      ).rejects.toBeDefined();
      expect(rejectingPort.verify).not.toHaveBeenCalled();
    }
  });

  it('passes exactly the seven frozen cloned policy anchors to strict native verification', async () => {
    const inputs: AciNativeEvidenceVerificationInputV2[] = [];
    const evidenceVerifier: AciSessionEvidenceVerifierPort = {
      verify: vi.fn(async (nativeInput) => {
        inputs.push(nativeInput);
        return strictEvidenceVerifier.verify(nativeInput);
      }),
    };

    await createStrictVerifier(evidenceVerifier).verifyAndSelect(
      input(ROLES.map((role) => candidate(role, { session: rawSession() }))),
    );

    const policyAnchors = inputs[0]?.expectation.policyAnchors;
    expect(policyAnchors).toBeDefined();
    expect(Object.keys(policyAnchors ?? {}).sort()).toEqual([
      'channelPolicy',
      'evidence',
      'origin',
      'permittedClaimSources',
      'requiredSessionClaims',
      'route',
      'sourceProvenance',
    ]);
    expect(policyAnchors).toEqual({
      origin: POLICY.origin,
      route: POLICY.route,
      channelPolicy: POLICY.channelPolicy,
      evidence: POLICY.evidence,
      sourceProvenance: POLICY.sourceProvenance,
      requiredSessionClaims: POLICY.requiredSessionClaims,
      permittedClaimSources: POLICY.permittedClaimSources,
    });
    expect(policyAnchors).not.toBe(POLICY);
    expect(policyAnchors?.evidence).not.toBe(POLICY.evidence);
    expect(Object.isFrozen(policyAnchors)).toBe(true);
    expect(Object.isFrozen(policyAnchors?.evidence)).toBe(true);
  });

  it('enforces the strict native session verifier timeout and abort contract', async () => {
    let signal: AbortSignal | undefined;
    let deadline: number | undefined;
    let invokedAt: number | undefined;
    const evidenceVerifier: AciSessionEvidenceVerifierPort = {
      verify: vi.fn((nativeInput) => {
        invokedAt = performance.now();
        signal = nativeInput.expectation.signal;
        deadline = nativeInput.expectation.deadline;
        return new Promise<never>(() => undefined);
      }),
    };

    await expectCode(
      createStrictVerifier(evidenceVerifier, 1_000).verifyAndSelect(
        input(ROLES.map((role) => candidate(role, { session: rawSession() }))),
      ),
      'session_evidence_verification_failed',
    );
    if (deadline === undefined || invokedAt === undefined) throw new Error('verifier not invoked');
    expect(deadline).toBeGreaterThan(invokedAt);
    expect(deadline).toBeLessThanOrEqual(invokedAt + 1_000);
    expect(signal?.aborted).toBe(true);
  });

  it('transports a schema-valid session raw evidence envelope above one MiB', async () => {
    const component = Buffer.alloc(300_000, 1).toString('base64');
    const session = rawSession(undefined, KEYSET.workloadKeysetDigest, {
      quote_base64: component,
      collateral_base64: component,
      event_log_base64: component,
      vm_config_base64: component,
    });

    await expect(
      createStrictVerifier({
        verify: async (nativeInput) => {
          const parsedSession = JSON.parse(
            new TextDecoder().decode(nativeInput.subjectBytes),
          ) as AciSession;
          const bindings = withDerivedBindings(parsedSession);
          return {
            sessionId: nativeInput.expectation.expectedSessionId,
            claims: parsedSession.claims,
            identity: parsedSession.identity ?? null,
            channelBindings: parsedSession.channel_binding,
            establishedAt: parsedSession.established_at,
            expiresAt: parsedSession.expires_at,
            channelKeyDigest: bindings.channelKeyDigest,
            upstreamIdentityDigest: bindings.upstreamIdentityDigest,
            evidenceTranscriptDigest: testTranscriptDigest(nativeInput),
          };
        },
      }).verifyAndSelect(input(ROLES.map((role) => candidate(role, { session })))),
    ).resolves.toBeDefined();
  });

  it.each([
    ['duplicate-key', new TextEncoder().encode('{"opaque":1,"opaque":2}')],
    ['non-ASCII member name', new TextEncoder().encode('{"é":"opaque"}')],
    ['non-JSON bytes', Uint8Array.from([0, 255, 1, 254, 2, 253])],
  ])(
    'passes %s opaque evidence unchanged only through the explicit legacy verifier',
    async (_kind, evidenceBytes) => {
      const session = withDerivedBindings({
        ...SESSION,
        evidence: {
          digest: `sha256:${createHash('sha256').update(evidenceBytes).digest('hex')}`,
          data: `data:application/octet-stream;base64,${Buffer.from(evidenceBytes).toString('base64')}`,
        },
      }).session;
      const candidates = ROLES.map((role) => candidate(role, { session }));
      const legacyEvidenceVerifier = new AciSessionEvidenceVerifierDouble();

      await expect(
        createVerifier(POLICY, legacyEvidenceVerifier).verifyAndSelect(input(candidates)),
      ).resolves.toBeDefined();
      expect(legacyEvidenceVerifier.calls).toBe(ROLES.length);
      expect(legacyEvidenceVerifier.evidenceBytes).toEqual(
        ROLES.map(() => Uint8Array.from(evidenceBytes)),
      );

      const strictPort = { verify: vi.fn(strictEvidenceVerifier.verify) };
      await expectCode(
        createStrictVerifier(strictPort).verifyAndSelect(input(candidates)),
        'session_malformed',
      );
      expect(strictPort.verify).not.toHaveBeenCalled();
    },
  );

  it('rejects maximum evidence when parsing exhausts the verification deadline', async () => {
    const component = Buffer.alloc(300_000, 1).toString('base64');
    const session = rawSession(undefined, KEYSET.workloadKeysetDigest, {
      quote_base64: component,
      collateral_base64: component,
      event_log_base64: component,
      vm_config_base64: component,
    });
    const evidenceVerifier = { verify: vi.fn(strictEvidenceVerifier.verify) };
    const monotonicNow = vi.spyOn(performance, 'now');
    monotonicNow.mockReturnValueOnce(10_000).mockReturnValue(10_101);

    try {
      await expectCode(
        createStrictVerifier(evidenceVerifier, 100).verifyAndSelect(
          input(ROLES.map((role) => candidate(role, { session }))),
        ),
        'session_evidence_verification_failed',
      );
      expect(evidenceVerifier.verify).not.toHaveBeenCalled();
    } finally {
      monotonicNow.mockRestore();
    }
  });
  it('rejects unknown fields on fixed normalized keysets and key entries', async () => {
    const keyset = {
      ...KEYSET,
      provider_extension: { version: 1 },
      receiptSigningKeys: KEYSET.receiptSigningKeys.map((key) => ({
        ...key,
        provider_extension: 'receipt',
      })),
      e2eePublicKeys: KEYSET.e2eePublicKeys.map((key) => ({
        ...key,
        provider_extension: 'e2ee',
      })),
      tlsPublicKeys: KEYSET.tlsPublicKeys.map((key) => ({
        ...key,
        provider_extension: 'tls',
      })),
    } as unknown as VerifiedAciKeyset;

    await expectCode(createVerifier().verifyAndSelect(input(undefined, keyset)), 'input_invalid');
  });

  it('normalizes malformed legacy candidate input to a typed content-free error', async () => {
    const malformed = {
      ...input(),
      candidates: undefined,
    } as unknown as AciSessionVerificationInput;

    await expectCode(createVerifier().verifyAndSelect(malformed), 'session_malformed');
  });

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
        evidenceVerifier: strictEvidenceVerifier,
        rawEvidenceDigestAuthority: RAW_EVIDENCE_DIGEST_AUTHORITY,
        keysetHighWaterAuthority: keysetAuthority(),
      }).verifyAndSelect(input()),
      'clock_invalid',
    );
  });

  it('rejects non-ASCII member names in an official session artifact', async () => {
    const session = {
      ...SESSION,
      claims: { ...SESSION.claims, ['é']: 'not-an-official-member' },
    };
    const sessionBytes = new TextEncoder().encode(JSON.stringify(session));
    const candidates = ROLES.map((role) =>
      candidate(role, role === 'generate' ? { session, sessionBytes } : undefined),
    );

    await expectCode(createVerifier().verifyAndSelect(input(candidates)), 'session_malformed');
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

  it.each([60_001, Number.MAX_SAFE_INTEGER])(
    'rejects an evidence verifier timeout above sixty seconds: %s',
    (timeoutMs) => {
      expect(() => createStrictVerifier(strictEvidenceVerifier, timeoutMs)).toThrowError(
        expect.objectContaining({ code: 'evidence_verifier_unavailable' }),
      );
    },
  );

  it('accepts an evidence verifier timeout at sixty seconds', () => {
    expect(() => createStrictVerifier(strictEvidenceVerifier, 60_000)).not.toThrow();
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
    const candidates = ROLES.map((role) => candidate(role, { session }));

    await expect(createVerifier(base).verifyAndSelect(input(candidates))).resolves.toMatchObject({
      generate: { sessionId: sessionId(session) },
    });
  });

  it('rejects evidence that resolves after the aggregate verification deadline', async () => {
    const monotonicNow = vi.spyOn(performance, 'now');
    let elapsed = 10_000;
    monotonicNow.mockImplementation(() => elapsed);
    const evidenceVerifier = new AciSessionEvidenceVerifierDouble((_session, bindings) => {
      elapsed = 10_101;
      return bindings;
    });
    const verifier = new LegacyAciSessionVerifier({
      policy: POLICY,
      trustedTimeAuthority: {
        read: async () => ({
          trustedNow: NOW,
          ...TRUST_CONTEXT,
        }),
      },
      trustedTimeContext: TRUST_CONTEXT,
      nativeVerifierTimeoutMs: 100,
      evidenceVerifier,
      keysetHighWaterAuthority: keysetAuthority(),
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
    const verifier = new LegacyAciSessionVerifier({
      policy: POLICY,
      trustedTimeAuthority: {
        read: async () => ({
          trustedNow: NOW,
          ...TRUST_CONTEXT,
        }),
      },
      trustedTimeContext: TRUST_CONTEXT,
      nativeVerifierTimeoutMs: 100,
      evidenceVerifier,
      keysetHighWaterAuthority: keysetAuthority(),
    });

    try {
      await expectCode(verifier.verifyAndSelect(input()), 'session_evidence_verification_failed');
      expect(evidenceVerifier.calls).toBe(1);
    } finally {
      monotonicNow.mockRestore();
    }
  });

  it('times out a legacy evidence adapter that never resolves', async () => {
    const evidenceVerifier: LegacyAciSessionEvidenceVerifierPort = {
      verify: vi.fn(() => new Promise<never>(() => undefined)),
    };
    const verifier = new LegacyAciSessionVerifier({
      policy: POLICY,
      trustedTimeAuthority: {
        read: async () => ({ trustedNow: NOW, ...TRUST_CONTEXT }),
      },
      trustedTimeContext: TRUST_CONTEXT,
      nativeVerifierTimeoutMs: 10,
      evidenceVerifier,
      keysetHighWaterAuthority: keysetAuthority(),
    });

    await expectCode(verifier.verifyAndSelect(input()), 'session_evidence_verification_failed');
    expect(evidenceVerifier.verify).toHaveBeenCalledTimes(1);
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
      evidenceVerifier: strictEvidenceVerifier,
      rawEvidenceDigestAuthority: RAW_EVIDENCE_DIGEST_AUTHORITY,
      keysetHighWaterAuthority: keysetAuthority(),
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
        sessionId: sessionId(SESSION),
        establishedAt: 1_750_000_000,
        expiresAt: 1_750_003_600,
        workloadKeysetDigest: `sha256:${'2'.repeat(64)}`,
        channelKeyDigest: UPSTREAM_CHANNEL_KEY_DIGEST,
        upstreamIdentityDigest: withDerivedBindings(SESSION).upstreamIdentityDigest,
        upstreamIdentity: {
          upstreamName: SESSION.upstream_name,
          urlOrigin: SESSION.endpoint,
          verifierId: SESSION.verifier_id,
          claims: SESSION.claims,
        },
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
    const candidates = ROLES.map((role) => candidate(role, { session: derived.session }));

    const selected = await createVerifier().verifyAndSelect(input(candidates));

    expect(selected.embed.sessionId).toBe(sessionId(derived.session));
  });

  it('rejects when verified session evidence bindings do not match TS-derived values', async () => {
    const evidenceVerifier = new AciSessionEvidenceVerifierDouble((_session, bindings) => ({
      ...bindings,
      sessionId: 'a'.repeat(64),
    }));

    await expectCode(
      createVerifier(POLICY, evidenceVerifier).verifyAndSelect(input()),
      'session_evidence_binding_mismatch',
    );
  });

  it('accepts a distinct well-formed strict V2 evidence transcript digest', async () => {
    const session = rawSession();
    const strictPort: AciSessionEvidenceVerifierPort = {
      verify: vi.fn(async (nativeInput) => ({
        ...(await strictEvidenceVerifier.verify(nativeInput)),
        evidenceTranscriptDigest: `sha256:${'6'.repeat(64)}`,
      })),
    };

    await expect(
      createStrictVerifier(strictPort).verifyAndSelect(
        input(ROLES.map((role) => candidate(role, { session }))),
      ),
    ).resolves.toBeDefined();
  });

  it.each([
    ['unknown field', { unknown: 'redacted' }],
    ['malformed session id', { sessionId: 'not-a-session-id' }],
    ['malformed claims', { claims: [] }],
    ['malformed channel bindings', { channelBindings: {} }],
    ['malformed timestamp', { establishedAt: -1 }],
    ['malformed digest', { channelKeyDigest: 'not-a-digest' }],
  ])('rejects a strict native session result with %s', async (_kind, override) => {
    const session = rawSession();
    const strictPort: AciSessionEvidenceVerifierPort = {
      verify: vi.fn(async (nativeInput) => ({
        ...(await strictEvidenceVerifier.verify(nativeInput)),
        ...override,
      })) as AciSessionEvidenceVerifierPort['verify'],
    };

    await expectCode(
      createStrictVerifier(strictPort).verifyAndSelect(
        input(ROLES.map((role) => candidate(role, { session }))),
      ),
      'native_result_malformed',
    );
  });

  it('clones and freezes an accepted strict native session result', async () => {
    const session = rawSession();
    const nativeInput: Omit<AciNativeEvidenceVerificationInputV2, 'expectation'> & {
      readonly expectation: Omit<
        AciNativeEvidenceVerificationInputV2['expectation'],
        'deadline' | 'signal'
      >;
    } = {
      evidence: RAW_EVIDENCE_FIXTURE,
      subjectBytes: encodeSession(session),
      expectation: {
        purpose: 'session',
        subjectDigest: sessionSubjectDigest(session),
        reportNonce: null,
        expectedSessionId: sessionId(session),
        expectedWorkloadKeysetDigest: KEYSET.workloadKeysetDigest,
        evidenceDigest: `sha256:${'7'.repeat(64)}`,
        evaluationTimeUnixSeconds: NOW,
        policyAnchors: POLICY,
      },
    };
    const adapterResult = await strictEvidenceVerifier.verify({
      ...nativeInput,
      expectation: {
        ...nativeInput.expectation,
        deadline: performance.now() + 1_000,
        signal: new AbortController().signal,
      },
    });
    const verifier = new AciNativeSessionEvidenceVerifier({ verify: async () => adapterResult });

    const accepted = await verifier.verify(nativeInput, performance.now() + 1_000);
    const originalClaims = structuredClone(accepted.claims);
    (adapterResult.claims as Record<string, unknown>).tee_attested = { status: 'unknown' };

    expect(accepted).not.toBe(adapterResult);
    expect(accepted.claims).toEqual(originalClaims);
    expect(Object.isFrozen(accepted)).toBe(true);
    expect(Object.isFrozen(accepted.claims)).toBe(true);
    expect(Object.isFrozen(accepted.channelBindings)).toBe(true);
  });

  it('preserves and freezes own __proto__ extension keys without mutating prototypes', async () => {
    const session = rawSession();
    const identity = defineOwnProto({ provider_key: 'redacted' }, { tier: 'hardware' });
    const claims = defineOwnProto({ ...session.claims }, { status: 'bound' });
    const channelBinding = defineOwnProto({ ...session.channel_binding[0] }, { suite: 'strict' });
    const extendedSessionWithoutBoundEvidence: AciSession = {
      ...session,
      identity,
      claims,
      channel_binding: [channelBinding] as AciSession['channel_binding'],
    };
    const extendedSession: AciSession = {
      ...rawSession(sessionSubjectDigest(extendedSessionWithoutBoundEvidence)),
      identity,
      claims,
      channel_binding: [channelBinding] as AciSession['channel_binding'],
    };
    const bindings = withDerivedBindings(extendedSession);
    const adapterResult: VerifiedAciSessionEvidenceBindingsV2 = {
      sessionId: sessionId(extendedSession),
      claims,
      identity,
      channelBindings: extendedSession.channel_binding,
      establishedAt: extendedSession.established_at,
      expiresAt: extendedSession.expires_at,
      upstreamIdentityDigest: bindings.upstreamIdentityDigest,
      channelKeyDigest: bindings.channelKeyDigest,
      evidenceTranscriptDigest: `sha256:${'6'.repeat(64)}`,
    };
    const verifier = new AciNativeSessionEvidenceVerifier({ verify: async () => adapterResult });

    const accepted = await verifier.verify(
      nativeSessionInput(extendedSession),
      performance.now() + 1_000,
    );

    expect(Object.getPrototypeOf(accepted.identity)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(accepted.claims)).toBe(Object.prototype);
    expect(Object.getPrototypeOf(accepted.channelBindings[0])).toBe(Object.prototype);
    expect(Object.hasOwn(accepted.identity ?? {}, '__proto__')).toBe(true);
    expect(Object.hasOwn(accepted.claims, '__proto__')).toBe(true);
    expect(Object.hasOwn(accepted.channelBindings[0] ?? {}, '__proto__')).toBe(true);
    expect(Object.getOwnPropertyDescriptor(accepted.identity, '__proto__')?.value).toEqual({
      tier: 'hardware',
    });
    expect(Object.getOwnPropertyDescriptor(accepted.claims, '__proto__')?.value).toEqual({
      status: 'bound',
    });
    expect(
      Object.getOwnPropertyDescriptor(accepted.channelBindings[0], '__proto__')?.value,
    ).toEqual({ suite: 'strict' });
    expect(Object.isFrozen(accepted.identity)).toBe(true);
    expect(
      Object.isFrozen(Object.getOwnPropertyDescriptor(accepted.identity, '__proto__')?.value),
    ).toBe(true);
    expect(
      Object.isFrozen(Object.getOwnPropertyDescriptor(accepted.claims, '__proto__')?.value),
    ).toBe(true);
    expect(
      Object.isFrozen(
        Object.getOwnPropertyDescriptor(accepted.channelBindings[0], '__proto__')?.value,
      ),
    ).toBe(true);
    expect(Object.prototype).not.toHaveProperty('tier');
    expect(Object.prototype).not.toHaveProperty('status');
    expect(Object.prototype).not.toHaveProperty('suite');
  });

  it('binds own __proto__ extension values after native normalization', async () => {
    const session = rawSession();
    const identity = defineOwnProto({ provider_key: 'redacted' }, { tier: 'hardware' });
    const extendedSessionWithoutBoundEvidence: AciSession = {
      ...session,
      identity,
    };
    const extendedSession: AciSession = {
      ...rawSession(sessionSubjectDigest(extendedSessionWithoutBoundEvidence)),
      identity,
    };
    const strictPort: AciSessionEvidenceVerifierPort = {
      verify: async (nativeInput) => {
        const parsedSession = JSON.parse(
          new TextDecoder().decode(nativeInput.subjectBytes),
        ) as AciSession;
        const bindings = withDerivedBindings(parsedSession);
        defineOwnProto(parsedSession.identity ?? {}, { tier: 'software' });
        return {
          sessionId: nativeInput.expectation.expectedSessionId,
          claims: parsedSession.claims,
          identity: parsedSession.identity ?? null,
          channelBindings: parsedSession.channel_binding,
          establishedAt: parsedSession.established_at,
          expiresAt: parsedSession.expires_at,
          channelKeyDigest: bindings.channelKeyDigest,
          upstreamIdentityDigest: bindings.upstreamIdentityDigest,
          evidenceTranscriptDigest: testTranscriptDigest(nativeInput),
        };
      },
    };

    await expectCode(
      createStrictVerifier(strictPort).verifyAndSelect(
        input(ROLES.map((role) => candidate(role, { session: extendedSession }))),
      ),
      'session_evidence_binding_mismatch',
    );
  });

  it('rejects accessor-backed native results without invoking the accessor', async () => {
    const session = rawSession();
    const bindings = withDerivedBindings(session);
    let reads = 0;
    const result: VerifiedAciSessionEvidenceBindingsV2 = {
      sessionId: sessionId(session),
      claims: session.claims,
      identity: session.identity ?? null,
      channelBindings: session.channel_binding,
      establishedAt: session.established_at,
      expiresAt: session.expires_at,
      upstreamIdentityDigest: bindings.upstreamIdentityDigest,
      channelKeyDigest: bindings.channelKeyDigest,
      evidenceTranscriptDigest: `sha256:${'6'.repeat(64)}`,
    };
    Object.defineProperty(result, 'claims', {
      enumerable: true,
      get: () => {
        reads += 1;
        if (reads > 1) throw new Error('unstable accessor was read twice');
        return session.claims;
      },
    });
    const verifier = new AciNativeSessionEvidenceVerifier({
      verify: async () => result,
    });

    await expectCode(
      verifier.verify(nativeSessionInput(session), performance.now() + 1_000),
      'native_result_malformed',
    );
    expect(reads).toBe(0);
  });

  it('rejects oversized native result graphs without hanging', async () => {
    const session = rawSession();
    const adapterResult = await strictEvidenceVerifier.verify({
      ...nativeSessionInput(session),
      expectation: {
        ...nativeSessionInput(session).expectation,
        deadline: performance.now() + 1_000,
        signal: new AbortController().signal,
      },
    });
    const oversizedResult = {
      ...adapterResult,
      claims: { oversized: Array.from({ length: 5_000 }, () => 'opaque') },
    };
    const verifier = new AciNativeSessionEvidenceVerifier({
      verify: vi.fn(async () => oversizedResult) as AciSessionEvidenceVerifierPort['verify'],
    });

    await expectCode(
      verifier.verify(nativeSessionInput(session), performance.now() + 1_000),
      'native_result_malformed',
    );
  });

  it('rechecks the deadline after normalizing and freezing the native result', async () => {
    const session = rawSession();
    const nativeInput = nativeSessionInput(session);
    const adapterResult = await strictEvidenceVerifier.verify({
      ...nativeInput,
      expectation: {
        ...nativeInput.expectation,
        deadline: performance.now() + 1_000,
        signal: new AbortController().signal,
      },
    });
    const verifier = new AciNativeSessionEvidenceVerifier({ verify: async () => adapterResult });
    const now = vi
      .spyOn(performance, 'now')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(1_000);

    try {
      await expectCode(verifier.verify(nativeInput, 1_000), 'session_evidence_verification_failed');
    } finally {
      now.mockRestore();
    }
  });

  it.each([
    ['nested claim', { claims: { tee_attested: { status: 'asserted' } } }],
    [
      'nested channel binding',
      {
        channelBindings: [
          { type: 'tls_spki_sha256', origin: 'https://example.com', spki_sha256: 'not-a-digest' },
        ],
      },
    ],
  ])('rejects malformed canonical %s data', async (_kind, override) => {
    const session = rawSession();
    const adapterResult = await strictEvidenceVerifier.verify({
      ...nativeSessionInput(session),
      expectation: {
        ...nativeSessionInput(session).expectation,
        deadline: performance.now() + 1_000,
        signal: new AbortController().signal,
      },
    });
    const verifier = new AciNativeSessionEvidenceVerifier({
      verify: async () =>
        ({ ...adapterResult, ...override }) as VerifiedAciSessionEvidenceBindingsV2,
    });

    await expectCode(
      verifier.verify(nativeSessionInput(session), performance.now() + 1_000),
      'native_result_malformed',
    );
  });

  it('rejects a strict V2 evidence transcript digest that echoes the raw evidence digest', async () => {
    const session = rawSession();
    const echoingPort: AciSessionEvidenceVerifierPort = {
      verify: vi.fn(async (nativeInput) => ({
        ...(await strictEvidenceVerifier.verify(nativeInput)),
        evidenceTranscriptDigest: nativeInput.expectation.evidenceDigest,
      })),
    };

    await expectCode(
      createStrictVerifier(echoingPort).verifyAndSelect(
        input(ROLES.map((role) => candidate(role, { session }))),
      ),
      'session_evidence_binding_mismatch',
    );
  });

  it.each([
    ['missing', undefined],
    ['malformed', 'not-a-prefixed-sha256'],
  ])('rejects a %s strict V2 evidence transcript digest', async (_kind, transcriptDigest) => {
    const session = rawSession();
    const strictPort: AciSessionEvidenceVerifierPort = {
      verify: vi.fn(async (nativeInput) => {
        const bindings = await strictEvidenceVerifier.verify(nativeInput);
        if (transcriptDigest !== undefined) {
          return { ...bindings, evidenceTranscriptDigest: transcriptDigest };
        }
        const { evidenceTranscriptDigest: _evidenceTranscriptDigest, ...missingTranscript } =
          bindings;
        return missingTranscript as VerifiedAciSessionEvidenceBindingsV2;
      }),
    };

    await expectCode(
      createStrictVerifier(strictPort).verifyAndSelect(
        input(ROLES.map((role) => candidate(role, { session }))),
      ),
      'native_result_malformed',
    );
  });

  it.each<readonly [keyof VerifiedAciSessionEvidenceBindingsV2, unknown]>([
    ['sessionId', '0'.repeat(64)],
    ['claims', {}],
    ['identity', { provider_key: 'other' }],
    ['establishedAt', SESSION.established_at - 1],
    ['expiresAt', SESSION.expires_at + 1],
    ['channelKeyDigest', `sha256:${'0'.repeat(64)}`],
    ['upstreamIdentityDigest', `sha256:${'0'.repeat(64)}`],
  ])('rejects a strict V2 session %s binding mismatch', async (field, value) => {
    const session = rawSession();
    const strictPort: AciSessionEvidenceVerifierPort = {
      verify: vi.fn(async (nativeInput) => {
        const parsedSession = JSON.parse(
          new TextDecoder().decode(nativeInput.subjectBytes),
        ) as AciSession;
        const bindings = withDerivedBindings(parsedSession);
        return {
          sessionId: nativeInput.expectation.expectedSessionId,
          claims: parsedSession.claims,
          identity: parsedSession.identity ?? null,
          channelBindings: parsedSession.channel_binding,
          establishedAt: parsedSession.established_at,
          expiresAt: parsedSession.expires_at,
          channelKeyDigest: bindings.channelKeyDigest,
          upstreamIdentityDigest: bindings.upstreamIdentityDigest,
          evidenceTranscriptDigest: testTranscriptDigest(nativeInput),
          [field]: value,
        } as VerifiedAciSessionEvidenceBindingsV2;
      }),
    };

    await expectCode(
      createStrictVerifier(strictPort).verifyAndSelect(
        input(ROLES.map((role) => candidate(role, { session }))),
      ),
      'session_evidence_binding_mismatch',
    );
  });

  it('bounds malicious verifier bindings before deep comparison', async () => {
    let identity: Record<string, unknown> = { leaf: 'redacted' };
    for (let index = 0; index < 12_000; index += 1) identity = { nested: identity };
    const evidenceVerifier = new AciSessionEvidenceVerifierDouble((_session, bindings) => ({
      ...bindings,
      identity: identity as AciSession['identity'],
    }));

    await expectCode(
      createVerifier(POLICY, evidenceVerifier).verifyAndSelect(input()),
      'session_evidence_binding_mismatch',
    );
  });

  it('fails closed when session evidence is missing or the injected verifier rejects', async () => {
    const missingEvidence = withDerivedBindings({
      ...SESSION,
      evidence: {} as AciSession['evidence'],
    }).session;
    await expectCode(
      createVerifier().verifyAndSelect(
        input(ROLES.map((role) => candidate(role, { session: missingEvidence }))),
      ),
      'session_malformed',
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
    const baseline = input();

    await expectCode(
      createVerifier(
        POLICY,
        new AciSessionEvidenceVerifierDouble(),
        [],
        keysetAuthority({ policyGeneration: POLICY.generation + 1 }),
      ).verifyAndSelect(baseline),
      'policy_generation_decreased',
    );
    await expectCode(
      createVerifier(
        POLICY,
        new AciSessionEvidenceVerifierDouble(),
        [],
        keysetAuthority({ keysetVersion: KEYSET.version + 1 }),
      ).verifyAndSelect(baseline),
      'keyset_version_decreased',
    );
    await expectCode(
      createVerifier(
        POLICY,
        new AciSessionEvidenceVerifierDouble(),
        [],
        keysetAuthority({ activationGeneration: ACTIVATION_GENERATION + 1 }),
      ).verifyAndSelect(baseline),
      'activation_generation_decreased',
    );
    await expectCode(
      createVerifier(
        POLICY,
        new AciSessionEvidenceVerifierDouble(),
        [],
        keysetAuthority({ supersededKeysetDigests: [KEYSET.workloadKeysetDigest] }),
      ).verifyAndSelect(baseline),
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
      {
        ...baseline,
        candidates: baseline.candidates.map((item, index) =>
          index === 0 ? { ...item, sessionId: `as_${'a'.repeat(64)}` } : item,
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

  it('rejects candidates associated with mixed generation state', async () => {
    const verifier = createVerifier();
    const mismatches = [
      { policyGeneration: POLICY.generation + 1 },
      { activationGeneration: ACTIVATION_GENERATION + 1 },
    ];

    for (const mismatch of mismatches) {
      const candidates = ROLES.map((role) => candidate(role, role === 'embed' ? mismatch : {}));
      await expectCode(verifier.verifyAndSelect(input(candidates)), 'mixed_state');
    }
  });

  it('rejects a candidate workload keyset digest that differs from the admitted keyset', async () => {
    const verifier = createVerifier();
    const upstreamDigest = `sha256:${'6'.repeat(64)}`;
    await expectCode(
      verifier.verifyAndSelect(
        input(
          ROLES.map((role) =>
            candidate(role, {
              workloadKeysetDigest: upstreamDigest,
              channelKeyDigest: UPSTREAM_CHANNEL_KEY_DIGEST,
            }),
          ),
        ),
      ),
      'workload_keyset_mismatch',
    );
  });

  it('rejects a session whose content-addressed identifier does not match its material', async () => {
    const verifier = createVerifier();
    const candidates = ROLES.map((role) =>
      candidate(role, {
        session: { ...SESSION, upstream_name: 'substituted-upstream' },
        sessionId: sessionId(SESSION),
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
    expect(selected.embed.sessionId).toBe(sessionId(session));
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
    const candidates = ROLES.map((role) => candidate(role, { session: derived.session }));

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
    const candidates = ROLES.map((role) => candidate(role));
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

  it('accepts documented future channel-binding extensions after an enforceable binding', async () => {
    const session = withDerivedBindings({
      ...SESSION,
      channel_binding: [
        ...SESSION.channel_binding,
        {
          type: 'future_channel_binding_v1',
          binding_digest: `sha256:${'6'.repeat(64)}`,
          purpose: 'extension compatibility',
        },
      ],
    } as AciSession);
    const candidates = ROLES.map((role) => candidate(role, { session: session.session }));

    const selected = await createVerifier().verifyAndSelect(input(candidates));

    expect(selected.embed.channelPins).toEqual([
      {
        type: 'tls_spki_sha256',
        value: 'd1'.repeat(32),
        domain: 'upstream.example.com',
      },
    ]);
    expect(selected.embed.channelKeyDigest).toBe(session.channelKeyDigest);
    expect(selected.embed.upstreamIdentityDigest).toBe(session.upstreamIdentityDigest);
  });

  it('retains the selected upstream channel digest independently from aggregator keyset pins', async () => {
    const verifier = createVerifier();
    const upstream = withDerivedBindings(SESSION).channelKeyDigest;
    expect(KEYSET.channelKeyDigest).not.toBe(upstream);

    const selected = await verifier.verifyAndSelect(
      input(
        ROLES.map((role) => candidate(role, { channelKeyDigest: UPSTREAM_CHANNEL_KEY_DIGEST })),
      ),
    );

    expect(selected.embed.channelKeyDigest).toBe(UPSTREAM_CHANNEL_KEY_DIGEST);
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
      ...input(ROLES.map((role) => candidate(role, { session: session.session }))),
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

  it('rejects TLS certificate bindings as an enforceable policy binding', () => {
    const policy = {
      ...POLICY,
      channelPolicy: {
        acceptedBindings: [
          { type: 'tls_certificate_sha256' as const, domains: ['upstream.example.com'] },
        ],
      },
    };
    expect(() => createVerifier(policy as unknown as InferenceTrustPolicyV2)).toThrow(
      'ACI session verification failed: policy_invalid',
    );
  });

  it('accepts partial upstream identity extensions while binding present fields', async () => {
    const derived = withDerivedBindings(SESSION);
    const candidates = ROLES.map((role) => candidate(role, { session: derived.session }));
    const selected = await createVerifier().verifyAndSelect(input(candidates));

    expect(selected.embed.upstreamIdentity).toEqual({
      upstreamName: SESSION.upstream_name,
      urlOrigin: SESSION.endpoint,
      verifierId: SESSION.verifier_id,
      claims: SESSION.claims,
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
    const candidates = ROLES.map((role) => candidate(role, { session: derived.session }));

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
    const candidates = ROLES.map((role) => candidate(role, { session: derived.session }));

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

  it('publishes the strict native-verified channel digest instead of candidate metadata', async () => {
    const digest = `sha256:${'7'.repeat(64)}`;
    const session = rawSession();
    const candidates = ROLES.map((role) => candidate(role, { channelKeyDigest: digest, session }));

    const selected = await createStrictVerifier(strictEvidenceVerifier).verifyAndSelect(
      input(candidates),
    );
    expect(selected.embed.channelKeyDigest).toBe(withDerivedBindings(session).channelKeyDigest);
    expect(selected.embed.channelKeyDigest).not.toBe(digest);
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
        evidenceVerifier: strictEvidenceVerifier,
        rawEvidenceDigestAuthority: RAW_EVIDENCE_DIGEST_AUTHORITY,
        keysetHighWaterAuthority: keysetAuthority(),
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
    const expectedSessionId = tiedSessions.map(sessionId).sort()[0];
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
