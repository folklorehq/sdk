// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

import type {
  AciReceiptReplayStorePort,
  AciReceiptReplayClaim,
  AciTrustContext,
  AciKeysetHighWater,
  AciKeysetHighWaterPort,
  AciKeysetHighWaterAuthorityPort,
  AciTrustHighWater,
  AciTrustHighWaterStorePort,
  ForwardAdmissionReservation,
  ForwardJournalState,
  ForwardLease,
  ForwardProofReservation,
  ForwardReplayAuthorityPort,
  ForwardWritePermit,
  PrivateOfficialAciRequestWire,
  TrustedTimeAuthorityPort,
  VerifiedCommitmentConfirmation,
} from '../../../src/ports.js';
import { FORWARD_COMMITMENT_PROTOCOL } from '../../../src/ports.js';
import { AciReceiptVerificationError } from '../../../src/aci/AciReceiptVerificationError.js';

export class InMemoryAciReceiptReplayStore implements AciReceiptReplayStorePort {
  private readonly claimed = new Set<string>();
  private readonly remembered = new Set<string>();
  private readonly replayCapacity: number;

  constructor(replayCapacity = 4_096) {
    this.replayCapacity = replayCapacity;
  }

  async claim(input: AciReceiptReplayClaim): Promise<AciReceiptReplayClaim> {
    const key = this.key(input);
    if (this.claimed.has(key) || this.remembered.has(key)) throw new Error('receipt_replay');
    if (this.claimed.size + this.remembered.size >= this.replayCapacity) {
      throw new AciReceiptVerificationError('replay_capacity_exhausted');
    }
    this.claimed.add(key);
    return structuredClone(input);
  }

  async markVerified(claim: AciReceiptReplayClaim): Promise<void> {
    const key = this.key(claim);
    this.claimed.delete(key);
    this.remembered.add(key);
  }

  async releasePending(claim: AciReceiptReplayClaim): Promise<void> {
    this.claimed.delete(this.key(claim));
  }

  private key(input: AciReceiptReplayClaim): string {
    return [input.orgId, input.deploymentId, input.receiptId].join('\u0000');
  }
}

export class InMemoryAciTrustHighWaterStore implements AciTrustHighWaterStorePort {
  private readonly values = new Map<string, AciTrustHighWater>();
  private readonly superseded = new Map<string, Set<string>>();

  async load(context: AciTrustContext): Promise<AciTrustHighWater | undefined> {
    return this.values.get(this.key(context));
  }

  async isKeysetSuperseded(input: {
    readonly context: AciTrustContext;
    readonly keysetDigest: string;
  }): Promise<boolean> {
    return this.superseded.get(this.key(input.context))?.has(input.keysetDigest) ?? false;
  }

  async compareAndSet(
    context: AciTrustContext,
    expectedGeneration: number,
    next: AciTrustHighWater,
  ): Promise<boolean> {
    const key = this.key(context);
    const current = this.values.get(key);
    if ((current?.generation ?? 0) !== expectedGeneration) return false;
    if (current !== undefined && current.currentKeysetDigest !== next.currentKeysetDigest) {
      const history = this.superseded.get(key) ?? new Set<string>();
      history.add(current.currentKeysetDigest);
      this.superseded.set(key, history);
    }
    this.values.set(key, structuredClone(next));
    return true;
  }

  async read(context: AciTrustContext): Promise<AciKeysetHighWater> {
    const current = this.values.get(this.key(context));
    return {
      epoch: current?.keysetVersion ?? 0,
      digest: current?.currentKeysetDigest ?? '',
      checkpointDigest: context.checkpointDigest,
      orgId: context.orgId,
      deploymentId: context.deploymentId,
    };
  }

  async advance(input: {
    readonly context: AciTrustContext;
    readonly epoch: number;
    readonly digest: string;
  }): Promise<AciKeysetHighWater> {
    const current = await this.read(input.context);
    if (
      input.epoch < current.epoch ||
      (input.epoch === current.epoch && input.digest !== current.digest)
    ) {
      throw new Error('keyset_equivocation');
    }
    const key = this.key(input.context);
    if (current.digest !== '' && current.digest !== input.digest) {
      const history = this.superseded.get(key) ?? new Set<string>();
      history.add(current.digest);
      this.superseded.set(key, history);
    }
    const previous = this.values.get(key);
    this.values.set(key, {
      generation: previous?.generation ?? 0,
      policyGeneration: previous?.policyGeneration ?? 0,
      activationGeneration: previous?.activationGeneration ?? 0,
      keysetVersion: input.epoch,
      currentKeysetDigest: input.digest,
      supersededKeysetDigests: previous?.supersededKeysetDigests ?? [],
      trustContext: structuredClone(input.context),
    });
    return {
      epoch: input.epoch,
      digest: input.digest,
      checkpointDigest: input.context.checkpointDigest,
      orgId: input.context.orgId,
      deploymentId: input.context.deploymentId,
    };
  }

