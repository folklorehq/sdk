// SPDX-License-Identifier: Apache-2.0
import { isDeepStrictEqual } from 'node:util';

import {
  inferenceTrustPolicyV2Schema,
  type InferenceModelRole,
  type InferenceTrustPolicyV2,
} from '@folklore/contracts';

import type {
  VerifiedAciChannelPin,
  VerifiedAciKeyset,
  VerifiedAciSession,
  VerifiedAciSessionSet,
  VerifiedAciTrustSnapshot,
} from '../ports.js';

const ROLES: readonly InferenceModelRole[] = ['embed', 'generate', 'critique', 'judge'];
const PREFIXED_DIGEST = /^sha256:[0-9a-f]{64}$/;
const SESSION_ID = /^as_[0-9a-f]{64}$/;
const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const E2EE_ALGORITHM = /^[A-Za-z0-9][A-Za-z0-9._:+-]{0,127}$/;
const MAX_ITEMS = 32;
const MAX_SUPERSEDED_DIGESTS = 256;
const MAX_CLONE_DEPTH = 64;
const MAX_CLONE_NODES = 4_096;

export type AciTrustStateErrorCode =
  | 'activation_generation_decreased'
  | 'candidate_generation_mismatch'
  | 'candidate_invalid'
  | 'channel_pins_mismatch'
  | 'clock_invalid'
  | 'expected_generation_invalid'
  | 'keyset_current'
  | 'keyset_expired'
  | 'keyset_lifetime_exceeded'
  | 'keyset_superseded'
  | 'keyset_version_decreased'
  | 'policy_generation_mismatch'
  | 'policy_invalid'
  | 'role_incomplete'
  | 'session_rollback'
  | 'session_expired'
  | 'session_keyset_mismatch'
  | 'session_lifetime_exceeded'
  | 'session_model_mismatch'
  | 'snapshot_expired'
  | 'snapshot_expiry_mismatch';

export class AciTrustStateError extends Error {
  readonly code: AciTrustStateErrorCode;
  constructor(code: AciTrustStateErrorCode) {
    super(`ACI trust state failed: ${code}`);
    this.name = 'AciTrustStateError';
    this.code = code;
  }
}

interface CloneBudget {
  depth: number;
  nodes: number;
  readonly seen: WeakSet<object>;
}

export class AciTrustState {
  private readonly policy: InferenceTrustPolicyV2;
  private readonly clock: () => number;
  private snapshot: VerifiedAciTrustSnapshot | undefined;
  constructor(policy: InferenceTrustPolicyV2, clock: () => number) {
    const parsed = inferenceTrustPolicyV2Schema.safeParse(policy);
    if (!parsed.success) throw new AciTrustStateError('policy_invalid');
    if (typeof clock !== 'function') throw new AciTrustStateError('clock_invalid');
    this.policy = this.freeze(this.clone(parsed.data));
    this.clock = clock;
  }
  acquire(): VerifiedAciTrustSnapshot | undefined {
    const now = this.now();
    if (this.snapshot !== undefined && this.snapshot.expiresAt <= now) {
      throw new AciTrustStateError('snapshot_expired');
    }
    return this.snapshot;
  }
  refresh(expectedGeneration: number, candidate: VerifiedAciTrustSnapshot): boolean {
    if (!this.isNonNegativeInteger(expectedGeneration)) {
      throw new AciTrustStateError('expected_generation_invalid');
    }
    const current = this.snapshot;
    if ((current?.generation ?? 0) !== expectedGeneration) return false;
    const prepared = this.prepare(candidate, expectedGeneration, current);
    if ((this.snapshot?.generation ?? 0) !== expectedGeneration) return false;
    this.snapshot = prepared;
    return true;
  }

  private prepare(
    candidate: VerifiedAciTrustSnapshot,
    expectedGeneration: number,
    current: VerifiedAciTrustSnapshot | undefined,
  ): VerifiedAciTrustSnapshot {
    let copy: VerifiedAciTrustSnapshot;
    try {
      copy = this.clone(candidate);
    } catch {
      throw new AciTrustStateError('candidate_invalid');
    }
    const now = this.now();
    this.validateSnapshot(copy);
    if (copy.generation !== expectedGeneration + 1) {
      throw new AciTrustStateError('candidate_generation_mismatch');
    }
    this.validatePolicy(copy);
    this.validateBindings(copy);
    this.validateLifetimes(copy, now);
    this.validateRotation(copy, current);
    const superseded = this.nextSuperseded(current, copy.keyset.workloadKeysetDigest);
    return this.freeze({ ...copy, supersededKeysetDigests: superseded });
  }

