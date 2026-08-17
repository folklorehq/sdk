// SPDX-License-Identifier: Apache-2.0
import { createHash, randomUUID } from 'node:crypto';

import type {
  AciChannelTransportResponse,
  AciTrustContext,
  ForwardAdmissionReservation,
  ForwardCommitment,
  ForwardCommitmentAuthenticatorPort,
  ForwardJournalState,
  ForwardLease,
  ForwardProofReservation,
  ForwardReplayAuthorityPort,
  ForwardReplayJournalEntry,
  ForwardReplayJournalPort,
  ForwardReplayScope,
  ForwardWritePermit,
  PrivateOfficialAciRequestWire,
  TrustedWriteBoundaryPort,
  TrustedTimeAuthorityPort,
  VerifiedCommitmentConfirmation,
} from '../ports.js';
import { FORWARD_COMMITMENT_PROTOCOL } from '../ports.js';

const MAX_CONTENT_LENGTH = 67_108_864;
const TERMINAL_STATES = new Set<ForwardJournalState>(['consumed', 'aborted', 'quarantined']);
const VALID_TRANSITIONS: Readonly<Record<ForwardJournalState, readonly ForwardJournalState[]>> = {
  reserved: ['reserved', 'commitment_pending', 'aborted', 'quarantined'],
  commitment_pending: ['commitment_confirmed', 'aborted', 'quarantined'],
  commitment_confirmed: ['lease_ready', 'aborted', 'quarantined'],
  lease_ready: ['write_armed', 'aborted', 'quarantined'],
  write_armed: ['write_started', 'aborted', 'quarantined'],
  write_started: ['response_pending', 'aborted', 'quarantined'],
  response_pending: ['consumed', 'aborted', 'quarantined'],
  consumed: [],
  aborted: [],
  quarantined: [],
};
const RESERVATION_KEYS = [
  'orgId',
  'deploymentId',
  'tenantId',
  'assignmentDigest',
  'workloadId',
  'runtimeIdentityDigest',
  'workloadArtifactDigest',
  'pinnedTrustRootDigest',
  'workloadKeysetDigest',
  'tenantAadDigest',
  'bootEpoch',
  'trustedTimeCheckpointDigest',
  'gatewayNonce',
  'proofId',
  'requestId',
  'snapshotDigest',
  'policyDigest',
  'role',
  'sessionId',
  'model',
  'modelRevision',
  'modelArtifactDigest',
  'capabilityDigest',
  'origin',
  'route',
  'method',
  'routeIdentityDigest',
  'channelKeyDigest',
  'exporterLabel',
  'exporterDigest',
  'transcriptDigest',
  'policyGeneration',
  'activationGeneration',
  'proofIssuedAt',
  'proofExpiresAt',
  'snapshotExpiresAt',
  'admissionExpiresAt',
  'boundedWriteValidUntil',
  'commitmentNonce',
] as const;

type ScopeKey = `${string}\u0000${string}`;

interface ProofClaim {
  readonly requestId: string;
  readonly expiresAt: number;
}

interface DurableRecord {
  state: ForwardJournalState;
  readonly reservation: ForwardAdmissionReservation;
  commitmentTag?: string;
  wireSha256?: string;
  wireByteLength?: number;
  lease?: ForwardLease;
}

interface ScopeState {
  sequence: number;
  tailTag: string;
  readonly proofs: Map<string, ProofClaim>;
  readonly quarantinedProofs: Map<string, number>;
  readonly tombstones: Map<string, number>;
  readonly tombstoneRequests: Map<string, string>;
  readonly records: Map<string, DurableRecord>;
  recoveryRequired: boolean;
}

interface InternalForwardWritePermit extends ForwardWritePermit {
  started(): boolean;
}

export interface DurableForwardReplayAuthorityConfig {
  readonly journal: ForwardReplayJournalPort;
  readonly commitmentAuthenticator: ForwardCommitmentAuthenticatorPort;
  readonly writeBoundary: TrustedWriteBoundaryPort;
  readonly capacity?: number;
}