  private key(context: AciTrustContext): string {
    return [context.orgId, context.deploymentId].join('\u0000');
  }
}

export class InMemoryAciKeysetHighWaterPort implements AciKeysetHighWaterPort {
  private readonly values = new Map<string, AciKeysetHighWater>();

  async read(context: AciTrustContext): Promise<AciKeysetHighWater> {
    return (
      this.values.get(this.key(context)) ?? {
        epoch: 0,
        digest: '',
        checkpointDigest: context.checkpointDigest,
        orgId: context.orgId,
        deploymentId: context.deploymentId,
      }
    );
  }

  async advance(input: {
    readonly context: AciTrustContext;
    readonly epoch: number;
    readonly digest: string;
  }): Promise<AciKeysetHighWater> {
    const current = await this.read(input.context);
    if (
      input.epoch < current.epoch ||
      (input.epoch === current.epoch && input.digest !== current.digest)
    ) {
      throw new Error('keyset_equivocation');
    }
    const next = {
      epoch: input.epoch,
      digest: input.digest,
      checkpointDigest: input.context.checkpointDigest,
      orgId: input.context.orgId,
      deploymentId: input.context.deploymentId,
    };
    this.values.set(this.key(input.context), next);
    return next;
  }

  private key(context: AciTrustContext): string {
    return [context.orgId, context.deploymentId].join('\u0000');
  }
}

export class InMemoryAciKeysetHighWaterAuthority implements AciKeysetHighWaterAuthorityPort {
  private readonly values = new Map<string, AciTrustHighWater>();

  constructor(initial?: AciTrustHighWater) {
    if (initial !== undefined)
      this.values.set(this.key(initial.trustContext), structuredClone(initial));
  }

  async read(context: AciTrustContext): Promise<AciTrustHighWater | undefined> {
    return this.values.get(this.key(context));
  }

  async admitKeyset(input: {
    readonly context: AciTrustContext;
    readonly keysetDigest: string;
    readonly policyGeneration: number;
    readonly activationGeneration: number;
  }): Promise<number> {
    const key = this.key(input.context);
    const current = this.values.get(key);
    if (current === undefined) {
      this.values.set(key, {
        generation: 1,
        policyGeneration: input.policyGeneration,
        activationGeneration: input.activationGeneration,
        keysetVersion: 1,
        currentKeysetDigest: input.keysetDigest,
        supersededKeysetDigests: [],
        trustContext: structuredClone(input.context),
      });
      return 1;
    }
    if (input.keysetDigest === current.currentKeysetDigest) return current.keysetVersion;
    if (current.supersededKeysetDigests.includes(input.keysetDigest)) {
      throw new Error('keyset_superseded');
    }
    const nextVersion = current.keysetVersion + 1;
    this.values.set(key, {
      generation: current.generation + 1,
      policyGeneration: Math.max(current.policyGeneration, input.policyGeneration),
      activationGeneration: Math.max(current.activationGeneration, input.activationGeneration),
      keysetVersion: nextVersion,
      currentKeysetDigest: input.keysetDigest,
      supersededKeysetDigests: [...current.supersededKeysetDigests, current.currentKeysetDigest],
      trustContext: structuredClone(input.context),
    });
    return nextVersion;
  }

  private key(context: AciTrustContext): string {
    return [context.orgId, context.deploymentId].join('\u0000');
  }
}

interface ForwardRecord {
  state: ForwardJournalState;
  reservation: ForwardAdmissionReservation;
  commitmentTag?: string;
  wireSha256?: string;
  wireByteLength?: number;
  lease?: ForwardLease;
  confirmation?: VerifiedCommitmentConfirmation;
}

const FORWARD_RESERVATION_KEYS = [
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
  'tupleDigest',
  'proofDigest',
  'bindingDigest',
  'source',
] as const;