  private validateSnapshot(snapshot: VerifiedAciTrustSnapshot): void {
    if (
      !this.isRecord(snapshot) ||
      !this.hasExactKeys(snapshot, [
        'generation',
        'policyGeneration',
        'activationGeneration',
        'expiresAt',
        'keyset',
        'channelPins',
        'sessions',
        'supersededKeysetDigests',
      ])
    ) {
      throw new AciTrustStateError('candidate_invalid');
    }
    if (
      !this.isNonNegativeInteger(snapshot.generation) ||
      !this.isNonNegativeInteger(snapshot.policyGeneration) ||
      !this.isNonNegativeInteger(snapshot.activationGeneration) ||
      !this.isPositiveInteger(snapshot.expiresAt) ||
      !Array.isArray(snapshot.channelPins) ||
      !Array.isArray(snapshot.supersededKeysetDigests)
    ) {
      throw new AciTrustStateError('candidate_invalid');
    }
    if (
      snapshot.supersededKeysetDigests.length > MAX_SUPERSEDED_DIGESTS ||
      snapshot.supersededKeysetDigests.some(
        (digest) => typeof digest !== 'string' || !PREFIXED_DIGEST.test(digest),
      )
    ) {
      throw new AciTrustStateError('candidate_invalid');
    }
    this.validateKeyset(snapshot.keyset);
    this.validatePins(snapshot.channelPins);
    this.validateSessions(snapshot.sessions);
  }

  private validateKeyset(keyset: VerifiedAciKeyset): void {
    if (
      !this.isRecord(keyset) ||
      !this.hasExactKeys(keyset, [
        'workloadId',
        'workloadKeysetDigest',
        'version',
        'notAfter',
        'receiptSigningKeys',
        'e2eePublicKeys',
        'tlsPublicKeys',
        'channelPins',
        'channelKeyDigest',
      ]) ||
      typeof keyset.workloadId !== 'string' ||
      !PREFIXED_DIGEST.test(keyset.workloadId) ||
      typeof keyset.workloadKeysetDigest !== 'string' ||
      !PREFIXED_DIGEST.test(keyset.workloadKeysetDigest) ||
      !this.isPositiveInteger(keyset.version) ||
      !this.isPositiveInteger(keyset.notAfter) ||
      typeof keyset.channelKeyDigest !== 'string' ||
      !PREFIXED_DIGEST.test(keyset.channelKeyDigest) ||
      !Array.isArray(keyset.receiptSigningKeys) ||
      keyset.receiptSigningKeys.length === 0 ||
      keyset.receiptSigningKeys.length > MAX_ITEMS ||
      !Array.isArray(keyset.e2eePublicKeys) ||
      keyset.e2eePublicKeys.length === 0 ||
      keyset.e2eePublicKeys.length > MAX_ITEMS ||
      !Array.isArray(keyset.tlsPublicKeys) ||
      keyset.tlsPublicKeys.length > MAX_ITEMS ||
      !Array.isArray(keyset.channelPins) ||
      keyset.channelPins.length === 0
    ) {
      throw new AciTrustStateError('candidate_invalid');
    }
    this.validateReceiptKeys(keyset.receiptSigningKeys);
    this.validateE2eeKeys(keyset.e2eePublicKeys);
    this.validateTlsKeys(keyset.tlsPublicKeys);
    this.validateKeyUniqueness(keyset);
    this.validatePins(keyset.channelPins);
  }

  private validateReceiptKeys(keys: VerifiedAciKeyset['receiptSigningKeys']): void {
    for (const key of keys) {
      if (!this.isRecord(key)) throw new AciTrustStateError('candidate_invalid');
      const isEd25519 =
        key.algorithm === 'ed25519' &&
        typeof key.publicKey === 'string' &&
        key.publicKey.length === 64;
      const isSecp256k1 =
        key.algorithm === 'ecdsa-secp256k1' &&
        typeof key.publicKey === 'string' &&
        [66, 130].includes(key.publicKey.length);
      if (
        !this.hasExactKeys(key, ['keyId', 'algorithm', 'publicKey']) ||
        typeof key.keyId !== 'string' ||
        !IDENTIFIER.test(key.keyId) ||
        typeof key.publicKey !== 'string' ||
        !/^[0-9a-f]+$/.test(key.publicKey) ||
        (!isEd25519 && !isSecp256k1)
      ) {
        throw new AciTrustStateError('candidate_invalid');
      }
    }
  }