export class DurableForwardReplayAuthority implements ForwardReplayAuthorityPort {
  private readonly journal: ForwardReplayJournalPort;
  private readonly commitmentAuthenticator: ForwardCommitmentAuthenticatorPort;
  private readonly writeBoundary: TrustedWriteBoundaryPort;
  private readonly capacity: number;
  private readonly scopes = new Map<ScopeKey, ScopeState>();
  private readonly loads = new Map<ScopeKey, Promise<ScopeState>>();
  private readonly locks = new Map<ScopeKey, Promise<void>>();

  constructor(config: DurableForwardReplayAuthorityConfig) {
    if (
      typeof config.journal?.load !== 'function' ||
      typeof config.journal?.append !== 'function' ||
      typeof config.commitmentAuthenticator?.create !== 'function' ||
      typeof config.commitmentAuthenticator?.journalTag !== 'function' ||
      typeof config.writeBoundary?.assertValid !== 'function'
    ) {
      throw new Error('durable_state_required');
    }
    if (
      config.capacity !== undefined &&
      (!Number.isSafeInteger(config.capacity) || config.capacity <= 0)
    ) {
      throw new Error('capacity_invalid');
    }
    this.journal = config.journal;
    this.commitmentAuthenticator = config.commitmentAuthenticator;
    this.writeBoundary = config.writeBoundary;
    this.capacity = config.capacity ?? 4_096;
  }

  async claimProof(input: ForwardReplayScope & { readonly expiresAt: number }): Promise<void> {
    await this.withScopeLock(input, async (scope) => {
      this.ensureRecovered(scope);
      const key = this.proofKey(input);
      if (
        scope.proofs.has(key) ||
        this.hasRecord(scope, input.proofId) ||
        this.hasQuarantinedProof(scope, input.proofId) ||
        scope.tombstones.has(key)
      ) {
        throw new Error('proof_replay');
      }
      if (this.activeCount(scope) >= this.capacity) throw new Error('capacity');
      await this.append(scope, input, 'reserved', undefined, { expiresAt: input.expiresAt });
      scope.proofs.set(key, { requestId: input.requestId, expiresAt: input.expiresAt });
    });
  }

  async releaseProof(input: ForwardReplayScope & { readonly expiresAt: number }): Promise<void> {
    await this.withScopeLock(input, async (scope) => {
      this.ensureRecovered(scope);
      const key = this.proofKey(input);
      const proof = scope.proofs.get(key);
      if (proof === undefined) return;
      if (proof.requestId !== input.requestId || proof.expiresAt !== input.expiresAt) {
        throw new Error('proof_replay');
      }
      await this.append(scope, input, 'aborted', undefined, { expiresAt: proof.expiresAt });
      scope.proofs.delete(key);
      scope.tombstones.set(key, proof.expiresAt);
      scope.tombstoneRequests.set(key, input.requestId);
    });
  }

  async reserve(input: ForwardProofReservation): Promise<ForwardAdmissionReservation> {
    return this.withScopeLock(input, async (scope) => {
      this.ensureRecovered(scope);
      const key = this.proofKey(input);
      const proof = scope.proofs.get(key);
      if (proof === undefined || proof.requestId !== input.requestId)
        throw new Error('proof_replay');
      if (this.hasQuarantinedProof(scope, input.proofId) || scope.tombstones.has(key)) {
        throw new Error('proof_replay');
      }
      if (this.activeCount(scope) - 1 >= this.capacity) throw new Error('capacity');
      const reservation = Object.freeze({ ...input, reservationId: randomUUID() });
      await this.append(scope, reservation, 'reserved', reservation);
      scope.proofs.delete(key);
      scope.records.set(key, { state: 'reserved', reservation });
      return this.copyReservation(reservation);
    });
  }

  async prepareCommitment(input: {
    readonly reservation: ForwardAdmissionReservation;
    readonly requestWire: PrivateOfficialAciRequestWire;
  }): Promise<ForwardCommitment> {
    return this.withScopeLock(input.reservation, async (scope) => {
      this.ensureRecovered(scope);
      const record = this.requireRecord(scope, input.reservation);
      if (record.state !== 'reserved') throw new Error('commitment_replay');
      if (!this.sameReservation(record.reservation, input.reservation)) {
        throw new Error('lease_binding_mismatch');
      }
      const wire = this.validateWire(input.requestWire);
      const commitmentTag = this.commitmentAuthenticator.create({
        reservation: input.reservation,
        wireSha256: wire.requestWireSha256,
        byteLength: wire.byteLength,
      });
      await this.append(scope, input.reservation, 'commitment_pending', input.reservation, {
        commitmentTag,
      });
      record.commitmentTag = commitmentTag;
      record.wireSha256 = wire.requestWireSha256;
      record.wireByteLength = wire.byteLength;
      record.state = 'commitment_pending';
      return this.commitment(input.reservation, commitmentTag);
    });
  }