export class InMemoryForwardReplayAuthority implements ForwardReplayAuthorityPort {
  private readonly proofs = new Map<
    string,
    { readonly requestId: string; readonly expiresAt: number }
  >();
  private readonly quarantinedProofs = new Map<string, number>();
  private readonly records = new Map<string, ForwardRecord>();
  private readonly tombstones = new Map<string, number>();
  private readonly capacity: number;
  private sequence = 0;
  private previousJournalTag = '';

  constructor(capacity = 4_096) {
    this.capacity = capacity;
  }

  async claimProof(input: {
    readonly orgId: string;
    readonly deploymentId: string;
    readonly bootEpoch: string;
    readonly proofId: string;
    readonly requestId: string;
    readonly expiresAt: number;
  }): Promise<void> {
    const key = this.proofKey(input);
    if (
      this.proofs.has(key) ||
      this.records.has(key) ||
      this.hasQuarantinedProof(input) ||
      this.tombstones.has(key)
    ) {
      throw new Error('proof_replay');
    }
    if (this.activeCount() >= this.capacity) throw new Error('capacity');
    this.proofs.set(key, { requestId: input.requestId, expiresAt: input.expiresAt });
    this.append(input, 'reserved');
  }

  async releaseProof(input: {
    readonly orgId: string;
    readonly deploymentId: string;
    readonly bootEpoch: string;
    readonly proofId: string;
    readonly requestId: string;
    readonly expiresAt: number;
  }): Promise<void> {
    const key = this.proofKey(input);
    const proof = this.proofs.get(key);
    if (proof === undefined) return;
    if (proof.requestId !== input.requestId || proof.expiresAt !== input.expiresAt) {
      throw new Error('proof_replay');
    }
    this.proofs.delete(key);
    this.tombstones.set(key, proof.expiresAt);
  }

  async reserve(input: ForwardProofReservation): Promise<ForwardAdmissionReservation> {
    const key = this.proofKey(input);
    if (this.records.has(key)) throw new Error('proof_replay');
    if (this.tombstones.has(key) || this.quarantinedProofs.has(key))
      throw new Error('proof_replay');
    const proof = this.proofs.get(key);
    if (proof === undefined || proof.requestId !== input.requestId) throw new Error('proof_replay');
    if (this.activeCount() - 1 >= this.capacity) throw new Error('capacity');
    const reservation = { ...input, reservationId: `reservation-${++this.sequence}` };
    this.proofs.delete(key);
    this.records.set(key, { state: 'reserved', reservation });
    this.append(input, 'reserved', reservation.reservationId);
    return this.copyReservation(reservation);
  }

  async prepareCommitment(input: {
    readonly reservation: ForwardAdmissionReservation;
    readonly requestWire: PrivateOfficialAciRequestWire;
  }): Promise<ForwardCommitment> {
    const key = this.proofKey(input.reservation);
    const record = this.records.get(key);
    if (record === undefined || record.state !== 'reserved') throw new Error('lease_invalid');
    if (!this.sameReservation(record.reservation, input.reservation)) {
      throw new Error('lease_binding_mismatch');
    }
    const wireSha256 = this.digest(input.requestWire.bytes);
    if (
      input.requestWire.byteLength !== input.requestWire.bytes.byteLength ||
      input.requestWire.requestWireSha256 !== wireSha256
    ) {
      throw new Error('request_wire_mismatch');
    }
    const commitmentTag = this.commitmentTag(
      record.reservation,
      wireSha256,
      input.requestWire.bytes.byteLength,
    );
    record.commitmentTag = commitmentTag;
    record.wireSha256 = wireSha256;
    record.wireByteLength = input.requestWire.bytes.byteLength;
    record.state = 'commitment_pending';
    this.append(input.reservation, 'commitment_pending', record.reservation.reservationId);
    return {
      protocol: FORWARD_COMMITMENT_PROTOCOL,
      reservationId: record.reservation.reservationId,
      proofId: record.reservation.proofId,
      requestId: record.reservation.requestId,
      commitmentNonce: record.reservation.commitmentNonce,
      commitmentTag,
      channelKeyDigest: record.reservation.channelKeyDigest,
      exporterLabel: record.reservation.exporterLabel,
      exporterDigest: record.reservation.exporterDigest,
      transcriptDigest: record.reservation.transcriptDigest,
      observedChannelPin: { ...record.reservation.observedChannelPin },
    };
  }