  private validateE2eeKeys(keys: VerifiedAciKeyset['e2eePublicKeys']): void {
    for (const key of keys) {
      if (!this.isRecord(key)) throw new AciTrustStateError('candidate_invalid');
      const hasValidKnownLength =
        (key.algorithm === 'x25519-aes-256-gcm-hkdf-sha256' &&
          typeof key.publicKey === 'string' &&
          key.publicKey.length === 64) ||
        (key.algorithm === 'secp256k1-aes-256-gcm-hkdf-sha256' &&
          typeof key.publicKey === 'string' &&
          [128, 130].includes(key.publicKey.length));
      if (
        !this.hasExactKeys(key, ['keyId', 'algorithm', 'publicKey']) ||
        typeof key.keyId !== 'string' ||
        !IDENTIFIER.test(key.keyId) ||
        typeof key.algorithm !== 'string' ||
        !E2EE_ALGORITHM.test(key.algorithm) ||
        typeof key.publicKey !== 'string' ||
        !/^[0-9a-f]{64,130}$/.test(key.publicKey) ||
        key.publicKey.length % 2 !== 0 ||
        (['x25519-aes-256-gcm-hkdf-sha256', 'secp256k1-aes-256-gcm-hkdf-sha256'].includes(
          key.algorithm,
        ) &&
          !hasValidKnownLength)
      ) {
        throw new AciTrustStateError('candidate_invalid');
      }
    }
    if (
      !keys.some((key) =>
        ['x25519-aes-256-gcm-hkdf-sha256', 'secp256k1-aes-256-gcm-hkdf-sha256'].includes(
          key.algorithm,
        ),
      )
    ) {
      throw new AciTrustStateError('candidate_invalid');
    }
  }

  private validateTlsKeys(keys: VerifiedAciKeyset['tlsPublicKeys']): void {
    for (const key of keys) {
      if (!this.isRecord(key)) throw new AciTrustStateError('candidate_invalid');
      const allowedKeys = key.domain === undefined ? ['spkiSha256'] : ['spkiSha256', 'domain'];
      if (
        !this.hasExactKeys(key, allowedKeys) ||
        typeof key.spkiSha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(key.spkiSha256) ||
        (key.domain !== undefined &&
          (typeof key.domain !== 'string' || key.domain.length === 0 || key.domain.length > 253))
      ) {
        throw new AciTrustStateError('candidate_invalid');
      }
    }
  }

  private validateKeyUniqueness(keyset: VerifiedAciKeyset): void {
    const receiptIds = keyset.receiptSigningKeys.map((key) => key.keyId);
    const e2eeIds = keyset.e2eePublicKeys.map((key) => key.keyId);
    const receiptKeys = keyset.receiptSigningKeys.map((key) => key.publicKey);
    if (
      new Set(receiptIds).size !== receiptIds.length ||
      new Set(e2eeIds).size !== e2eeIds.length ||
      keyset.e2eePublicKeys.some((key) => receiptKeys.includes(key.publicKey))
    ) {
      throw new AciTrustStateError('candidate_invalid');
    }
  }

  private validateSessions(sessions: VerifiedAciSessionSet): void {
    if (!this.isRecord(sessions) || !this.hasExactKeys(sessions, ROLES)) {
      throw new AciTrustStateError('role_incomplete');
    }
    const bySessionId = new Map<string, VerifiedAciSession>();
    for (const role of ROLES) {
      const session = sessions[role];
      this.validateSession(role, session);
      const previous = bySessionId.get(session.sessionId);
      if (previous !== undefined && !this.hasSameSessionTrustIdentity(previous, session)) {
        throw new AciTrustStateError('session_rollback');
      }
      bySessionId.set(session.sessionId, session);
    }
  }

  private hasSameSessionTrustIdentity(
    left: VerifiedAciSession,
    right: VerifiedAciSession,
  ): boolean {
    return (
      left.sessionId === right.sessionId &&
      left.establishedAt === right.establishedAt &&
      left.expiresAt === right.expiresAt &&
      left.workloadKeysetDigest === right.workloadKeysetDigest &&
      left.channelKeyDigest === right.channelKeyDigest &&
      left.upstreamIdentityDigest === right.upstreamIdentityDigest &&
      isDeepStrictEqual(left.channelPins, right.channelPins)
    );
  }