  async finalize(input: {
    readonly reservation: ForwardAdmissionReservation;
    readonly requestWire: PrivateOfficialAciRequestWire;
    readonly confirmation: VerifiedCommitmentConfirmation;
  }): Promise<ForwardLease> {
    return this.withScopeLock(input.reservation, async (scope) => {
      this.ensureRecovered(scope);
      const record = this.requireRecord(scope, input.reservation);
      if (record.state !== 'commitment_pending' || record.commitmentTag === undefined) {
        throw new Error('lease_invalid');
      }
      if (!this.sameReservation(record.reservation, input.reservation)) {
        throw new Error('lease_binding_mismatch');
      }
      const wire = this.validateWire(input.requestWire);
      this.validateConfirmation(input.reservation, input.confirmation, record.commitmentTag);
      if (
        record.wireSha256 !== wire.requestWireSha256 ||
        record.wireByteLength !== wire.byteLength
      ) {
        throw new Error('commitment_mismatch');
      }
      const lease: ForwardLease = {
        ...record.reservation,
        leaseId: randomUUID(),
        requestWireSha256: wire.requestWireSha256,
        requestWireByteLength: wire.byteLength,
        privateRequestWire: this.copyWire(wire),
      };
      await this.append(scope, record.reservation, 'commitment_confirmed', record.reservation, {
        commitmentTag: record.commitmentTag,
        leaseId: lease.leaseId,
      });
      record.state = 'commitment_confirmed';
      record.lease = lease;
      await this.append(scope, record.reservation, 'lease_ready', record.reservation, {
        commitmentTag: record.commitmentTag,
        leaseId: lease.leaseId,
      });
      record.state = 'lease_ready';
      return this.copyLease(lease);
    });
  }

  async consumeForWrite(input: {
    readonly lease: ForwardLease;
    readonly confirmation: VerifiedCommitmentConfirmation;
    readonly trustedTime: TrustedTimeAuthorityPort;
    readonly writeAtBoundary: (
      permit: ForwardWritePermit,
      signal?: AbortSignal,
    ) => import('../ports.js').AciChannelWriteOperation;
    readonly signal?: AbortSignal;
  }): Promise<AciChannelTransportResponse> {
    return this.withScopeLock(input.lease, async (scope) => {
      this.ensureRecovered(scope);
      const record = this.findLease(scope, input.lease.leaseId);
      if (record === undefined || record.lease === undefined) throw new Error('lease_invalid');
      if (record.state !== 'lease_ready') throw new Error('lease_replay');
      if (input.signal?.aborted) throw new Error('write_cancelled');
      if (!this.sameReservation(record.lease, input.lease)) {
        throw new Error('lease_binding_mismatch');
      }
      const now = await input.trustedTime.read({
        orgId: input.lease.orgId,
        deploymentId: input.lease.deploymentId,
        bootEpoch: input.lease.bootEpoch,
        checkpointDigest: input.lease.trustedTimeCheckpointDigest,
      });
      if (now.trustedNow >= input.lease.boundedWriteValidUntil) throw new Error('lease_expired');
      if (record.commitmentTag === undefined) throw new Error('lease_invalid');
      this.validateConfirmation(input.lease, input.confirmation, record.commitmentTag);
      await this.append(scope, record.lease, 'write_armed', record.lease, {
        commitmentTag: record.commitmentTag,
        leaseId: record.lease.leaseId,
      });
      record.state = 'write_armed';
      try {
        const boundaryNow = await input.trustedTime.read({
          orgId: input.lease.orgId,
          deploymentId: input.lease.deploymentId,
          bootEpoch: input.lease.bootEpoch,
          checkpointDigest: input.lease.trustedTimeCheckpointDigest,
        });
        if (boundaryNow.trustedNow >= input.lease.boundedWriteValidUntil) {
          throw new Error('lease_expired');
        }
        const permit = this.permit(input.lease, input.signal, boundaryNow.trustedNow);
        const operation = input.writeAtBoundary(permit, input.signal);
        if (!permit.started()) throw new Error('write_boundary_unverified');
        await this.append(scope, record.lease, 'write_started', record.lease, {
          commitmentTag: record.commitmentTag,
          leaseId: record.lease.leaseId,
        });
        record.state = 'write_started';
        await this.append(scope, record.lease, 'response_pending', record.lease, {
          commitmentTag: record.commitmentTag,
          leaseId: record.lease.leaseId,
        });
        record.state = 'response_pending';
        const response = await this.awaitResponse(operation.response, input.signal);
        await this.append(scope, record.lease, 'consumed', record.lease, {
          commitmentTag: record.commitmentTag,
          leaseId: record.lease.leaseId,
        });
        record.state = 'consumed';
        const proofKey = this.proofKey(record.reservation);
        scope.tombstones.set(proofKey, record.reservation.proofExpiresAt);
        scope.tombstoneRequests.set(proofKey, record.reservation.requestId);
        this.eraseWire(record.lease.privateRequestWire);
        return response;
      } catch (error: unknown) {
        try {
          await this.terminalize(scope, record, 'aborted');
        } finally {
          this.eraseWire(record.lease.privateRequestWire);
        }
        throw error;
      }
    });
  }

