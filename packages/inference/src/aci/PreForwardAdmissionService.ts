// SPDX-License-Identifier: Apache-2.0
import type {
  AciKeysetHighWaterAuthorityPort,
  AciTrustContext,
  AciV2TrustStatePort,
  ControlProofExchangePort,
  ForwardAdmissionCapability,
  ForwardBodyOpenCapability,
  ForwardCommitment,
  ForwardLeaseStorePort,
  ForwardProofReservation,
  MutuallyAttestedChannel,
  MutuallyAttestedChannelPort,
  OfficialAciRequest,
  OfficialAciRequestWireSerializerPort,
  PreForwardRouteBinding,
  PreForwardRouteProofVerifierPort,
  PrivateOfficialAciRequestWire,
  TrustedTimeAuthorityPort,
  VerifiedAciSession,
  VerifiedAciTrustSnapshot,
  VerifiedCommitmentConfirmation,
  VerifiedPreForwardRouteProof,
  ObservedAciChannelBinding,
} from '../ports.js';
import {
  consumeForwardBodyOpenCapability,
  issueForwardAdmissionCapability,
  issueForwardBodyOpenCapability,
} from './forward-admission-capability.js';

export class PreForwardAdmissionError extends Error {
  constructor() {
    super('ACI admission failed');
    this.name = 'PreForwardAdmissionError';
  }
}

export interface PreForwardAdmissionInput {
  readonly request: Omit<OfficialAciRequest, 'body'>;
  readonly context: AciTrustContext;
  readonly challenge: Parameters<ControlProofExchangePort['exchange']>[0]['challenge'];
  readonly descriptor: Parameters<ControlProofExchangePort['exchange']>[0]['descriptor'];
  readonly expectedProof: PreForwardRouteBinding;
}

export interface PreForwardAdmissionServiceConfig {
  readonly trustState: AciV2TrustStatePort;
  readonly channelPort: MutuallyAttestedChannelPort;
  readonly controlProofExchange: ControlProofExchangePort;
  readonly proofVerifier: PreForwardRouteProofVerifierPort;
  readonly trustedTime: TrustedTimeAuthorityPort;
  readonly leaseStore: ForwardLeaseStorePort;
  readonly keysetHighWater: AciKeysetHighWaterAuthorityPort;
  readonly requestSerializer: OfficialAciRequestWireSerializerPort;
}

export class PreForwardAdmissionService {
  private readonly config: PreForwardAdmissionServiceConfig;

  constructor(config: PreForwardAdmissionServiceConfig) {
    if (
      typeof config.trustState?.acquireWithTrustedTime !== 'function' ||
      typeof config.channelPort?.open !== 'function' ||
      typeof config.controlProofExchange?.exchange !== 'function' ||
      typeof config.controlProofExchange?.confirmCommitment !== 'function' ||
      typeof config.proofVerifier?.verify !== 'function' ||
      typeof config.proofVerifier?.release !== 'function' ||
      typeof config.trustedTime?.read !== 'function' ||
      typeof config.leaseStore?.reserveFromVerifiedProof !== 'function' ||
      typeof config.leaseStore?.prepareCommitment !== 'function' ||
      typeof config.leaseStore?.finalize !== 'function' ||
      typeof config.leaseStore?.writeOnce !== 'function' ||
      typeof config.leaseStore?.abort !== 'function' ||
      typeof config.keysetHighWater?.read !== 'function' ||
      typeof config.requestSerializer?.serialize !== 'function'
    ) {
      throw new PreForwardAdmissionError();
    }
    this.config = config;
  }

