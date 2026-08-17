// SPDX-License-Identifier: Apache-2.0
import { createHash, randomBytes } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

import type {
  AciTrustContext,
  AciChannelTransportResponse,
  ForwardAdmissionReservation,
  ForwardCommitment,
  ForwardLease,
  ForwardLeaseStorePort,
  ForwardProofReservation,
  ForwardReplayAuthorityPort,
  ForwardWritePermit,
  MutuallyAttestedChannel,
  ObservedAciChannelBinding,
  PrivateOfficialAciRequestWire,
  TrustedTimeAuthorityPort,
  VerifiedAciSession,
  VerifiedAciTrustSnapshot,
  VerifiedAciChannelPin,
  VerifiedCommitmentConfirmation,
  VerifiedPreForwardRouteProof,
} from '../ports.js';
import { FORWARD_COMMITMENT_PROTOCOL } from '../ports.js';

const WRITE_WINDOW_SECONDS = 30;
const MAX_CONTENT_LENGTH = 67_108_864;
const COMMITMENT_NONCE_BYTES = 16;
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

export type ForwardLeaseStoreErrorCode =
  | 'durable_state_required'
  | 'durable_state_unavailable'
  | 'capacity'
  | 'lease_binding_mismatch'
  | 'lease_expired'
  | 'lease_invalid'
  | 'lease_replay'
  | 'proof_replay'
  | 'request_wire_mismatch'
  | 'commitment_mismatch'
  | 'commitment_replay';

export class ForwardLeaseStoreError extends Error {
  readonly code: ForwardLeaseStoreErrorCode;

  constructor(code: ForwardLeaseStoreErrorCode) {
    super(`Forward lease failed: ${code}`);
    this.name = 'ForwardLeaseStoreError';
    this.code = code;
  }
}

export interface ForwardLeaseStoreConfig {
  readonly durableState: ForwardReplayAuthorityPort;
}

export class ForwardLeaseStore implements ForwardLeaseStorePort {
  private readonly durableState: ForwardReplayAuthorityPort;

  constructor(config?: ForwardLeaseStoreConfig) {
    const durableState = config?.durableState;
    if (
      typeof durableState?.claimProof !== 'function' ||
      typeof durableState?.releaseProof !== 'function' ||
      typeof durableState?.reserve !== 'function' ||
      typeof durableState?.prepareCommitment !== 'function' ||
      typeof durableState?.finalize !== 'function' ||
      typeof durableState?.consumeForWrite !== 'function' ||
      typeof durableState?.abort !== 'function' ||
      typeof durableState?.recoverAfterRestart !== 'function' ||
      typeof durableState?.cleanup !== 'function'
    ) {
      throw new ForwardLeaseStoreError('durable_state_required');
    }
    this.durableState = durableState;
  }

  async reserveFromVerifiedProof(input: {
    readonly context: AciTrustContext;
    readonly snapshot: VerifiedAciTrustSnapshot;
    readonly session: VerifiedAciSession;
    readonly observedChannel: ObservedAciChannelBinding;
    readonly proof: VerifiedPreForwardRouteProof;
    readonly trustedNow: number;
  }): Promise<ForwardAdmissionReservation> {
    this.validateAdmissionInput(input);
    const admissionExpiresAt = Math.min(
      input.proof.expiresAt,
      input.snapshot.expiresAt,
      input.session.expiresAt,
    );
    const reservation: ForwardProofReservation = {
      orgId: input.context.orgId,
      deploymentId: input.context.deploymentId,
      tenantId: input.proof.tenantContext.tenantId,
      assignmentDigest: input.proof.tenantContext.assignmentDigest,
      workloadId: input.proof.issuer.workloadId,
      runtimeIdentityDigest: input.proof.issuer.runtimeIdentityDigest,
      workloadArtifactDigest: input.proof.issuer.workloadArtifactDigest,
      pinnedTrustRootDigest: input.proof.pinnedTrustRootDigest,
      workloadKeysetDigest: input.proof.workloadKeysetDigest,
      tenantAadDigest: input.proof.tenantAadDigest,
      bootEpoch: input.context.bootEpoch,
      trustedTimeCheckpointDigest: input.context.checkpointDigest,
      gatewayNonce: input.proof.challenge.gatewayNonce,
      proofId: input.proof.proofId,
      requestId: input.proof.requestId,
      snapshotDigest: input.proof.snapshotDigest,
      policyDigest: input.proof.policyDigest,
      role: input.proof.role,
      sessionId: input.proof.sessionId,
      model: input.proof.model,
      modelRevision: input.proof.modelRevision,
      modelArtifactDigest: input.proof.modelArtifactDigest,
      capabilityDigest: input.proof.capabilityDigest,
      origin: input.proof.route.origin,
      route: input.proof.route.route,
      method: input.proof.route.method,
      routeIdentityDigest: input.proof.route.routeIdentityDigest,
      channelKeyDigest: input.observedChannel.channelKeyDigest,
      exporterLabel: input.observedChannel.exporterLabel,
      exporterDigest: input.observedChannel.exporterDigest,
      transcriptDigest: input.observedChannel.transcriptDigest,
      policyGeneration: input.proof.policyGeneration,
      activationGeneration: input.proof.activationGeneration,
      proofIssuedAt: input.proof.issuedAt,
      proofExpiresAt: input.proof.expiresAt,
      snapshotExpiresAt: input.snapshot.expiresAt,
      admissionExpiresAt,
      boundedWriteValidUntil: Math.min(admissionExpiresAt, input.trustedNow + WRITE_WINDOW_SECONDS),
      commitmentNonce: randomBytes(COMMITMENT_NONCE_BYTES).toString('hex'),
      observedChannelPin: this.copyPin(input.observedChannel.observedChannelPin),
    };
    try {
      const persisted = await this.durableState.reserve(reservation);
      this.validateReservation(persisted, reservation);
      return this.copyReservation(persisted);
    } catch (error) {
      throw this.mapDurableError(error, 'durable_state_unavailable');
    }
  }