  async abort(input: {
    readonly context: AciTrustContext;
    readonly reservationId: string;
    readonly leaseId?: string;
    readonly reason: string;
  }): Promise<void> {
    await this.withScopeLock(input.context, async (scope) => {
      this.ensureRecovered(scope);
      const record = [...scope.records.values()].find(
        (candidate) =>
          candidate.reservation.reservationId === input.reservationId &&
          candidate.reservation.orgId === input.context.orgId &&
          candidate.reservation.deploymentId === input.context.deploymentId &&
          candidate.reservation.bootEpoch === input.context.bootEpoch &&
          (input.leaseId === undefined || candidate.lease?.leaseId === input.leaseId),
      );
      if (record === undefined || TERMINAL_STATES.has(record.state)) return;
      await this.terminalize(scope, record, 'aborted');
    });
  }

  async recoverAfterRestart(input: { readonly context: AciTrustContext }): Promise<void> {
    await this.withScopeLock(input.context, async (scope) => {
      for (const [key, proof] of scope.proofs) {
        scope.proofs.delete(key);
        scope.quarantinedProofs.set(key, proof.expiresAt);
        scope.tombstones.set(key, proof.expiresAt);
        scope.tombstoneRequests.set(key, proof.requestId);
        const [orgId, deploymentId, bootEpoch, proofId] = key.split('\u0000');
        await this.append(
          scope,
          {
            orgId: orgId ?? input.context.orgId,
            deploymentId: deploymentId ?? input.context.deploymentId,
            bootEpoch: bootEpoch ?? input.context.bootEpoch,
            proofId: proofId ?? '',
            requestId: proof.requestId,
          },
          'quarantined',
          undefined,
          { expiresAt: proof.expiresAt },
        );
      }
      for (const record of scope.records.values()) {
        if (TERMINAL_STATES.has(record.state)) continue;
        await this.terminalize(scope, record, 'quarantined');
      }
      scope.recoveryRequired = false;
    });
  }