  async admit(input: PreForwardAdmissionInput): Promise<ForwardBodyOpenCapability> {
    let channel: MutuallyAttestedChannel | undefined;
    let proof: VerifiedPreForwardRouteProof | undefined;
    let reservation:
      | Awaited<ReturnType<ForwardLeaseStorePort['reserveFromVerifiedProof']>>
      | undefined;
    try {
      const snapshot = await this.requireSnapshot(input.context);
      const session = this.requireSession(snapshot, input.request.role);
      this.validateDescriptor(input, session);
      const highWater = await this.config.keysetHighWater.read(input.context);
      this.validateHighWater(highWater, input.context, snapshot);
      channel = await this.config.channelPort.open({
        orgId: input.context.orgId,
        deploymentId: input.context.deploymentId,
        workloadId: snapshot.keyset.workloadId,
        routeIdentityDigest: input.expectedProof.routeIdentityDigest,
        pinnedTrustRootDigest: input.expectedProof.pinnedTrustRootDigest,
        channelKeyDigest: snapshot.keyset.channelKeyDigest,
        sessionId: session.sessionId,
        channelPins: snapshot.channelPins,
        exporterLabel: input.expectedProof.exporterLabel,
        exporterDigest: input.expectedProof.exporterDigest,
        transcriptDigest: input.expectedProof.transcriptDigest,
      });
      const encodedProof = await this.config.controlProofExchange.exchange({
        channel,
        challenge: input.challenge,
        descriptor: input.descriptor,
      });
      proof = await this.config.proofVerifier.verify({
        encodedProof,
        expected: input.expectedProof,
      });
      this.validateVerifiedProof(input, proof, snapshot, session, channel);
      const trustedNow = await this.readAdmissionTime(input.context);
      reservation = await this.config.leaseStore.reserveFromVerifiedProof({
        context: input.context,
        snapshot,
        session,
        observedChannel: this.observedChannel(channel),
        proof,
        trustedNow,
      });
      return issueForwardBodyOpenCapability({
        channel,
        reservation,
        snapshot,
        session,
        request: input.request,
      });
    } catch {
      if (reservation !== undefined) {
        await this.abortReservation(input.context, reservation.reservationId, 'admission_failed');
      }
      if (proof !== undefined) await this.releaseProof(proof);
      if (channel !== undefined) await this.closeChannel(channel);
      throw new PreForwardAdmissionError();
    }
  }

  async finalize(
    capability: ForwardBodyOpenCapability,
    body: OfficialAciRequest['body'],
  ): Promise<{
    lease: Awaited<ReturnType<ForwardLeaseStorePort['finalize']>>;
    capability: ForwardAdmissionCapability;
  }> {
    const data = consumeForwardBodyOpenCapability(capability);
    let wire: PrivateOfficialAciRequestWire | undefined;
    let normalized: PrivateOfficialAciRequestWire | undefined;
    try {
      wire = await this.config.requestSerializer.serialize({ ...data.request, body });
      normalized = {
        bytes: Uint8Array.from(wire.bytes),
        requestWireSha256: wire.requestWireSha256,
        byteLength: wire.byteLength,
      };
      const commitment: ForwardCommitment = await this.config.leaseStore.prepareCommitment({
        reservation: data.reservation,
        requestWire: normalized,
      });
      const confirmation = await this.config.controlProofExchange.confirmCommitment({
        channel: data.channel,
        commitment,
      });
      this.validateConfirmation(commitment, confirmation);
      const lease = await this.config.leaseStore.finalize({
        reservation: data.reservation,
        requestWire: normalized,
        confirmation,
      });
      return {
        lease,
        capability: issueForwardAdmissionCapability({
          channel: data.channel,
          lease,
          requestWire: lease.privateRequestWire,
          confirmation,
          leaseStore: this.config.leaseStore,
          trustedTime: this.config.trustedTime,
        }),
      };
    } catch {
      await this.abortReservation(
        this.reservationContext(data.reservation),
        data.reservation.reservationId,
        'finalize_failed',
      );
      await this.closeChannel(data.channel);
      throw new PreForwardAdmissionError();
    } finally {
      wire?.bytes.fill(0);
      normalized?.bytes.fill(0);
    }
  }

  async finalizeBody(
    capability: ForwardBodyOpenCapability,
    body: OfficialAciRequest['body'],
  ): ReturnType<PreForwardAdmissionService['finalize']> {
    return this.finalize(capability, body);
  }