  async finalize(input: {
    readonly reservation: ForwardAdmissionReservation;
    readonly requestWire: PrivateOfficialAciRequestWire;
    readonly confirmation: VerifiedCommitmentConfirmation;
  }): Promise<ForwardLease> {
    const key = this.proofKey(input.reservation);
    const record = this.records.get(key);
    if (record === undefined || record.state !== 'commitment_pending')
      throw new Error('lease_invalid');
    if (!this.sameReservation(record.reservation, input.reservation)) {
      throw new Error('lease_binding_mismatch');
    }
    this.validateConfirmation(
      input.reservation,
      input.requestWire,
      input.confirmation,
      record.commitmentTag,
      record.wireSha256,
      record.wireByteLength,
    );
    const lease: ForwardLease = {
      ...record.reservation,
      leaseId: `lease-${++this.sequence}`,
      requestWireSha256: record.wireSha256 ?? this.digest(input.requestWire.bytes),
      requestWireByteLength: record.wireByteLength ?? input.requestWire.bytes.byteLength,
      privateRequestWire: this.copyWire(input.requestWire),
    };
    record.confirmation = structuredClone(input.confirmation);
    record.state = 'commitment_confirmed';
    this.append(input.reservation, 'commitment_confirmed', record.reservation.reservationId);
    record.state = 'lease_ready';
    record.lease = lease;
    this.append(input.reservation, 'lease_ready', record.reservation.reservationId, lease.leaseId);
    return this.copyLease(lease);
  }

  async consumeForWrite(input: {
    readonly lease: ForwardLease;
    readonly confirmation: VerifiedCommitmentConfirmation;
    readonly trustedTime: TrustedTimeAuthorityPort;
    readonly writeAtBoundary: (
      permit: ForwardWritePermit,
      signal?: AbortSignal,
    ) => import('../../../src/ports.js').AciChannelWriteOperation;
    readonly signal?: AbortSignal;
  }): Promise<import('../../../src/ports.js').AciChannelTransportResponse> {
    const key = this.proofKey(input.lease);
    const record = [...this.records.values()].find(
      (candidate) => candidate.lease?.leaseId === input.lease.leaseId,
    );
    if (record === undefined || record.lease === undefined) throw new Error('lease_invalid');
    if (record.state !== 'lease_ready') throw new Error('lease_replay');
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
    this.validateConfirmation(
      input.lease,
      input.lease.privateRequestWire,
      input.confirmation,
      record.commitmentTag,
      record.wireSha256,
      record.wireByteLength,
    );
    if (input.signal?.aborted) throw new Error('write_cancelled');
    record.state = 'write_armed';
    this.append(input.lease, 'write_armed', input.lease.reservationId, input.lease.leaseId);
    let writeStarted = false;
    const permit = {
      __aciForwardWritePermit: Symbol('aci-forward-write-permit'),
      leaseId: input.lease.leaseId,
      validUntil: input.lease.boundedWriteValidUntil,
      channelKeyDigest: input.lease.channelKeyDigest,
      exporterLabel: input.lease.exporterLabel,
      exporterDigest: input.lease.exporterDigest,
      transcriptDigest: input.lease.transcriptDigest,
      observedChannelPin: { ...input.lease.observedChannelPin },
      assertWriteStart: () => {
        if (writeStarted) throw new Error('write_replay');
        if (input.signal?.aborted) throw new Error('write_cancelled');
        writeStarted = true;
      },
    } as ForwardWritePermit;
    let response: import('../../../src/ports.js').AciChannelTransportResponse;
    try {
      const operation = input.writeAtBoundary(permit, input.signal);
      if (!writeStarted) throw new Error('write_boundary_unverified');
      record.state = 'write_started';
      this.append(input.lease, 'write_started', input.lease.reservationId, input.lease.leaseId);
      record.state = 'response_pending';
      this.append(input.lease, 'response_pending', input.lease.reservationId, input.lease.leaseId);
      response = await operation.response;
    } catch {
      record.state = 'aborted';
      this.tombstones.set(key, input.lease.boundedWriteValidUntil);
      this.append(input.lease, 'aborted', input.lease.reservationId, input.lease.leaseId);
      this.eraseWire(record.lease.privateRequestWire);
      throw new Error('write_failed');
    }
    record.state = 'consumed';
    this.append(input.lease, 'consumed', input.lease.reservationId, input.lease.leaseId);
    this.tombstones.set(key, input.lease.boundedWriteValidUntil);
    this.eraseWire(record.lease.privateRequestWire);
    return response;
  }