  async cleanup(input: {
    readonly context: AciTrustContext;
    readonly trustedNow: number;
  }): Promise<void> {
    await this.withScopeLock(input.context, async (scope) => {
      this.ensureRecovered(scope);
      for (const record of scope.records.values()) {
        if (
          !TERMINAL_STATES.has(record.state) &&
          record.reservation.boundedWriteValidUntil <= input.trustedNow
        ) {
          await this.terminalize(scope, record, 'aborted');
        }
      }
      for (const [key, proof] of scope.proofs) {
        if (proof.expiresAt > input.trustedNow) continue;
        const [orgId, deploymentId, bootEpoch, proofId, requestId] = key.split('\u0000');
        scope.proofs.delete(key);
        scope.tombstones.set(key, proof.expiresAt);
        scope.tombstoneRequests.set(key, proof.requestId);
        await this.append(
          scope,
          {
            orgId: orgId ?? input.context.orgId,
            deploymentId: deploymentId ?? input.context.deploymentId,
            bootEpoch: bootEpoch ?? input.context.bootEpoch,
            proofId: proofId ?? '',
            requestId: requestId ?? proof.requestId,
          },
          'aborted',
          undefined,
          { expiresAt: proof.expiresAt },
        );
      }
      for (const [key, expiresAt] of scope.quarantinedProofs) {
        if (expiresAt <= input.trustedNow) scope.quarantinedProofs.delete(key);
      }
      for (const [key, expiresAt] of [...scope.tombstones]) {
        if (expiresAt <= input.trustedNow) {
          const tombstoneScope = this.tombstoneScope(scope, key);
          if (tombstoneScope === undefined) throw new Error('durable_state_unavailable');
          await this.append(scope, tombstoneScope, 'aborted', undefined, { expiresAt: 0 });
          scope.tombstones.delete(key);
          scope.tombstoneRequests.delete(key);
          scope.records.delete(key);
        }
      }
    });
  }

  private async withScopeLock<T>(
    input: { readonly orgId: string; readonly deploymentId: string },
    operation: (scope: ScopeState) => Promise<T>,
  ): Promise<T> {
    const key = this.scopeKey(input);
    const previous = this.locks.get(key) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.locks.set(key, current);
    await previous;
    try {
      return await operation(await this.loadScope(input));
    } finally {
      release();
      if (this.locks.get(key) === current) this.locks.delete(key);
    }
  }

  private async loadScope(input: {
    readonly orgId: string;
    readonly deploymentId: string;
  }): Promise<ScopeState> {
    const key = this.scopeKey(input);
    const existing = this.scopes.get(key);
    if (existing !== undefined) return existing;
    const pending = this.loads.get(key);
    if (pending !== undefined) return pending;
    const load = this.journal
      .load(input)
      .then((snapshot) => this.rehydrate(input, snapshot))
      .catch(() => {
        throw new Error('durable_state_unavailable');
      });
    this.loads.set(key, load);
    try {
      const scope = await load;
      this.scopes.set(key, scope);
      return scope;
    } finally {
      this.loads.delete(key);
    }
  }