  async prepareCommitment(input: {
    readonly reservation: ForwardAdmissionReservation;
    readonly requestWire: PrivateOfficialAciRequestWire;
  }): Promise<ForwardCommitment> {
    let normalized: PrivateOfficialAciRequestWire | undefined;
    let committed = false;
    try {
      normalized = this.normalizeWire(input.requestWire);
      const commitment = await this.durableState.prepareCommitment({
        reservation: input.reservation,
        requestWire: normalized,
      });
      this.validateCommitment(input.reservation, commitment);
      committed = true;
      return commitment;
    } catch (error) {
      const mapped = this.mapDurableError(error, 'durable_state_unavailable');
      if (!committed) await this.abortAfterFailure(input.reservation, 'commitment_failed');
      throw mapped;
    } finally {
      normalized?.bytes.fill(0);
      if (!committed) input.requestWire.bytes.fill(0);
    }
  }

  async finalize(input: {
    readonly reservation: ForwardAdmissionReservation;
    readonly requestWire: PrivateOfficialAciRequestWire;
    readonly confirmation: VerifiedCommitmentConfirmation;
  }): Promise<ForwardLease> {
    let normalized: PrivateOfficialAciRequestWire | undefined;
    let finalized = false;
    try {
      normalized = this.normalizeWire(input.requestWire);
      this.validateConfirmation(input.reservation, input.confirmation);
      const lease = await this.durableState.finalize({
        reservation: input.reservation,
        requestWire: normalized,
        confirmation: input.confirmation,
      });
      finalized = true;
      return this.copyLease(lease);
    } catch (error) {
      const mapped = this.mapDurableError(error, 'durable_state_unavailable');
      if (!finalized) await this.abortAfterFailure(input.reservation, 'finalize_failed');
      throw mapped;
    } finally {
      normalized?.bytes.fill(0);
      input.requestWire.bytes.fill(0);
    }
  }

  async writeOnce(input: {
    readonly lease: ForwardLease;
    readonly confirmation: VerifiedCommitmentConfirmation;
    readonly trustedTime: TrustedTimeAuthorityPort;
    readonly channel: MutuallyAttestedChannel;
    readonly requestWire: PrivateOfficialAciRequestWire;
    readonly signal?: AbortSignal;
  }): Promise<AciChannelTransportResponse> {
    try {
      this.validateWire(
        input.requestWire,
        input.lease.requestWireSha256,
        input.lease.requestWireByteLength,
      );
      this.validateConfirmation(input.lease, input.confirmation);
      this.validateChannel(input.channel, input.lease);
      return await this.durableState.consumeForWrite({
        lease: input.lease,
        confirmation: input.confirmation,
        trustedTime: input.trustedTime,
        writeAtBoundary: (permit, signal) => {
          this.validatePermit(permit, input.lease);
          const operation = input.channel.writeBodyOnce({
            bytes: input.requestWire.bytes,
            permit,
            signal,
          });
          if (
            operation === null ||
            typeof operation !== 'object' ||
            typeof operation.response?.then !== 'function'
          ) {
            throw new ForwardLeaseStoreError('lease_invalid');
          }
          return operation;
        },
        signal: input.signal,
      });
    } catch (error) {
      try {
        await this.abort({
          context: {
            orgId: input.lease.orgId,
            deploymentId: input.lease.deploymentId,
            bootEpoch: input.lease.bootEpoch,
            checkpointDigest: input.lease.trustedTimeCheckpointDigest,
          },
          reservationId: input.lease.reservationId,
          leaseId: input.lease.leaseId,
          reason: 'write_failed',
        });
      } catch {
        throw new ForwardLeaseStoreError('durable_state_unavailable');
      }
      if (error instanceof ForwardLeaseStoreError) throw error;
      throw this.mapDurableError(error, 'lease_invalid');
    } finally {
      input.requestWire.bytes.fill(0);
      input.lease.privateRequestWire.bytes.fill(0);
    }
  }