  async abort(input: {
    readonly context: AciTrustContext;
    readonly reservationId: string;
    readonly leaseId?: string;
    readonly reason: string;
  }): Promise<void> {
    const record = [...this.records.values()].find(
      (candidate) =>
        candidate.reservation.reservationId === input.reservationId &&
        candidate.reservation.orgId === input.context.orgId &&
        candidate.reservation.deploymentId === input.context.deploymentId &&
        candidate.reservation.bootEpoch === input.context.bootEpoch &&
        (input.leaseId === undefined || candidate.lease?.leaseId === input.leaseId),
    );
    if (record === undefined) return;
    if (record.state === 'aborted') return;
    record.state = 'aborted';
    this.tombstones.set(this.proofKey(record.reservation), record.reservation.proofExpiresAt);
    this.append(
      record.reservation,
      'aborted',
      record.reservation.reservationId,
      record.lease?.leaseId,
    );
    if (record.lease !== undefined) this.eraseWire(record.lease.privateRequestWire);
  }

  async recoverAfterRestart(input: { readonly context: AciTrustContext }): Promise<void> {
    for (const [key, proof] of this.proofs) {
      const [orgId, deploymentId] = key.split('\u0000');
      if (orgId === input.context.orgId && deploymentId === input.context.deploymentId) {
        this.proofs.delete(key);
        this.quarantinedProofs.set(key, proof.expiresAt);
      }
    }
    for (const record of this.records.values()) {
      if (
        record.reservation.orgId === input.context.orgId &&
        record.reservation.deploymentId === input.context.deploymentId &&
        record.state !== 'consumed' &&
        record.state !== 'aborted' &&
        record.state !== 'quarantined'
      ) {
        record.state = 'quarantined';
        this.tombstones.set(this.proofKey(record.reservation), record.reservation.proofExpiresAt);
        this.append(
          record.reservation,
          'quarantined',
          record.reservation.reservationId,
          record.lease?.leaseId,
        );
        if (record.lease !== undefined) this.eraseWire(record.lease.privateRequestWire);
      }
    }
  }

  async cleanup(input: {
    readonly context: AciTrustContext;
    readonly trustedNow: number;
  }): Promise<void> {
    for (const record of this.records.values()) {
      if (
        record.reservation.orgId === input.context.orgId &&
        record.reservation.deploymentId === input.context.deploymentId &&
        record.state !== 'consumed' &&
        record.state !== 'aborted' &&
        record.state !== 'quarantined' &&
        record.reservation.boundedWriteValidUntil <= input.trustedNow
      ) {
        record.state = 'aborted';
        this.tombstones.set(this.proofKey(record.reservation), record.reservation.proofExpiresAt);
        this.append(
          record.reservation,
          'aborted',
          record.reservation.reservationId,
          record.lease?.leaseId,
        );
        if (record.lease !== undefined) this.eraseWire(record.lease.privateRequestWire);
      }
    }
    for (const [key, proof] of this.proofs) {
      if (proof.expiresAt <= input.trustedNow) this.proofs.delete(key);
    }
    for (const [key, expiresAt] of this.quarantinedProofs) {
      if (expiresAt <= input.trustedNow) this.quarantinedProofs.delete(key);
    }
    for (const [key, expiresAt] of this.tombstones) {
      if (expiresAt <= input.trustedNow) {
        this.tombstones.delete(key);
        this.records.delete(key);
      }
    }
  }

  private proofKey(input: {
    readonly orgId: string;
    readonly deploymentId: string;
    readonly bootEpoch: string;
    readonly proofId: string;
  }): string {
    return [input.orgId, input.deploymentId, input.bootEpoch, input.proofId].join('\u0000');
  }

  private activeCount(): number {
    let count = this.proofs.size;
    for (const record of this.records.values()) {
      if (
        record.state !== 'aborted' &&
        record.state !== 'consumed' &&
        record.state !== 'quarantined'
      ) {
        count += 1;
      }
    }
    return count;
  }