  async abortBodyOpen(
    capability: ForwardBodyOpenCapability,
    reason = 'body_aborted',
  ): Promise<void> {
    const data = consumeForwardBodyOpenCapability(capability);
    await this.abortReservation(
      this.reservationContext(data.reservation),
      data.reservation.reservationId,
      reason,
    );
    await this.closeChannel(data.channel);
  }

  private async requireSnapshot(context: AciTrustContext): Promise<VerifiedAciTrustSnapshot> {
    const snapshot = await this.config.trustState.acquireWithTrustedTime(context);
    if (snapshot === undefined) throw new PreForwardAdmissionError();
    return snapshot;
  }

  private requireSession(
    snapshot: VerifiedAciTrustSnapshot,
    role: VerifiedAciSession['role'],
  ): VerifiedAciSession {
    const session = snapshot.sessions[role];
    if (session === undefined) throw new PreForwardAdmissionError();
    return session;
  }

  private validateDescriptor(input: PreForwardAdmissionInput, session: VerifiedAciSession): void {
    const descriptor = input.descriptor;
    if (
      descriptor.role !== input.request.role ||
      descriptor.role !== session.role ||
      descriptor.method !== input.request.method ||
      descriptor.route !== input.request.endpoint ||
      descriptor.sessionId !== session.sessionId ||
      descriptor.model !== session.model ||
      descriptor.modelRevision !== session.modelRevision
    ) {
      throw new PreForwardAdmissionError();
    }
  }

  private validateHighWater(
    highWater: Awaited<ReturnType<AciKeysetHighWaterAuthorityPort['read']>>,
    context: AciTrustContext,
    snapshot: VerifiedAciTrustSnapshot,
  ): void {
    if (
      highWater === undefined ||
      highWater.trustContext.orgId !== context.orgId ||
      highWater.trustContext.deploymentId !== context.deploymentId ||
      highWater.trustContext.bootEpoch !== context.bootEpoch ||
      highWater.trustContext.checkpointDigest !== context.checkpointDigest ||
      highWater.currentKeysetDigest !== snapshot.keyset.workloadKeysetDigest
    ) {
      throw new PreForwardAdmissionError();
    }
  }