  private validateSession(role: InferenceModelRole, session: VerifiedAciSession): void {
    if (
      !this.isRecord(session) ||
      !this.hasExactKeys(session, [
        'role',
        'model',
        'modelRevision',
        'sessionId',
        'establishedAt',
        'expiresAt',
        'workloadKeysetDigest',
        'channelKeyDigest',
        'channelPins',
        'upstreamIdentityDigest',
      ]) ||
      session.role !== role ||
      typeof session.model !== 'string' ||
      typeof session.modelRevision !== 'string' ||
      typeof session.sessionId !== 'string' ||
      !SESSION_ID.test(session.sessionId) ||
      !this.isNonNegativeInteger(session.establishedAt) ||
      !this.isPositiveInteger(session.expiresAt) ||
      session.expiresAt <= session.establishedAt ||
      typeof session.workloadKeysetDigest !== 'string' ||
      !PREFIXED_DIGEST.test(session.workloadKeysetDigest) ||
      typeof session.channelKeyDigest !== 'string' ||
      !PREFIXED_DIGEST.test(session.channelKeyDigest) ||
      !Array.isArray(session.channelPins) ||
      typeof session.upstreamIdentityDigest !== 'string' ||
      !PREFIXED_DIGEST.test(session.upstreamIdentityDigest)
    ) {
      throw new AciTrustStateError('candidate_invalid');
    }
    this.validatePins(session.channelPins);
  }

  private validatePins(pins: readonly VerifiedAciChannelPin[]): void {
    if (pins.length === 0 || pins.length > MAX_ITEMS) {
      throw new AciTrustStateError('candidate_invalid');
    }
    for (const pin of pins) {
      if (!this.isRecord(pin)) throw new AciTrustStateError('candidate_invalid');
      const allowedKeys = ['type', 'value'];
      if (pin.domain !== undefined) allowedKeys.push('domain');
      if (pin.algorithm !== undefined) allowedKeys.push('algorithm');
      if (pin.keyId !== undefined) allowedKeys.push('keyId');
      if (pin.provider !== undefined) allowedKeys.push('provider');
      if (
        !this.hasExactKeys(pin, allowedKeys) ||
        !['tls_spki_sha256', 'tls_certificate_sha256', 'e2ee_public_key_sha256'].includes(
          pin.type,
        ) ||
        typeof pin.value !== 'string' ||
        !/^[0-9a-f]{64}$/.test(pin.value) ||
        (pin.domain !== undefined &&
          (typeof pin.domain !== 'string' || pin.domain.length === 0 || pin.domain.length > 253)) ||
        (pin.algorithm !== undefined &&
          (typeof pin.algorithm !== 'string' || !E2EE_ALGORITHM.test(pin.algorithm))) ||
        (pin.keyId !== undefined &&
          (typeof pin.keyId !== 'string' || !IDENTIFIER.test(pin.keyId))) ||
        (pin.provider !== undefined &&
          (typeof pin.provider !== 'string' ||
            pin.provider.length === 0 ||
            pin.provider.length > 512))
      ) {
        throw new AciTrustStateError('candidate_invalid');
      }
    }
  }

  private validatePolicy(snapshot: VerifiedAciTrustSnapshot): void {
    if (snapshot.policyGeneration !== this.policy.generation) {
      throw new AciTrustStateError('policy_generation_mismatch');
    }
    for (const role of ROLES) {
      const expected = this.policy.roleModels[role];
      const actual = snapshot.sessions[role];
      if (actual.model !== expected.model || actual.modelRevision !== expected.revision) {
        throw new AciTrustStateError('session_model_mismatch');
      }
    }
  }

  private validateBindings(snapshot: VerifiedAciTrustSnapshot): void {
    if (!isDeepStrictEqual(snapshot.channelPins, snapshot.keyset.channelPins)) {
      throw new AciTrustStateError('channel_pins_mismatch');
    }
    for (const role of ROLES) {
      const session = snapshot.sessions[role];
      if (session.workloadKeysetDigest !== snapshot.keyset.workloadKeysetDigest) {
        throw new AciTrustStateError('session_keyset_mismatch');
      }
    }
  }

