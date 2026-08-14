// SPDX-License-Identifier: Apache-2.0
import type { InferenceModelRole, InferenceTrustPolicyV2 } from '@folklore/contracts';
import { describe, expect, it } from 'vitest';
import { ACI_POLICY_FIXTURE } from '../../contracts/test/fixtures/aci-v1.js';
import { AciTrustState } from '../src/aci/AciTrustState.js';
import type {
  VerifiedAciChannelPin,
  VerifiedAciKeyset,
  VerifiedAciSession,
  VerifiedAciTrustSnapshot,
} from '../src/ports.js';

const NOW = 1_750_000_100;
const ROLES: readonly InferenceModelRole[] = ['embed', 'generate', 'critique', 'judge'];
const KEYSET_DIGEST = `sha256:${'2'.repeat(64)}`;
const CHANNEL_KEY_DIGEST = `sha256:${'5'.repeat(64)}`;
const CHANNEL_PINS: readonly VerifiedAciChannelPin[] = [
  {
    type: 'tls_spki_sha256',
    value: 'd1'.repeat(32),
    domain: 'inference.phala.com',
  },
];
const UPSTREAM_CHANNEL_PINS: readonly VerifiedAciChannelPin[] = [
  {
    type: 'tls_spki_sha256',
    value: 'e2'.repeat(32),
    domain: 'upstream.example.com',
  },
];
const UPSTREAM_CHANNEL_KEY_DIGEST = `sha256:${'6'.repeat(64)}`;
const UPSTREAM_IDENTITY_DIGEST = `sha256:${'7'.repeat(64)}`;
const POLICY: InferenceTrustPolicyV2 = {
  ...ACI_POLICY_FIXTURE,
  channelPolicy: {
    acceptedBindings: [
      {
        type: 'tls_spki_sha256',
        domains: ['inference.phala.com'],
      },
    ],
  },
  requiredSessionClaims: ['tee_attested'],
};
const KEYSET: VerifiedAciKeyset = {
  workloadId: `sha256:${'1'.repeat(64)}`,
  workloadKeysetDigest: KEYSET_DIGEST,
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
  tlsPublicKeys: [{ spkiSha256: 'd1'.repeat(32), domain: 'inference.phala.com' }],
  channelPins: CHANNEL_PINS,
  channelKeyDigest: CHANNEL_KEY_DIGEST,
};

function sessionFor(
  role: InferenceModelRole,
  workloadKeysetDigest = KEYSET_DIGEST,
  establishedAt = NOW - 100,
  expiresAt = NOW + 600,
  channelPins: readonly VerifiedAciChannelPin[] = CHANNEL_PINS,
  channelKeyDigest = CHANNEL_KEY_DIGEST,
): VerifiedAciSession {
  const model = POLICY.roleModels[role];
  return {
    role,
    model: model.model,
    modelRevision: model.revision,
    sessionId: `as_${role === 'embed' ? 'a' : role === 'generate' ? 'b' : role === 'critique' ? 'c' : 'd'}${'0'.repeat(63)}`,
    establishedAt,
    expiresAt,
    workloadKeysetDigest,
    channelKeyDigest,
    channelPins,
    upstreamIdentityDigest: UPSTREAM_IDENTITY_DIGEST,
  };
}

function completeSessions(
  workloadKeysetDigest = KEYSET_DIGEST,
  establishedAt = NOW - 100,
  expiresAt = NOW + 600,
): Record<InferenceModelRole, VerifiedAciSession> {
  return Object.fromEntries(
    ROLES.map((role) => [role, sessionFor(role, workloadKeysetDigest, establishedAt, expiresAt)]),
  ) as Record<InferenceModelRole, VerifiedAciSession>;
}