  async abort(input: {
    readonly context: AciTrustContext;
    readonly reservationId: string;
    readonly leaseId?: string;
    readonly reason: string;
  }): Promise<void> {
    try {
      await this.durableState.abort(input);
    } catch (error) {
      throw this.mapDurableError(error, 'durable_state_unavailable');
    }
  }

  async recoverAfterRestart(input: { readonly context: AciTrustContext }): Promise<void> {
    try {
      await this.durableState.recoverAfterRestart(input);
    } catch (error) {
      throw this.mapDurableError(error, 'durable_state_unavailable');
    }
  }

  async cleanup(input: {
    readonly context: AciTrustContext;
    readonly trustedNow: number;
  }): Promise<void> {
    try {
      await this.durableState.cleanup(input);
    } catch (error) {
      throw this.mapDurableError(error, 'durable_state_unavailable');
    }
  }

  private validateAdmissionInput(input: {
    readonly context: AciTrustContext;
    readonly snapshot: VerifiedAciTrustSnapshot;
    readonly session: VerifiedAciSession;
    readonly observedChannel: ObservedAciChannelBinding;
    readonly proof: VerifiedPreForwardRouteProof;
    readonly trustedNow: number;
  }): void {
    const snapshotSession = input.snapshot.sessions[input.proof.role];
    const snapshotTrustContext = input.snapshot.trustContext;
    if (
      !Number.isSafeInteger(input.trustedNow) ||
      input.trustedNow <= 0 ||
      snapshotTrustContext === undefined ||
      snapshotTrustContext.orgId !== input.context.orgId ||
      snapshotTrustContext.deploymentId !== input.context.deploymentId ||
      snapshotTrustContext.bootEpoch !== input.context.bootEpoch ||
      snapshotTrustContext.checkpointDigest !== input.context.checkpointDigest ||
      snapshotSession === undefined ||
      !this.sameSession(input.session, snapshotSession) ||
      input.proof.orgId !== input.context.orgId ||
      input.proof.deploymentId !== input.context.deploymentId ||
      input.proof.challenge.bootEpoch !== input.context.bootEpoch ||
      input.proof.workloadKeysetDigest !== input.snapshot.keyset.workloadKeysetDigest ||
      input.proof.issuer.workloadId !== input.snapshot.keyset.workloadId ||
      input.proof.policyGeneration !== input.snapshot.policyGeneration ||
      input.proof.activationGeneration !== input.snapshot.activationGeneration ||
      input.proof.role !== input.session.role ||
      input.proof.sessionId !== input.session.sessionId ||
      input.proof.model !== input.session.model ||
      input.proof.modelRevision !== input.session.modelRevision ||
      input.observedChannel.channelKeyDigest !== input.snapshot.keyset.channelKeyDigest ||
      input.proof.connection.channelKeyDigest !== input.observedChannel.channelKeyDigest ||
      input.proof.connection.exporterLabel !== input.observedChannel.exporterLabel ||
      input.proof.connection.exporterDigest !== input.observedChannel.exporterDigest ||
      input.proof.connection.transcriptDigest !== input.observedChannel.transcriptDigest ||
      !this.samePin(input.observedChannel.observedChannelPin, input.snapshot.keyset.channelPins) ||
      !this.samePin(input.observedChannel.observedChannelPin, input.snapshot.channelPins)
    ) {
      throw new ForwardLeaseStoreError('lease_binding_mismatch');
    }
    const admissionExpiresAt = Math.min(
      input.proof.expiresAt,
      input.snapshot.expiresAt,
      input.session.expiresAt,
    );
    if (
      input.proof.issuedAt > input.trustedNow ||
      input.proof.expiresAt <= input.proof.issuedAt ||
      input.snapshot.keyset.notAfter <= input.trustedNow ||
      admissionExpiresAt <= input.trustedNow
    ) {
      throw new ForwardLeaseStoreError('lease_invalid');
    }
  }