  private rehydrate(
    input: { readonly orgId: string; readonly deploymentId: string },
    snapshot: {
      readonly sequence: number;
      readonly tailTag: string;
      readonly entries: readonly ForwardReplayJournalEntry[];
    },
  ): ScopeState {
    let previous = '';
    let sequence = 0;
    const records = new Map<string, DurableRecord>();
    const proofs = new Map<string, ProofClaim>();
    const quarantinedProofs = new Map<string, number>();
    const tombstones = new Map<string, number>();
    const tombstoneRequests = new Map<string, string>();
    for (const entry of snapshot.entries) {
      if (
        entry.scope.orgId !== input.orgId ||
        entry.scope.deploymentId !== input.deploymentId ||
        entry.sequence !== sequence + 1 ||
        entry.previousTag !== previous ||
        entry.entryTag !== this.entryTag(entry)
      ) {
        throw new Error('journal_equivocation');
      }
      sequence = entry.sequence;
      previous = entry.entryTag;
      const key = this.proofKey(entry.scope);
      if (entry.reservation === undefined) {
        if (entry.state === 'reserved') {
          const expiresAt = entry.expiresAt;
          if (
            typeof expiresAt !== 'number' ||
            !Number.isSafeInteger(expiresAt) ||
            expiresAt <= 0 ||
            tombstones.has(key) ||
            proofs.has(key)
          ) {
            throw new Error('journal_equivocation');
          }
          proofs.set(key, {
            requestId: entry.scope.requestId,
            expiresAt,
          });
        }
        if (entry.state === 'quarantined' && (entry.expiresAt ?? 0) <= 0) {
          proofs.delete(key);
          quarantinedProofs.delete(key);
          tombstones.delete(key);
          tombstoneRequests.delete(key);
        } else if (entry.state === 'quarantined') {
          proofs.delete(key);
          const expiresAt = entry.expiresAt ?? 0;
          quarantinedProofs.set(key, expiresAt);
          tombstones.set(key, expiresAt);
          tombstoneRequests.set(key, entry.scope.requestId);
        }
        if (entry.state === 'aborted' && (entry.expiresAt ?? 0) <= 0) {
          proofs.delete(key);
          quarantinedProofs.delete(key);
          tombstones.delete(key);
          tombstoneRequests.delete(key);
        } else if (entry.state === 'aborted') {
          proofs.delete(key);
          const expiresAt = entry.expiresAt ?? 0;
          tombstones.set(key, expiresAt);
          tombstoneRequests.set(key, entry.scope.requestId);
        }
        continue;
      }
      if (
        entry.reservation.orgId !== entry.scope.orgId ||
        entry.reservation.deploymentId !== entry.scope.deploymentId ||
        entry.reservation.bootEpoch !== entry.scope.bootEpoch ||
        entry.reservation.proofId !== entry.scope.proofId ||
        entry.reservation.requestId !== entry.scope.requestId
      ) {
        throw new Error('journal_equivocation');
      }
      const current = records.get(key);
      if (current === undefined && entry.state !== 'reserved') {
        throw new Error('journal_equivocation');
      }
      if (current !== undefined && !VALID_TRANSITIONS[current.state].includes(entry.state)) {
        throw new Error('journal_equivocation');
      }
      const next = current ?? { state: entry.state, reservation: entry.reservation };
      proofs.delete(key);
      next.state = entry.state;
      next.commitmentTag = entry.commitmentTag ?? next.commitmentTag;
      if (
        entry.leaseId !== undefined &&
        next.lease === undefined &&
        next.commitmentTag !== undefined
      ) {
        next.lease = {
          ...entry.reservation,
          leaseId: entry.leaseId,
          requestWireSha256: '',
          requestWireByteLength: 0,
          privateRequestWire: { bytes: new Uint8Array(), requestWireSha256: '', byteLength: 0 },
        };
      }
      records.set(key, next);
      if (
        entry.state === 'consumed' ||
        entry.state === 'aborted' ||
        entry.state === 'quarantined'
      ) {
        tombstones.set(key, entry.reservation.proofExpiresAt);
        tombstoneRequests.set(key, entry.reservation.requestId);
      }
    }
    if (sequence !== snapshot.sequence || previous !== snapshot.tailTag)
      throw new Error('journal_rollback');
    return {
      sequence,
      tailTag: previous,
      proofs,
      quarantinedProofs,
      tombstones,
      tombstoneRequests,
      records,
      recoveryRequired:
        proofs.size > 0 ||
        [...records.values()].some((record) => !TERMINAL_STATES.has(record.state)),
    };
  }

  private async append(
    scope: ScopeState,
    source: ForwardReplayScope,
    state: ForwardJournalState,
    reservation?: ForwardAdmissionReservation,
    extras: {
      readonly commitmentTag?: string;
      readonly leaseId?: string;
      readonly expiresAt?: number;
    } = {},
  ): Promise<void> {
    const sequence = scope.sequence + 1;
    const entry: ForwardReplayJournalEntry = {
      scope: { ...source },
      state,
      ...(reservation === undefined ? {} : { reservation }),
      ...(extras.leaseId === undefined ? {} : { leaseId: extras.leaseId }),
      ...(extras.commitmentTag === undefined ? {} : { commitmentTag: extras.commitmentTag }),
      ...(extras.expiresAt === undefined ? {} : { expiresAt: extras.expiresAt }),
      sequence,
      previousTag: scope.tailTag,
      entryTag: '',
    };
    const signed = { ...entry, entryTag: this.entryTag(entry) };
    const snapshot = await this.journal.append({
      orgId: source.orgId,
      deploymentId: source.deploymentId,
      expectedSequence: scope.sequence,
      expectedTailTag: scope.tailTag,
      entry: signed,
    });
    if (snapshot.sequence !== sequence || snapshot.tailTag !== signed.entryTag) {
      throw new Error('journal_equivocation');
    }
    scope.sequence = snapshot.sequence;
    scope.tailTag = snapshot.tailTag;
  }