  private validateLifetimes(snapshot: VerifiedAciTrustSnapshot, now: number): void {
    if (snapshot.keyset.notAfter <= now) throw new AciTrustStateError('keyset_expired');
    if (snapshot.keyset.notAfter - now > this.policy.maxKeysetLifetimeSeconds) {
      throw new AciTrustStateError('keyset_lifetime_exceeded');
    }
    let earliest = snapshot.keyset.notAfter;
    for (const role of ROLES) {
      const session = snapshot.sessions[role];
      if (session.establishedAt > now + this.policy.clockSkewSeconds || session.expiresAt <= now) {
        throw new AciTrustStateError('session_expired');
      }
      if (session.expiresAt - session.establishedAt > this.policy.maxSessionLifetimeSeconds) {
        throw new AciTrustStateError('session_lifetime_exceeded');
      }
      earliest = Math.min(earliest, session.expiresAt);
    }
    if (snapshot.expiresAt !== earliest) {
      throw new AciTrustStateError('snapshot_expiry_mismatch');
    }
  }

  private validateRotation(
    snapshot: VerifiedAciTrustSnapshot,
    current: VerifiedAciTrustSnapshot | undefined,
  ): void {
    if (current === undefined) return;
    const digest = snapshot.keyset.workloadKeysetDigest;
    if (snapshot.activationGeneration < current.activationGeneration) {
      throw new AciTrustStateError('activation_generation_decreased');
    }
    if (digest === current.keyset.workloadKeysetDigest) {
      if (snapshot.keyset.version < current.keyset.version) {
        throw new AciTrustStateError('keyset_version_decreased');
      }
      let hasChanged = false;
      for (const role of ROLES) {
        const previous = current.sessions[role];
        const next = snapshot.sessions[role];
        if (isDeepStrictEqual(previous, next)) continue;
        if (next.sessionId === previous.sessionId) {
          throw new AciTrustStateError('session_rollback');
        }
        if (
          next.establishedAt < previous.establishedAt ||
          next.establishedAt === previous.establishedAt
        ) {
          throw new AciTrustStateError('session_rollback');
        }
        hasChanged = true;
      }
      if (!hasChanged) throw new AciTrustStateError('keyset_current');
      return;
    }
    if (current.supersededKeysetDigests.includes(digest)) {
      throw new AciTrustStateError('keyset_superseded');
    }
    if (snapshot.keyset.version <= current.keyset.version) {
      throw new AciTrustStateError('keyset_version_decreased');
    }
  }

  private nextSuperseded(
    current: VerifiedAciTrustSnapshot | undefined,
    nextDigest: string,
  ): readonly string[] {
    if (current === undefined) return [];
    if (current.keyset.workloadKeysetDigest === nextDigest) {
      return current.supersededKeysetDigests;
    }
    return [...current.supersededKeysetDigests, current.keyset.workloadKeysetDigest].slice(
      -MAX_SUPERSEDED_DIGESTS,
    );
  }

  private now(): number {
    let value: number;
    try {
      value = this.clock();
    } catch {
      throw new AciTrustStateError('clock_invalid');
    }
    if (!this.isNonNegativeInteger(value)) throw new AciTrustStateError('clock_invalid');
    return value;
  }

  private clone<T>(value: T): T {
    return this.cloneValue(value, {
      depth: 0,
      nodes: 0,
      seen: new WeakSet<object>(),
    }) as T;
  }

  private cloneValue(value: unknown, budget: CloneBudget): unknown {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') {
      if (!Number.isSafeInteger(value)) throw new TypeError('invalid number');
      return value;
    }
    if (typeof value !== 'object') throw new TypeError('invalid value');
    if (budget.seen.has(value)) throw new TypeError('cyclic value');
    if (budget.depth >= MAX_CLONE_DEPTH || budget.nodes >= MAX_CLONE_NODES) {
      throw new TypeError('value too large');
    }
    budget.seen.add(value);
    budget.depth += 1;
    budget.nodes += 1;
    const copy: unknown = Array.isArray(value)
      ? value.map((item) => this.cloneValue(item, budget))
      : Object.fromEntries(
          Object.entries(value).map(([key, item]) => [key, this.cloneValue(item, budget)]),
        );
    budget.depth -= 1;
    budget.seen.delete(value);
    return copy;
  }

  private freeze<T>(value: T): T {
    if (value !== null && typeof value === 'object') {
      for (const nested of Object.values(value)) this.freeze(nested);
      Object.freeze(value);
    }
    return value;
  }

  private hasExactKeys(value: object, expected: readonly string[]): boolean {
    const actual = Object.keys(value).sort();
    return isDeepStrictEqual(actual, [...expected].sort());
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  private isNonNegativeInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
  }

  private isPositiveInteger(value: unknown): value is number {
    return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
  }
}