  private validateVerifiedProof(
    input: PreForwardAdmissionInput,
    proof: VerifiedPreForwardRouteProof,
    snapshot: VerifiedAciTrustSnapshot,
    session: VerifiedAciSession,
    channel: MutuallyAttestedChannel,
  ): void {
    const descriptor = input.descriptor;
    const observed = this.observedChannel(channel);
    if (
      !this.matchesExpectedProof(proof, input.expectedProof) ||
      input.expectedProof.orgId !== input.context.orgId ||
      input.expectedProof.deploymentId !== input.context.deploymentId ||
      input.expectedProof.bootEpoch !== input.context.bootEpoch ||
      input.expectedProof.trustedTimeCheckpointDigest !== input.context.checkpointDigest ||
      input.expectedProof.tenantId !== descriptor.tenantId ||
      input.expectedProof.assignmentDigest !== descriptor.assignmentDigest ||
      input.expectedProof.tenantAadDigest !== descriptor.tenantAadDigest ||
      input.expectedProof.capabilityDigest !== descriptor.capabilityDigest ||
      input.expectedProof.role !== descriptor.role ||
      input.expectedProof.sessionId !== descriptor.sessionId ||
      input.expectedProof.model !== descriptor.model ||
      input.expectedProof.modelRevision !== descriptor.modelRevision ||
      input.expectedProof.modelArtifactDigest !== descriptor.modelArtifactDigest ||
      input.expectedProof.policyGeneration !== descriptor.policyGeneration ||
      input.expectedProof.activationGeneration !== descriptor.activationGeneration ||
      input.expectedProof.workloadId !== snapshot.keyset.workloadId ||
      input.expectedProof.workloadKeysetDigest !== snapshot.keyset.workloadKeysetDigest ||
      input.expectedProof.channelKeyDigest !== observed.channelKeyDigest ||
      input.expectedProof.exporterLabel !== observed.exporterLabel ||
      input.expectedProof.exporterDigest !== observed.exporterDigest ||
      input.expectedProof.transcriptDigest !== observed.transcriptDigest ||
      proof.orgId !== input.context.orgId ||
      proof.deploymentId !== input.context.deploymentId ||
      proof.requestId !== input.challenge.requestId ||
      proof.challenge.gatewayNonce !== input.challenge.gatewayNonce ||
      proof.challenge.bootEpoch !== input.context.bootEpoch ||
      proof.tenantContext.tenantId !== descriptor.tenantId ||
      proof.tenantContext.assignmentDigest !== descriptor.assignmentDigest ||
      proof.tenantAadDigest !== descriptor.tenantAadDigest ||
      proof.capabilityDigest !== descriptor.capabilityDigest ||
      proof.role !== descriptor.role ||
      proof.sessionId !== descriptor.sessionId ||
      proof.model !== descriptor.model ||
      proof.modelRevision !== descriptor.modelRevision ||
      proof.modelArtifactDigest !== descriptor.modelArtifactDigest ||
      proof.policyGeneration !== descriptor.policyGeneration ||
      proof.activationGeneration !== descriptor.activationGeneration ||
      proof.issuer.workloadId !== snapshot.keyset.workloadId ||
      proof.issuer.attestedKeysetDigest !== snapshot.keyset.workloadKeysetDigest ||
      proof.workloadKeysetDigest !== snapshot.keyset.workloadKeysetDigest ||
      proof.role !== session.role ||
      proof.sessionId !== session.sessionId ||
      proof.model !== session.model ||
      proof.modelRevision !== session.modelRevision ||
      proof.route.route !== input.request.endpoint ||
      proof.route.method !== input.request.method ||
      proof.route.workloadId !== snapshot.keyset.workloadId ||
      proof.connection.channelKeyDigest !== observed.channelKeyDigest ||
      proof.connection.exporterLabel !== observed.exporterLabel ||
      proof.connection.exporterDigest !== observed.exporterDigest ||
      proof.connection.transcriptDigest !== observed.transcriptDigest ||
      observed.channelKeyDigest !== snapshot.keyset.channelKeyDigest ||
      !this.samePin(observed.observedChannelPin, snapshot.keyset.channelPins) ||
      !this.samePin(observed.observedChannelPin, snapshot.channelPins)
    ) {
      throw new PreForwardAdmissionError();
    }
  }

  private observedChannel(channel: MutuallyAttestedChannel): ObservedAciChannelBinding {
    return {
      observedChannelPin: channel.observedChannelPin,
      channelKeyDigest: channel.channelKeyDigest,
      exporterLabel: channel.exporterLabel,
      exporterDigest: channel.exporterDigest,
      transcriptDigest: channel.transcriptDigest,
    };
  }

  private validateConfirmation(
    commitment: ForwardCommitment,
    confirmation: VerifiedCommitmentConfirmation,
  ): void {
    if (
      confirmation.protocol !== commitment.protocol ||
      confirmation.reservationId !== commitment.reservationId ||
      confirmation.proofId !== commitment.proofId ||
      confirmation.requestId !== commitment.requestId ||
      confirmation.commitmentNonce !== commitment.commitmentNonce ||
      confirmation.commitmentTag !== commitment.commitmentTag ||
      confirmation.channelKeyDigest !== commitment.channelKeyDigest ||
      confirmation.exporterLabel !== commitment.exporterLabel ||
      confirmation.exporterDigest !== commitment.exporterDigest ||
      confirmation.transcriptDigest !== commitment.transcriptDigest ||
      !this.samePin(confirmation.observedChannelPin, [commitment.observedChannelPin]) ||
      !Number.isSafeInteger(confirmation.confirmationSequence) ||
      confirmation.confirmationSequence !== 1
    ) {
      throw new PreForwardAdmissionError();
    }
  }