  private async terminalize(
    scope: ScopeState,
    record: DurableRecord,
    state: 'aborted' | 'quarantined',
  ): Promise<void> {
    try {
      await this.append(scope, record.reservation, state, record.reservation, {
        commitmentTag: record.commitmentTag,
        leaseId: record.lease?.leaseId,
      });
      record.state = state;
      const key = this.proofKey(record.reservation);
      scope.tombstones.set(key, record.reservation.proofExpiresAt);
      scope.tombstoneRequests.set(key, record.reservation.requestId);
    } catch (error) {
      scope.recoveryRequired = true;
      throw error;
    } finally {
      if (record.lease !== undefined) this.eraseWire(record.lease.privateRequestWire);
    }
  }

  private requireRecord(
    scope: ScopeState,
    reservation: ForwardAdmissionReservation,
  ): DurableRecord {
    const record = scope.records.get(this.proofKey(reservation));
    if (record === undefined) throw new Error('lease_invalid');
    return record;
  }

  private findLease(scope: ScopeState, leaseId: string): DurableRecord | undefined {
    return [...scope.records.values()].find((record) => record.lease?.leaseId === leaseId);
  }

  private activeCount(scope: ScopeState): number {
    let count = scope.proofs.size;
    for (const record of scope.records.values()) {
      if (!TERMINAL_STATES.has(record.state)) count += 1;
    }
    return count;
  }

  private ensureRecovered(scope: ScopeState): void {
    if (scope.recoveryRequired) throw new Error('restart_recovery_required');
  }

  private tombstoneScope(scope: ScopeState, key: string): ForwardReplayScope | undefined {
    const [orgId, deploymentId, bootEpoch, proofId] = key.split('\u0000');
    const requestId = scope.tombstoneRequests.get(key);
    if (
      orgId === undefined ||
      deploymentId === undefined ||
      bootEpoch === undefined ||
      proofId === undefined ||
      requestId === undefined
    ) {
      return undefined;
    }
    return { orgId, deploymentId, bootEpoch, proofId, requestId };
  }

  private hasRecord(scope: ScopeState, proofId: string): boolean {
    return [...scope.records.values()].some((record) => record.reservation.proofId === proofId);
  }

  private hasQuarantinedProof(scope: ScopeState, proofId: string): boolean {
    return [...scope.quarantinedProofs.keys()].some((key) => key.split('\u0000')[3] === proofId);
  }

  private validateWire(wire: PrivateOfficialAciRequestWire): PrivateOfficialAciRequestWire {
    const byteLength = wire.bytes.byteLength;
    const wireSha256 = this.digest(wire.bytes);
    if (
      byteLength <= 0 ||
      byteLength > MAX_CONTENT_LENGTH ||
      wire.byteLength !== byteLength ||
      wire.requestWireSha256 !== wireSha256
    ) {
      throw new Error('request_wire_mismatch');
    }
    return { bytes: Uint8Array.from(wire.bytes), requestWireSha256: wireSha256, byteLength };
  }

  private validateConfirmation(
    reservation: ForwardProofReservation & { readonly reservationId: string },
    confirmation: VerifiedCommitmentConfirmation,
    expectedTag: string,
  ): void {
    if (
      confirmation.protocol !== FORWARD_COMMITMENT_PROTOCOL ||
      confirmation.confirmationSequence !== 1 ||
      confirmation.reservationId !== reservation.reservationId ||
      confirmation.proofId !== reservation.proofId ||
      confirmation.requestId !== reservation.requestId ||
      confirmation.commitmentNonce !== reservation.commitmentNonce ||
      confirmation.commitmentTag !== expectedTag ||
      confirmation.channelKeyDigest !== reservation.channelKeyDigest ||
      confirmation.exporterLabel !== reservation.exporterLabel ||
      confirmation.exporterDigest !== reservation.exporterDigest ||
      confirmation.transcriptDigest !== reservation.transcriptDigest ||
      !this.samePin(confirmation.observedChannelPin, reservation.observedChannelPin)
    ) {
      throw new Error('commitment_mismatch');
    }
  }

  private commitment(
    reservation: ForwardAdmissionReservation,
    commitmentTag: string,
  ): ForwardCommitment {
    return {
      protocol: FORWARD_COMMITMENT_PROTOCOL,
      reservationId: reservation.reservationId,
      proofId: reservation.proofId,
      requestId: reservation.requestId,
      commitmentNonce: reservation.commitmentNonce,
      commitmentTag,
      channelKeyDigest: reservation.channelKeyDigest,
      exporterLabel: reservation.exporterLabel,
      exporterDigest: reservation.exporterDigest,
      transcriptDigest: reservation.transcriptDigest,
      observedChannelPin: { ...reservation.observedChannelPin },
    };
  }