  private normalizeWire(wire: PrivateOfficialAciRequestWire): PrivateOfficialAciRequestWire {
    const actualLength = wire.bytes.byteLength;
    const actualHash = this.digest(wire.bytes);
    if (
      wire.byteLength !== actualLength ||
      wire.requestWireSha256 !== actualHash ||
      actualLength <= 0 ||
      actualLength > MAX_CONTENT_LENGTH
    ) {
      throw new ForwardLeaseStoreError('request_wire_mismatch');
    }
    return {
      bytes: Uint8Array.from(wire.bytes),
      requestWireSha256: actualHash,
      byteLength: actualLength,
    };
  }

  private validateWire(
    wire: PrivateOfficialAciRequestWire,
    expectedHash: string,
    expectedLength: number,
  ): void {
    if (
      wire.bytes.byteLength !== expectedLength ||
      wire.byteLength !== expectedLength ||
      wire.requestWireSha256 !== expectedHash ||
      wire.requestWireSha256 !== this.digest(wire.bytes)
    ) {
      throw new ForwardLeaseStoreError('request_wire_mismatch');
    }
  }

  private validateConfirmation(
    reservation: ForwardProofReservation,
    confirmation: VerifiedCommitmentConfirmation,
  ): void {
    if (
      confirmation.protocol !== FORWARD_COMMITMENT_PROTOCOL ||
      !Number.isSafeInteger(confirmation.confirmationSequence) ||
      confirmation.confirmationSequence !== 1 ||
      confirmation.reservationId !==
        ('reservationId' in reservation ? reservation.reservationId : '') ||
      confirmation.proofId !== reservation.proofId ||
      confirmation.requestId !== reservation.requestId ||
      confirmation.commitmentNonce !== reservation.commitmentNonce ||
      confirmation.commitmentTag === '' ||
      confirmation.channelKeyDigest !== reservation.channelKeyDigest ||
      confirmation.exporterLabel !== reservation.exporterLabel ||
      confirmation.exporterDigest !== reservation.exporterDigest ||
      confirmation.transcriptDigest !== reservation.transcriptDigest ||
      !this.samePin(confirmation.observedChannelPin, [reservation.observedChannelPin])
    ) {
      throw new ForwardLeaseStoreError('commitment_mismatch');
    }
  }

  private validateCommitment(
    reservation: ForwardAdmissionReservation,
    commitment: ForwardCommitment,
  ): void {
    if (
      commitment.protocol !== FORWARD_COMMITMENT_PROTOCOL ||
      commitment.reservationId !== reservation.reservationId ||
      commitment.proofId !== reservation.proofId ||
      commitment.requestId !== reservation.requestId ||
      commitment.commitmentNonce !== reservation.commitmentNonce ||
      commitment.commitmentTag === '' ||
      commitment.channelKeyDigest !== reservation.channelKeyDigest ||
      commitment.exporterLabel !== reservation.exporterLabel ||
      commitment.exporterDigest !== reservation.exporterDigest ||
      commitment.transcriptDigest !== reservation.transcriptDigest ||
      !this.samePin(commitment.observedChannelPin, [reservation.observedChannelPin])
    ) {
      throw new ForwardLeaseStoreError('commitment_mismatch');
    }
  }

  private validateReservation(
    persisted: ForwardAdmissionReservation,
    expected: ForwardProofReservation,
  ): void {
    if (
      typeof persisted.reservationId !== 'string' ||
      persisted.reservationId === '' ||
      !RESERVATION_KEYS.every((key) => persisted[key] === expected[key]) ||
      !this.samePin(persisted.observedChannelPin, [expected.observedChannelPin])
    ) {
      throw new ForwardLeaseStoreError('lease_binding_mismatch');
    }
  }

  private samePin(pin: VerifiedAciChannelPin, pins: readonly VerifiedAciChannelPin[]): boolean {
    return pins.some(
      (candidate) =>
        candidate.type === pin.type &&
        candidate.value === pin.value &&
        candidate.domain === pin.domain &&
        candidate.algorithm === pin.algorithm &&
        candidate.keyId === pin.keyId &&
        candidate.provider === pin.provider,
    );
  }