  private reservationContext(reservation: ForwardProofReservation): AciTrustContext {
    return {
      orgId: reservation.orgId,
      deploymentId: reservation.deploymentId,
      bootEpoch: reservation.bootEpoch,
      checkpointDigest: reservation.trustedTimeCheckpointDigest,
    };
  }

  private matchesExpectedProof(
    proof: VerifiedPreForwardRouteProof,
    expected: PreForwardRouteBinding,
  ): boolean {
    return (
      proof.orgId === expected.orgId &&
      proof.deploymentId === expected.deploymentId &&
      proof.tenantContext.tenantId === expected.tenantId &&
      proof.tenantContext.assignmentDigest === expected.assignmentDigest &&
      proof.proofId === expected.proofId &&
      proof.requestId === expected.requestId &&
      proof.issuer.workloadId === expected.workloadId &&
      proof.issuer.runtimeIdentityDigest === expected.runtimeIdentityDigest &&
      proof.issuer.workloadArtifactDigest === expected.workloadArtifactDigest &&
      proof.issuer.attestedKeysetDigest === expected.workloadKeysetDigest &&
      proof.pinnedTrustRootDigest === expected.pinnedTrustRootDigest &&
      proof.challenge.gatewayNonce === expected.gatewayNonce &&
      proof.challenge.bootEpoch === expected.bootEpoch &&
      proof.connection.channelKeyDigest === expected.channelKeyDigest &&
      proof.connection.exporterLabel === expected.exporterLabel &&
      proof.connection.exporterDigest === expected.exporterDigest &&
      proof.connection.transcriptDigest === expected.transcriptDigest &&
      proof.route.origin === expected.origin &&
      proof.route.route === expected.route &&
      proof.route.method === expected.method &&
      proof.route.routeIdentityDigest === expected.routeIdentityDigest &&
      proof.route.workloadId === expected.workloadId &&
      proof.role === expected.role &&
      proof.sessionId === expected.sessionId &&
      proof.model === expected.model &&
      proof.modelRevision === expected.modelRevision &&
      proof.modelArtifactDigest === expected.modelArtifactDigest &&
      proof.snapshotDigest === expected.snapshotDigest &&
      proof.policyDigest === expected.policyDigest &&
      proof.tenantAadDigest === expected.tenantAadDigest &&
      proof.capabilityDigest === expected.capabilityDigest &&
      proof.workloadKeysetDigest === expected.workloadKeysetDigest &&
      proof.policyGeneration === expected.policyGeneration &&
      proof.activationGeneration === expected.activationGeneration
    );
  }

  private async readAdmissionTime(context: AciTrustContext): Promise<number> {
    const sample = await this.config.trustedTime.read(context);
    if (
      sample.orgId !== context.orgId ||
      sample.deploymentId !== context.deploymentId ||
      sample.bootEpoch !== context.bootEpoch ||
      sample.checkpointDigest !== context.checkpointDigest ||
      !Number.isSafeInteger(sample.trustedNow) ||
      sample.trustedNow <= 0
    ) {
      throw new PreForwardAdmissionError();
    }
    return sample.trustedNow;
  }

  private async abortReservation(
    context: AciTrustContext,
    reservationId: string,
    reason: string,
  ): Promise<void> {
    try {
      await this.config.leaseStore.abort({ context, reservationId, reason });
    } catch {
      return;
    }
  }

  private async releaseProof(proof: VerifiedPreForwardRouteProof): Promise<void> {
    try {
      await this.config.proofVerifier.release(proof);
    } catch {
      return;
    }
  }

  private async closeChannel(channel: MutuallyAttestedChannel): Promise<void> {
    try {
      await channel.close();
    } catch {
      return;
    }
  }

  private samePin(
    pin: VerifiedAciTrustSnapshot['keyset']['channelPins'][number],
    pins: readonly VerifiedAciTrustSnapshot['keyset']['channelPins'][number][],
  ): boolean {
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
}