  private permit(
    lease: ForwardLease,
    signal: AbortSignal | undefined,
    trustedNow: number,
  ): InternalForwardWritePermit {
    let writeStarted = false;
    return {
      __aciForwardWritePermit: Symbol('aci-forward-write-permit'),
      leaseId: lease.leaseId,
      validUntil: lease.boundedWriteValidUntil,
      channelKeyDigest: lease.channelKeyDigest,
      exporterLabel: lease.exporterLabel,
      exporterDigest: lease.exporterDigest,
      transcriptDigest: lease.transcriptDigest,
      observedChannelPin: { ...lease.observedChannelPin },
      assertWriteStart: () => {
        if (writeStarted) throw new Error('write_replay');
        if (signal?.aborted) throw new Error('write_cancelled');
        this.writeBoundary.assertValid({
          context: {
            orgId: lease.orgId,
            deploymentId: lease.deploymentId,
            bootEpoch: lease.bootEpoch,
            checkpointDigest: lease.trustedTimeCheckpointDigest,
          },
          validUntil: lease.boundedWriteValidUntil,
          trustedNow,
        });
        writeStarted = true;
      },
      started: () => writeStarted,
    } as unknown as InternalForwardWritePermit;
  }

  private async awaitResponse<T>(response: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal === undefined) return response;
    if (signal.aborted) throw new Error('write_cancelled');
    return new Promise<T>((resolve, reject) => {
      const abort = () => reject(new Error('write_cancelled'));
      const cleanup = () => signal.removeEventListener('abort', abort);
      signal.addEventListener('abort', abort, { once: true });
      response.then(
        (value) => {
          cleanup();
          resolve(value);
        },
        (error: unknown) => {
          cleanup();
          reject(error);
        },
      );
    });
  }

  private copyReservation(reservation: ForwardAdmissionReservation): ForwardAdmissionReservation {
    return Object.freeze({
      ...reservation,
      observedChannelPin: { ...reservation.observedChannelPin },
    });
  }

  private copyLease(lease: ForwardLease): ForwardLease {
    return Object.freeze({
      ...lease,
      observedChannelPin: { ...lease.observedChannelPin },
      privateRequestWire: this.copyWire(lease.privateRequestWire),
    });
  }

  private copyWire(wire: PrivateOfficialAciRequestWire): PrivateOfficialAciRequestWire {
    return {
      bytes: Uint8Array.from(wire.bytes),
      requestWireSha256: wire.requestWireSha256,
      byteLength: wire.byteLength,
    };
  }

  private eraseWire(wire: PrivateOfficialAciRequestWire): void {
    wire.bytes.fill(0);
  }

  private sameReservation(left: ForwardProofReservation, right: ForwardProofReservation): boolean {
    for (const key of RESERVATION_KEYS) if (left[key] !== right[key]) return false;
    return this.samePin(left.observedChannelPin, right.observedChannelPin);
  }

  private samePin(
    left: ForwardProofReservation['observedChannelPin'],
    right: ForwardProofReservation['observedChannelPin'],
  ): boolean {
    return (
      left.type === right.type &&
      left.value === right.value &&
      left.domain === right.domain &&
      left.algorithm === right.algorithm &&
      left.keyId === right.keyId &&
      left.provider === right.provider
    );
  }

  private scopeKey(input: { readonly orgId: string; readonly deploymentId: string }): ScopeKey {
    return `${input.orgId}\u0000${input.deploymentId}`;
  }

  private proofKey(input: {
    readonly orgId: string;
    readonly deploymentId: string;
    readonly bootEpoch: string;
    readonly proofId: string;
  }): string {
    return [input.orgId, input.deploymentId, input.bootEpoch, input.proofId].join('\u0000');
  }

  private digest(bytes: Uint8Array): string {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  }

  private entryTag(entry: ForwardReplayJournalEntry): string {
    const unsigned = { ...entry, entryTag: '' };
    return this.commitmentAuthenticator.journalTag(unsigned);
  }
}