function candidate(overrides: Record<string, unknown> = {}): VerifiedAciTrustSnapshot {
  const keyset = (overrides.keyset as VerifiedAciKeyset | undefined) ?? KEYSET;
  const workloadKeysetDigest = keyset.workloadKeysetDigest;
  const sessions =
    (overrides.sessions as Record<InferenceModelRole, VerifiedAciSession> | undefined) ??
    completeSessions(workloadKeysetDigest);
  const expiresAt = (overrides.expiresAt as number | undefined) ?? NOW + 600;
  return {
    generation: 1,
    policyGeneration: POLICY.generation,
    activationGeneration: 1,
    expiresAt,
    keyset,
    channelPins: keyset.channelPins,
    sessions,
    supersededKeysetDigests: [],
    ...overrides,
  } as VerifiedAciTrustSnapshot;
}

describe('AciTrustState', () => {
  it('publishes one immutable snapshot without aliasing candidate input', () => {
    const input = candidate();
    const state = new AciTrustState(POLICY, () => NOW);

    expect(state.acquire()).toBeUndefined();
    expect(state.refresh(0, input)).toBe(true);

    const snapshot = state.acquire();
    expect(snapshot).toBeDefined();
    expect(snapshot).toBe(state.acquire());
    expect(snapshot).not.toBe(input);
    expect(snapshot?.keyset).not.toBe(input.keyset);
    expect(snapshot?.keyset.channelPins).not.toBe(input.keyset.channelPins);
    expect(snapshot?.sessions).not.toBe(input.sessions);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot?.keyset)).toBe(true);
    expect(Object.isFrozen(snapshot?.keyset.channelPins)).toBe(true);
    expect(Object.isFrozen(snapshot?.keyset.channelPins[0])).toBe(true);
    expect(Object.isFrozen(snapshot?.sessions.embed)).toBe(true);
    expect(Object.isFrozen(snapshot?.sessions.embed.channelPins)).toBe(true);

    const mutableInput = input as unknown as {
      keyset: { channelPins: Array<{ value: string }> };
      sessions: { embed: { model: string } };
    };
    mutableInput.keyset.channelPins[0].value = 'f'.repeat(64);
    mutableInput.sessions.embed.model = 'substituted/model';

    expect(snapshot?.keyset.channelPins[0].value).toBe('d1'.repeat(32));
    expect(snapshot?.sessions.embed.model).toBe(POLICY.roleModels.embed.model);
  });

  it('rejects incomplete role sets and policy model or revision mismatches', () => {
    const state = new AciTrustState(POLICY, () => NOW);
    const incomplete = { ...completeSessions() } as Partial<
      Record<InferenceModelRole, VerifiedAciSession>
    >;
    delete incomplete.judge;

    expectTrustError(
      () => state.refresh(0, candidate({ sessions: incomplete })),
      'role_incomplete',
    );
    expectTrustError(
      () =>
        state.refresh(
          0,
          candidate({
            sessions: {
              ...completeSessions(),
              embed: { ...sessionFor('embed'), model: 'other/model' },
            },
          }),
        ),
      'session_model_mismatch',
    );
    expectTrustError(
      () =>
        state.refresh(
          0,
          candidate({
            sessions: {
              ...completeSessions(),
              embed: { ...sessionFor('embed'), modelRevision: 'other-revision' },
            },
          }),
        ),
      'session_model_mismatch',
    );
  });

  it('accepts one official session id shared across roles with role-specific envelopes', () => {
    const state = new AciTrustState(POLICY, () => NOW);
    const sessions = completeSessions();
    const sharedSessionId = sessions.embed.sessionId;
    sessions.generate = { ...sessions.generate, sessionId: sharedSessionId };
    sessions.critique = { ...sessions.critique, sessionId: sharedSessionId };
    sessions.judge = { ...sessions.judge, sessionId: sharedSessionId };

    expect(state.refresh(0, candidate({ sessions }))).toBe(true);
    expect(state.acquire()?.sessions.generate.sessionId).toBe(sharedSessionId);
  });

  it('rejects reused session ids whose trust identity differs', () => {
    const state = new AciTrustState(POLICY, () => NOW);
    const sessions = completeSessions();
    sessions.generate = {
      ...sessions.generate,
      sessionId: sessions.embed.sessionId,
      upstreamIdentityDigest: `sha256:${'8'.repeat(64)}`,
    };

    expectTrustError(() => state.refresh(0, candidate({ sessions })), 'session_rollback');
  });

  it('rejects rotation that keeps a session id but changes verified fields', () => {
    const state = new AciTrustState(POLICY, () => NOW);
    expect(state.refresh(0, candidate())).toBe(true);
    const currentGenerate = state.acquire()?.sessions.generate;
    if (currentGenerate === undefined) throw new Error('missing current session');
    const sessions = completeSessions(KEYSET_DIGEST, NOW - 50, NOW + 600);
    sessions.generate = {
      ...sessions.generate,
      sessionId: currentGenerate.sessionId,
      establishedAt: currentGenerate.establishedAt + 1,
    };

    expectTrustError(
      () => state.refresh(1, candidate({ generation: 2, sessions })),
      'session_rollback',
    );
  });

  it('requires session keyset digests and snapshot channel pins to match the keyset', () => {
    const state = new AciTrustState(POLICY, () => NOW);
    expectTrustError(
      () =>
        state.refresh(
          0,
          candidate({
            sessions: {
              ...completeSessions(),
              embed: { ...sessionFor('embed'), workloadKeysetDigest: `sha256:${'6'.repeat(64)}` },
            },
          }),
        ),
      'session_keyset_mismatch',
    );
    expectTrustError(
      () =>
        state.refresh(
          0,
          candidate({ channelPins: [{ ...CHANNEL_PINS[0], value: 'e'.repeat(64) }] }),
        ),
      'channel_pins_mismatch',
    );
  });

  it('requires the candidate generation to be exactly the next generation', () => {
    const state = new AciTrustState(POLICY, () => NOW);

    expectTrustError(
      () => state.refresh(0, candidate({ generation: 2 })),
      'candidate_generation_mismatch',
    );
  });

  it('accepts upstream session pins that are independent from aggregator keyset pins', () => {
    const state = new AciTrustState(POLICY, () => NOW);
    const sessions = Object.fromEntries(
      ROLES.map((role) => [
        role,
        sessionFor(
          role,
          KEYSET_DIGEST,
          NOW - 100,
          NOW + 600,
          UPSTREAM_CHANNEL_PINS,
          UPSTREAM_CHANNEL_KEY_DIGEST,
        ),
      ]),
    ) as Record<InferenceModelRole, VerifiedAciSession>;

    expect(state.refresh(0, candidate({ sessions }))).toBe(true);
  });

  it('enforces expiry, maximum lifetimes, and the earliest snapshot expiry', () => {
    const state = new AciTrustState(POLICY, () => NOW);
    expectTrustError(
      () =>
        state.refresh(
          0,
          candidate({ keyset: { ...KEYSET, notAfter: NOW + POLICY.maxKeysetLifetimeSeconds + 1 } }),
        ),
      'keyset_lifetime_exceeded',
    );
    expectTrustError(
      () => state.refresh(0, candidate({ keyset: { ...KEYSET, notAfter: NOW } })),
      'keyset_expired',
    );
    expectTrustError(
      () =>
        state.refresh(
          0,
          candidate({
            sessions: completeSessions(KEYSET_DIGEST, NOW - 100, NOW),
            expiresAt: NOW,
          }),
        ),
      'session_expired',
    );
    expectTrustError(
      () =>
        state.refresh(
          0,
          candidate({
            sessions: completeSessions(
              KEYSET_DIGEST,
              NOW - 100,
              NOW - 100 + POLICY.maxSessionLifetimeSeconds + 1,
            ),
            expiresAt: NOW - 100 + POLICY.maxSessionLifetimeSeconds + 1,
          }),
        ),
      'session_lifetime_exceeded',
    );
    expectTrustError(
      () => state.refresh(0, candidate({ expiresAt: NOW + 601 })),
      'snapshot_expiry_mismatch',
    );
    expectTrustError(
      () =>
        state.refresh(
          0,
          candidate({
            sessions: completeSessions(KEYSET_DIGEST, NOW + 10, NOW + 5),
            expiresAt: NOW + 5,
          }),
        ),
      'candidate_invalid',
    );

    expect(state.refresh(0, candidate())).toBe(true);
    expect(state.acquire()?.expiresAt).toBe(NOW + 600);
  });

  it('applies policy clock skew consistently to session establishment', () => {
    const withinSkew = new AciTrustState(POLICY, () => NOW);
    expect(
      withinSkew.refresh(
        0,
        candidate({
          sessions: completeSessions(KEYSET_DIGEST, NOW + POLICY.clockSkewSeconds, NOW + 600),
        }),
      ),
    ).toBe(true);

    const beyondSkew = new AciTrustState(POLICY, () => NOW);
    expectTrustError(
      () =>
        beyondSkew.refresh(
          0,
          candidate({
            sessions: completeSessions(KEYSET_DIGEST, NOW + POLICY.clockSkewSeconds + 1, NOW + 600),
          }),
        ),
      'session_expired',
    );
  });

  it('rejects malformed nested keysets and oversized rollback state', () => {
    const malformed = [
      { ...KEYSET, version: 0 },
      { ...KEYSET, receiptSigningKeys: [] },
      {
        ...KEYSET,
        receiptSigningKeys: [{ ...KEYSET.receiptSigningKeys[0], algorithm: 'rsa' }],
      },
      {
        ...KEYSET,
        receiptSigningKeys: [{ ...KEYSET.receiptSigningKeys[0], publicKey: null }],
      },
      {
        ...KEYSET,
        receiptSigningKeys: [KEYSET.receiptSigningKeys[0], { ...KEYSET.receiptSigningKeys[0] }],
      },
      { ...KEYSET, e2eePublicKeys: [] },
      {
        ...KEYSET,
        e2eePublicKeys: [
          { ...KEYSET.e2eePublicKeys[0], publicKey: KEYSET.receiptSigningKeys[0]?.publicKey },
        ],
      },
      {
        ...KEYSET,
        tlsPublicKeys: [{ ...KEYSET.tlsPublicKeys[0], unexpected: true }],
      },
      {
        ...KEYSET,
        tlsPublicKeys: [{ ...KEYSET.tlsPublicKeys[0], domain: 7 }],
      },
    ];

    for (const keyset of malformed) {
      const state = new AciTrustState(POLICY, () => NOW);
      expectTrustError(
        () =>
          state.refresh(
            0,
            candidate({
              keyset,
              sessions: completeSessions(KEYSET_DIGEST),
            }),
          ),
        'candidate_invalid',
      );
    }

    const invalidSessionState = new AciTrustState(POLICY, () => NOW);
    expectTrustError(
      () =>
        invalidSessionState.refresh(
          0,
          candidate({
            sessions: {
              ...completeSessions(),
              embed: { ...sessionFor('embed'), unexpected: true },
            },
          }),
        ),
      'candidate_invalid',
    );

    const invalidPinState = new AciTrustState(POLICY, () => NOW);
    expectTrustError(
      () =>
        invalidPinState.refresh(0, candidate({ channelPins: [{ ...CHANNEL_PINS[0], domain: 7 }] })),
      'candidate_invalid',
    );
    const nullPinState = new AciTrustState(POLICY, () => NOW);
    expectTrustError(
      () => nullPinState.refresh(0, candidate({ channelPins: [null] })),
      'candidate_invalid',
    );

    const state = new AciTrustState(POLICY, () => NOW);
    expectTrustError(
      () =>
        state.refresh(
          0,
          candidate({
            supersededKeysetDigests: Array.from(
              { length: 257 },
              (_value, index) => `sha256:${index.toString(16).padStart(64, '0')}`,
            ),
          }),
        ),
      'candidate_invalid',
    );
  });

  it('rejects decreasing policy, activation, and keyset generations', () => {
    const state = new AciTrustState(POLICY, () => NOW);
    expectTrustError(
      () => state.refresh(0, candidate({ policyGeneration: POLICY.generation - 1 })),
      'policy_generation_mismatch',
    );
    expect(
      state.refresh(0, candidate({ activationGeneration: 2, keyset: { ...KEYSET, version: 2 } })),
    ).toBe(true);
    expectTrustError(
      () => state.refresh(1, candidate({ generation: 2, activationGeneration: 1 })),
      'activation_generation_decreased',
    );
    expectTrustError(
      () =>
        state.refresh(
          1,
          candidate({
            generation: 2,
            activationGeneration: 2,
            keyset: {
              ...KEYSET,
              workloadKeysetDigest: `sha256:${'9'.repeat(64)}`,
              version: 1,
            },
            sessions: completeSessions(`sha256:${'9'.repeat(64)}`),
          }),
        ),
      'keyset_version_decreased',
    );
  });

  it('rejects current and superseded keysets and accumulates prior digests deterministically', () => {
    const state = new AciTrustState(POLICY, () => NOW);
    expect(state.refresh(0, candidate())).toBe(true);
    expectTrustError(() => state.refresh(1, candidate({ generation: 2 })), 'keyset_current');

    const secondKeyset: VerifiedAciKeyset = {
      ...KEYSET,
      workloadKeysetDigest: `sha256:${'6'.repeat(64)}`,
      version: 2,
    };
    const second = candidate({
      generation: 2,
      keyset: secondKeyset,
      sessions: completeSessions(secondKeyset.workloadKeysetDigest),
    });
    expect(state.refresh(1, second)).toBe(true);
    expect(state.acquire()?.supersededKeysetDigests).toEqual([KEYSET_DIGEST]);

    expectTrustError(
      () =>
        state.refresh(
          2,
          candidate({
            generation: 3,
            keyset: secondKeyset,
            sessions: completeSessions(secondKeyset.workloadKeysetDigest),
          }),
        ),
      'keyset_current',
    );
    expectTrustError(
      () =>
        state.refresh(
          2,
          candidate({
            generation: 3,
            keyset: KEYSET,
            sessions: completeSessions(KEYSET_DIGEST),
          }),
        ),
      'keyset_superseded',
    );

    const thirdKeyset: VerifiedAciKeyset = {
      ...secondKeyset,
      workloadKeysetDigest: `sha256:${'7'.repeat(64)}`,
      version: 3,
    };
    expect(
      state.refresh(
        2,
        candidate({
          generation: 3,
          keyset: thirdKeyset,
          sessions: completeSessions(thirdKeyset.workloadKeysetDigest),
          supersededKeysetDigests: [],
        }),
      ),
    ).toBe(true);
    expect(state.acquire()?.supersededKeysetDigests).toEqual([
      KEYSET_DIGEST,
      secondKeyset.workloadKeysetDigest,
    ]);
  });

  it('allows a session-only refresh while retaining the current keyset', () => {
    const state = new AciTrustState(POLICY, () => NOW);
    expect(state.refresh(0, candidate())).toBe(true);

    const refreshedSessions = Object.fromEntries(
      ROLES.map((role, index) => [
        role,
        {
          ...sessionFor(role, KEYSET_DIGEST, NOW - 50, NOW + 700),
          sessionId: `as_${['e', 'f', '8', '9'][index]}${'0'.repeat(63)}`,
        },
      ]),
    ) as VerifiedAciSessionSet;
    expect(
      state.refresh(
        1,
        candidate({ generation: 2, sessions: refreshedSessions, expiresAt: NOW + 700 }),
      ),
    ).toBe(true);
    expect(state.acquire()?.keyset.workloadKeysetDigest).toBe(KEYSET_DIGEST);
    expect(state.acquire()?.sessions.embed.expiresAt).toBe(NOW + 700);
  });

  it('rejects an older session refresh under the same keyset', () => {
    const state = new AciTrustState(POLICY, () => NOW);
    expect(state.refresh(0, candidate())).toBe(true);

    expectTrustError(
      () =>
        state.refresh(
          1,
          candidate({
            generation: 2,
            sessions: completeSessions(KEYSET_DIGEST, NOW - 101, NOW + 600),
          }),
        ),
      'session_rollback',
    );
  });

  it('rejects expiry-only session renewal without a verified rotation boundary', () => {
    const state = new AciTrustState(POLICY, () => NOW);
    expect(state.refresh(0, candidate())).toBe(true);
    const current = state.acquire();
    if (current === undefined) throw new Error('missing_current_snapshot');
    const sessions = Object.fromEntries(
      ROLES.map((role) => [
        role,
        { ...current.sessions[role], expiresAt: current.sessions[role].expiresAt + 100 },
      ]),
    ) as VerifiedAciSessionSet;

    expectTrustError(
      () =>
        state.refresh(
          1,
          candidate({
            generation: 2,
            sessions,
            expiresAt: current.expiresAt + 100,
          }),
        ),
      'session_rollback',
    );
  });

  it('maps a null E2EE public key to candidate_invalid', () => {
    const state = new AciTrustState(POLICY, () => NOW);
    const invalid = structuredClone(candidate());
    invalid.keyset.e2eePublicKeys[0] = {
      ...invalid.keyset.e2eePublicKeys[0],
      publicKey: null,
    } as unknown as VerifiedAciKeyset['e2eePublicKeys'][number];

    expectTrustError(() => state.refresh(0, invalid), 'candidate_invalid');
  });

  it('uses compare-and-swap refreshes and preserves an acquired old snapshot', () => {
    const state = new AciTrustState(POLICY, () => NOW);
    expect(state.refresh(0, candidate())).toBe(true);
    const oldSnapshot = state.acquire();
    const nextKeyset: VerifiedAciKeyset = {
      ...KEYSET,
      workloadKeysetDigest: `sha256:${'8'.repeat(64)}`,
      version: 2,
    };
    const next = candidate({
      generation: 2,
      keyset: nextKeyset,
      sessions: completeSessions(nextKeyset.workloadKeysetDigest),
    });

    expect(state.refresh(1, next)).toBe(true);
    expect(state.refresh(1, next)).toBe(false);
    expect(oldSnapshot?.generation).toBe(1);
    expect(oldSnapshot?.keyset.workloadKeysetDigest).toBe(KEYSET_DIGEST);
    expect(state.acquire()?.generation).toBe(2);
  });

  it('fails closed on invalid runtime shapes, clock values, and content-free errors', () => {
    expectTrustError(
      () => new AciTrustState(POLICY, null as unknown as () => number),
      'clock_invalid',
    );
    expectTrustError(
      () =>
        new AciTrustState(
          { ...POLICY, generation: 'secret-content-marker' } as unknown as InferenceTrustPolicyV2,
          () => NOW,
        ),
      'policy_invalid',
    );
    const state = new AciTrustState(POLICY, () => NOW);
    expectTrustError(
      () => state.refresh(0, null as unknown as VerifiedAciTrustSnapshot),
      'candidate_invalid',
    );
    expectTrustError(
      () => state.refresh(0, candidate({ generation: 'secret-content-marker' })),
      'candidate_invalid',
    );
    expectTrustError(() => state.refresh(-1, candidate()), 'expected_generation_invalid');

    const invalidClockState = new AciTrustState(POLICY, () => Number.NaN);
    expectTrustError(() => invalidClockState.refresh(0, candidate()), 'clock_invalid');
    expectTrustError(() => invalidClockState.acquire(), 'clock_invalid');
    const throwingClockState = new AciTrustState(POLICY, () => {
      throw new Error('secret-content-marker');
    });
    expectTrustError(() => throwingClockState.acquire(), 'clock_invalid');
  });
});

function expectTrustError(action: () => unknown, code: string): void {
  expect(action).toThrowError(
    expect.objectContaining({
      code,
      message: `ACI trust state failed: ${code}`,
      name: 'AciTrustStateError',
    }),
  );
}