  private sameSession(left: VerifiedAciSession, right: VerifiedAciSession): boolean {
    return (
      left.role === right.role &&
      left.model === right.model &&
      left.modelRevision === right.modelRevision &&
      left.sessionId === right.sessionId &&
      left.establishedAt === right.establishedAt &&
      left.expiresAt === right.expiresAt &&
      left.workloadKeysetDigest === right.workloadKeysetDigest &&
      left.channelKeyDigest === right.channelKeyDigest &&
      left.channelPins.length === right.channelPins.length &&
      left.channelPins.every((pin) => this.samePin(pin, right.channelPins)) &&
      left.upstreamIdentityDigest === right.upstreamIdentityDigest &&
      left.upstreamIdentity.upstreamName === right.upstreamIdentity.upstreamName &&
      left.upstreamIdentity.urlOrigin === right.upstreamIdentity.urlOrigin &&
      left.upstreamIdentity.verifierId === right.upstreamIdentity.verifierId &&
      isDeepStrictEqual(left.upstreamIdentity.claims, right.upstreamIdentity.claims)
    );
  }

  private copyPin(pin: VerifiedAciChannelPin): VerifiedAciChannelPin {
    return Object.freeze({ ...pin });
  }

  private copyReservation(reservation: ForwardAdmissionReservation): ForwardAdmissionReservation {
    return Object.freeze({
      ...reservation,
      observedChannelPin: this.copyPin(reservation.observedChannelPin),
    });
  }

  private copyLease(lease: ForwardLease): ForwardLease {
    return Object.freeze({
      ...lease,
      observedChannelPin: this.copyPin(lease.observedChannelPin),
      privateRequestWire: {
        bytes: Uint8Array.from(lease.privateRequestWire.bytes),
        requestWireSha256: lease.privateRequestWire.requestWireSha256,
        byteLength: lease.privateRequestWire.byteLength,
      },
    });
  }

  private validateChannel(channel: MutuallyAttestedChannel, lease: ForwardLease): void {
    if (
      channel.channelKeyDigest !== lease.channelKeyDigest ||
      channel.exporterLabel !== lease.exporterLabel ||
      channel.exporterDigest !== lease.exporterDigest ||
      channel.transcriptDigest !== lease.transcriptDigest ||
      !this.samePin(channel.observedChannelPin, [lease.observedChannelPin])
    ) {
      throw new ForwardLeaseStoreError('lease_binding_mismatch');
    }
  }

  private validatePermit(permit: ForwardWritePermit, lease: ForwardLease): void {
    if (
      permit.leaseId !== lease.leaseId ||
      permit.validUntil !== lease.boundedWriteValidUntil ||
      permit.channelKeyDigest !== lease.channelKeyDigest ||
      permit.exporterLabel !== lease.exporterLabel ||
      permit.exporterDigest !== lease.exporterDigest ||
      permit.transcriptDigest !== lease.transcriptDigest ||
      !this.samePin(permit.observedChannelPin, [lease.observedChannelPin]) ||
      typeof permit.assertWriteStart !== 'function'
    ) {
      throw new ForwardLeaseStoreError('lease_binding_mismatch');
    }
  }

  private digest(bytes: Uint8Array): string {
    return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  }

  private async abortAfterFailure(
    reservation: ForwardAdmissionReservation,
    reason: string,
  ): Promise<void> {
    try {
      await this.durableState.abort({
        context: {
          orgId: reservation.orgId,
          deploymentId: reservation.deploymentId,
          bootEpoch: reservation.bootEpoch,
          checkpointDigest: reservation.trustedTimeCheckpointDigest,
        },
        reservationId: reservation.reservationId,
        reason,
      });
    } catch {
      throw new ForwardLeaseStoreError('durable_state_unavailable');
    }
  }

  private mapDurableError(
    error: unknown,
    fallback: ForwardLeaseStoreErrorCode,
  ): ForwardLeaseStoreError {
    if (error instanceof ForwardLeaseStoreError) return error;
    if (error instanceof Error && this.isDurableErrorCode(error.message)) {
      return new ForwardLeaseStoreError(error.message);
    }
    return new ForwardLeaseStoreError(fallback);
  }

  private isDurableErrorCode(value: string): value is ForwardLeaseStoreErrorCode {
    return (
      value === 'capacity' ||
      value === 'commitment_mismatch' ||
      value === 'commitment_replay' ||
      value === 'lease_binding_mismatch' ||
      value === 'lease_expired' ||
      value === 'lease_invalid' ||
      value === 'lease_replay' ||
      value === 'proof_replay' ||
      value === 'request_wire_mismatch'
    );
  }
}