  private validateConfirmation(
    reservation: ForwardProofReservation & { readonly reservationId: string },
    wire: PrivateOfficialAciRequestWire,
    confirmation: VerifiedCommitmentConfirmation,
    expectedTag?: string,
    expectedWireSha256?: string,
    expectedByteLength?: number,
  ): void {
    const digest = `sha256:${createHash('sha256').update(wire.bytes).digest('hex')}`;
    if (
      confirmation.reservationId !== reservation.reservationId ||
      confirmation.proofId !== reservation.proofId ||
      confirmation.requestId !== reservation.requestId ||
      confirmation.commitmentNonce !== reservation.commitmentNonce ||
      confirmation.commitmentTag !==
        (expectedTag ?? this.commitmentTag(reservation, digest, wire.bytes.byteLength)) ||
      (expectedWireSha256 !== undefined && expectedWireSha256 !== digest) ||
      (expectedByteLength !== undefined && expectedByteLength !== wire.bytes.byteLength) ||
      confirmation.channelKeyDigest !== reservation.channelKeyDigest ||
      confirmation.exporterLabel !== reservation.exporterLabel ||
      confirmation.exporterDigest !== reservation.exporterDigest ||
      confirmation.transcriptDigest !== reservation.transcriptDigest ||
      confirmation.confirmationSequence !== 1 ||
      confirmation.observedChannelPin.type !== reservation.observedChannelPin.type ||
      confirmation.observedChannelPin.value !== reservation.observedChannelPin.value
    ) {
      throw new Error('commitment_mismatch');
    }
  }

  private commitmentTag(
    reservation: ForwardAdmissionReservation,
    wireSha256: string,
    byteLength: number,
  ): string {
    return `test-commitment:${createHash('sha256')
      .update(
        [
          reservation.reservationId,
          reservation.proofId,
          reservation.requestId,
          reservation.commitmentNonce,
          wireSha256,
          String(byteLength),
        ].join('\u0000'),
      )
      .digest('hex')}`;
  }

  private hasQuarantinedProof(input: {
    readonly orgId: string;
    readonly deploymentId: string;
    readonly proofId: string;
  }): boolean {
    return [...this.quarantinedProofs.keys()].some((key) => {
      const [orgId, deploymentId, , proofId] = key.split('\u0000');
      return (
        orgId === input.orgId && deploymentId === input.deploymentId && proofId === input.proofId
      );
    });
  }

  private sameReservation(left: ForwardProofReservation, right: ForwardProofReservation): boolean {
    for (const key of FORWARD_RESERVATION_KEYS) {
      if (left[key] !== right[key]) return false;
    }
    const leftPin = left.observedChannelPin;
    const rightPin = right.observedChannelPin;
    return (
      leftPin.type === rightPin.type &&
      leftPin.value === rightPin.value &&
      leftPin.domain === rightPin.domain &&
      leftPin.algorithm === rightPin.algorithm &&
      leftPin.keyId === rightPin.keyId &&
      leftPin.provider === rightPin.provider
    );
  }

  private append(
    scope: {
      readonly orgId: string;
      readonly deploymentId: string;
      readonly bootEpoch: string;
      readonly proofId: string;
    },
    state: ForwardJournalState,
    reservationId?: string,
    leaseId?: string,
  ): void {
    const metadata = JSON.stringify({
      orgId: scope.orgId,
      deploymentId: scope.deploymentId,
      bootEpoch: scope.bootEpoch,
      proofId: scope.proofId,
      reservationId,
      leaseId,
      state,
      sequence: ++this.sequence,
      previous: this.previousJournalTag,
    });
    this.previousJournalTag = createHash('sha256').update(metadata).digest('hex');
  }

  private copyReservation(reservation: ForwardAdmissionReservation): ForwardAdmissionReservation {
    return { ...reservation, observedChannelPin: { ...reservation.observedChannelPin } };
  }

  private copyWire(wire: PrivateOfficialAciRequestWire): PrivateOfficialAciRequestWire {
    return {
      bytes: Uint8Array.from(wire.bytes),
      requestWireSha256: wire.requestWireSha256,
      byteLength: wire.byteLength,
    };
  }

  private copyLease(lease: ForwardLease): ForwardLease {
    return {
      ...lease,
      observedChannelPin: { ...lease.observedChannelPin },
      privateRequestWire: this.copyWire(lease.privateRequestWire),
    };
  }

  private eraseWire(wire: PrivateOfficialAciRequestWire): void {
    wire.bytes.fill(0);
  }

  private digest(bytes: Uint8Array): string {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  }
}
