// SPDX-License-Identifier: Apache-2.0
import type {
  AciKeysetHighWaterAuthorityPort,
  AciTrustContext,
  AdmittedPreForwardProofDecisionV1,
  CommissionedControlledRouteIdentityV1,
  ControlProofExchangePort,
  ForwardAdmissionCapability,
  ForwardBodyOpenCapability,
  ForwardLeaseStorePort,
  ForwardReservationProvenanceIdentity,
  MutuallyAttestedChannel,
  MutuallyAttestedChannelPort,
  OfficialAciRequest,
  OfficialAciRequestWireSerializerPort,
  PreForwardAdmissionBindingAuthorityPort,
  PreForwardRouteExpectation,
  PreForwardRouteProofVerifierPort,
  PrivateOfficialAciRequestWire,
  TrustedTimeAuthorityPort,
  VerifiedAciSession,
  VerifiedCommitmentConfirmation,
  VerifiedPreForwardRouteProof,
  VerifiedAciTrustSnapshot,
  OfficialAciTrustContextV1,
  ForwardCommitment,
} from '../ports.js';
import {
  consumeForwardBodyOpenCapability,
  issueForwardAdmissionCapability,
  issueForwardBodyOpenCapability,
} from './forward-admission-capability.js';
import {
  assertOfficialAciRequestDescriptor,
  type OfficialAciRequestDescriptorV1,
} from './official-aci-request-descriptor.js';
// The branded active-policy snapshot and its role binding are minted by the policy verifier in a
// private module that the public product mirror excludes, so this shared file declares the identity
// fields it reads structurally instead of importing that module.
type VerifiedActivePolicySnapshotV1 = { readonly configurationGeneration: number };
type VerifiedActivePolicyRoleBindingV1 = object;
type ProductionVerifiedModelProvenanceV1 = {
  readonly proofDigest: string;
  readonly bindingDigest: string;
  readonly descriptorDigest: string;
  readonly routeBindingDigest: string;
  readonly channelRootDigest: string;
  readonly orgId: string;
  readonly deploymentId: string;
  readonly role: PreForwardRouteExpectation['role'];
  readonly modelId: string;
  readonly modelRevision: string;
  readonly verifierKeyId: string;
  readonly tupleDigest: string;
  readonly source: 'controlled-gateway';
};
type ForwardClaimProofInputV1 = {
  readonly expected: {
    readonly expectedPriorState: 'absent';
    readonly epochId: string;
    readonly requestId: string;
    readonly requestDescriptorDigest: AdmittedPreForwardProofDecisionV1['requestDescriptorDigest'];
    readonly expectedPriorSequence: null;
    readonly expectedPriorRecordDigest: null;
    readonly expectedPriorObjectVersionId: null;
    readonly expectedPriorVersionToken: null;
  };
  readonly context: OfficialAciTrustContextV1;
  readonly proofDigest: AdmittedPreForwardProofDecisionV1['proofClaim']['record']['proofDigest'];
  readonly proofExpiresAt: string;
  readonly recordedAt: string;
};
type VersionedForwardState<_S extends 'proof_claimed'> =
  AdmittedPreForwardProofDecisionV1['proofClaim'];
type PreForwardProofClaimJournalPort = {
  claimProof(input: ForwardClaimProofInputV1): Promise<VersionedForwardState<'proof_claimed'>>;
};

export class PreForwardAdmissionError extends Error {
  constructor() {
    super('ACI admission failed');
    this.name = 'PreForwardAdmissionError';
  }
}

export interface PreForwardProofClaimInput {
  readonly descriptor: OfficialAciRequestDescriptorV1;
  readonly encodedProof: Uint8Array;
  readonly expected: PreForwardRouteExpectation;
  readonly snapshot: VerifiedActivePolicySnapshotV1;
  readonly roleBinding: VerifiedActivePolicyRoleBindingV1;
  readonly commissionedRoute: CommissionedControlledRouteIdentityV1;
}

export interface ClaimedPreForwardAdmissionInput {
  readonly admittedProof: AdmittedPreForwardProofDecisionV1;
  readonly provenance: ProductionVerifiedModelProvenanceV1;
  readonly request: Omit<OfficialAciRequest, 'body'>;
  readonly context: AciTrustContext;
  readonly challenge: Parameters<ControlProofExchangePort['exchange']>[0]['challenge'];
  readonly descriptor: OfficialAciRequestDescriptorV1;
}

export interface PreForwardAdmissionServiceConfig {
  readonly trustState: import('../ports.js').AciV2TrustStatePort;
  readonly channelPort: MutuallyAttestedChannelPort;
  readonly controlProofExchange: ControlProofExchangePort;
  readonly proofVerifier: PreForwardRouteProofVerifierPort;
  readonly proofClaimJournal: PreForwardProofClaimJournalPort;
  readonly trustedTime: TrustedTimeAuthorityPort;
  readonly leaseStore: ForwardLeaseStorePort;
  readonly keysetHighWater: AciKeysetHighWaterAuthorityPort;
  readonly requestSerializer: OfficialAciRequestWireSerializerPort;
  readonly bindingAuthority: PreForwardAdmissionBindingAuthorityPort;
}

type ClaimState = {
  readonly proof: VerifiedPreForwardRouteProof;
  readonly expected: PreForwardRouteExpectation;
  readonly snapshot: VerifiedActivePolicySnapshotV1;
  readonly roleBinding: VerifiedActivePolicyRoleBindingV1;
  readonly commissionedRoute: CommissionedControlledRouteIdentityV1;
  readonly claim: VersionedForwardState<'proof_claimed'>;
};

const claims = new WeakMap<object, ClaimState>();
const admittedDecisions = new WeakSet<object>();

export function isServiceMintedAdmittedPreForwardProofDecision(
  value: unknown,
): value is AdmittedPreForwardProofDecisionV1 {
  return typeof value === 'object' && value !== null && admittedDecisions.has(value);
}

export class PreForwardAdmissionService {
  constructor(private readonly config: PreForwardAdmissionServiceConfig) {
    if (
      typeof config?.trustState?.acquireWithTrustedTime !== 'function' ||
      typeof config?.channelPort?.open !== 'function' ||
      typeof config?.controlProofExchange?.exchange !== 'function' ||
      typeof config?.controlProofExchange?.confirmCommitment !== 'function' ||
      typeof config?.proofVerifier?.verify !== 'function' ||
      typeof config?.proofClaimJournal?.claimProof !== 'function' ||
      typeof config?.trustedTime?.read !== 'function' ||
      typeof config?.leaseStore?.reserveFromVerifiedProof !== 'function' ||
      typeof config?.leaseStore?.prepareCommitment !== 'function' ||
      typeof config?.leaseStore?.finalize !== 'function' ||
      typeof config?.leaseStore?.writeOnce !== 'function' ||
      typeof config?.leaseStore?.abort !== 'function' ||
      typeof config?.keysetHighWater?.read !== 'function' ||
      typeof config?.requestSerializer?.serialize !== 'function' ||
      typeof config?.bindingAuthority?.digestProof !== 'function' ||
      typeof config?.bindingAuthority?.createBinding !== 'function' ||
      typeof config?.bindingAuthority?.digest64FromSha256Digest !== 'function' ||
      typeof config?.bindingAuthority?.sha256DigestFromDigest64 !== 'function' ||
      typeof config?.bindingAuthority?.parseDigest64 !== 'function' ||
      typeof config?.bindingAuthority?.isCommissionedRoute !== 'function' ||
      typeof config?.bindingAuthority?.isProductionProvenance !== 'function'
    ) {
      throw new PreForwardAdmissionError();
    }
  }

  async claimProof(input: PreForwardProofClaimInput): Promise<AdmittedPreForwardProofDecisionV1> {
    const descriptor = Object.freeze({ ...input.descriptor });
    const expected = Object.freeze({ ...input.expected });
    const encodedProof = Uint8Array.from(input.encodedProof);
    const snapshot = Object.freeze(input.snapshot);
    const roleBinding = Object.freeze(input.roleBinding);
    const commissionedRoute = Object.freeze(input.commissionedRoute);
    let proof: VerifiedPreForwardRouteProof;
    try {
      assertOfficialAciRequestDescriptor(descriptor);
      proof = await this.config.proofVerifier.verify({
        encodedProof,
        expected,
      });
      this.assertCommissionedRoute(commissionedRoute);
      this.assertDescriptorMatchesProof(descriptor, expected, proof, commissionedRoute, snapshot);
      const proofDigest = this.config.bindingAuthority.digestProof(proof);
      const binding = this.config.bindingAuthority.createBinding({
        expected,
        proof,
        proofDigest,
      });
      const trustContext: AciTrustContext = Object.freeze({
        orgId: expected.orgId,
        deploymentId: expected.deploymentId,
        bootEpoch: expected.bootEpoch,
        checkpointDigest: this.config.bindingAuthority.parseDigest64(
          expected.trustedTimeCheckpointDigest,
        ),
      });
      const context: OfficialAciTrustContextV1 = {
        schema: 'OfficialAciTrustContextV1',
        version: 1,
        ...trustContext,
      };
      // `keysetVersion` is hashed into `descriptorDigest`, so the claim mints a durable request
      // identity that names a keyset version. The durable high-water for this trust context must
      // attest it before the claim is journaled, not only before the body is opened, or the
      // identity would name a keyset no authority attested. Admission re-reads the high-water and
      // the verified keyset and re-checks the descriptor against both.
      const highWater = await this.config.keysetHighWater.read(trustContext);
      if (highWater === undefined || descriptor.keysetVersion !== highWater.keysetVersion) {
        throw new PreForwardAdmissionError();
      }
      // The durable proof claim is stamped from the injected trusted-time authority for the same
      // trust context, so claim ordering and later evidence never follow the host clock.
      const recordedAt = new Date(await this.readAdmissionTime(context)).toISOString();
      const claimInput: ForwardClaimProofInputV1 = {
        expected: {
          expectedPriorState: 'absent',
          epochId: expected.bootEpoch,
          requestId: expected.requestId,
          requestDescriptorDigest: descriptor.descriptorDigest,
          expectedPriorSequence: null,
          expectedPriorRecordDigest: null,
          expectedPriorObjectVersionId: null,
          expectedPriorVersionToken: null,
        },
        context,
        proofDigest,
        proofExpiresAt: new Date(proof.expiresAt).toISOString(),
        recordedAt,
      };
      const proofClaim = await this.config.proofClaimJournal.claimProof(claimInput);
      this.assertProofClaim(proofClaim, claimInput);
      const frozenProofClaim = Object.freeze({
        ...proofClaim,
        record: Object.freeze({
          ...proofClaim.record,
          context: Object.freeze({ ...proofClaim.record.context }),
        }),
      });
      const decision = Object.freeze({
        schema: 'AdmittedPreForwardProofDecisionV1' as const,
        requestId: expected.requestId,
        requestDescriptorDigest: descriptor.descriptorDigest,
        binding: Object.freeze(binding),
        proofClaim: frozenProofClaim,
        proofDigest: this.config.bindingAuthority.digest64FromSha256Digest(proofDigest),
      });
      claims.set(decision, {
        proof,
        expected,
        snapshot,
        roleBinding,
        commissionedRoute,
        claim: frozenProofClaim,
      });
      admittedDecisions.add(decision);
      return decision;
    } catch {
      throw new PreForwardAdmissionError();
    }
  }

  async admitClaimed(input: ClaimedPreForwardAdmissionInput): Promise<ForwardBodyOpenCapability> {
    const admittedProof = Object.freeze(input.admittedProof);
    const provenanceSource = input.provenance;
    const request = Object.freeze({ ...input.request });
    const context = Object.freeze({ ...input.context });
    const provenance = Object.freeze({ ...provenanceSource });
    const challenge = Object.freeze({ ...input.challenge });
    const descriptor = Object.freeze({ ...input.descriptor });
    const provenanceIsProduction =
      this.config.bindingAuthority.isProductionProvenance(provenanceSource);
    const state = this.claimState(admittedProof);
    if (
      state.claim !== admittedProof.proofClaim ||
      !this.config.bindingAuthority.isCommissionedRoute(state.commissionedRoute) ||
      !provenanceIsProduction ||
      admittedProof.requestId !== challenge.requestId ||
      admittedProof.requestDescriptorDigest !== descriptor.descriptorDigest ||
      request.role !== state.expected.role ||
      request.endpoint !== state.expected.route ||
      request.method !== state.expected.method ||
      state.expected.requestId !== challenge.requestId ||
      state.expected.orgId !== context.orgId ||
      state.expected.deploymentId !== context.deploymentId ||
      state.expected.bootEpoch !== context.bootEpoch ||
      state.expected.trustedTimeCheckpointDigest !== context.checkpointDigest ||
      provenance.proofDigest !== admittedProof.proofDigest ||
      provenance.bindingDigest !== admittedProof.binding.bindingDigest ||
      provenance.descriptorDigest !== admittedProof.requestDescriptorDigest ||
      provenance.orgId !== state.expected.orgId ||
      provenance.deploymentId !== state.expected.deploymentId ||
      provenance.role !== state.expected.role ||
      provenance.modelId !== state.expected.model ||
      provenance.modelRevision !== state.expected.modelRevision ||
      provenance.verifierKeyId !== state.commissionedRoute.verifierKeyId ||
      provenance.routeBindingDigest !==
        this.config.bindingAuthority.sha256DigestFromDigest64(
          admittedProof.binding.bindingDigest,
        ) ||
      provenance.channelRootDigest !== descriptor.channelRootDigest
    ) {
      throw new PreForwardAdmissionError();
    }
    claims.delete(admittedProof);
    let channel: MutuallyAttestedChannel | undefined;
    let reservation:
      | Awaited<ReturnType<ForwardLeaseStorePort['reserveFromVerifiedProof']>>
      | undefined;
    try {
      const snapshot = await this.config.trustState.acquireWithTrustedTime(context);
      if (snapshot === undefined) throw new PreForwardAdmissionError();
      const highWater = await this.config.keysetHighWater.read(context);
      this.validateHighWater(highWater, context, snapshot);
      this.assertDescriptorKeysetVersion(descriptor, snapshot, highWater);
      channel = await this.config.channelPort.open({
        orgId: context.orgId,
        deploymentId: context.deploymentId,
        workloadId: snapshot.keyset.workloadId,
        routeIdentityDigest: state.expected.routeIdentityDigest,
        pinnedTrustRootDigest: state.expected.pinnedTrustRootDigest,
        channelKeyDigest: snapshot.keyset.channelKeyDigest,
        sessionId: state.proof.sessionId,
        channelPins: snapshot.channelPins,
        exporterLabel: state.expected.exporterLabel,
        exporterDigest: state.expected.exporterDigest,
        transcriptDigest: state.expected.transcriptDigest,
      });
      const trustedNow = await this.readAdmissionTime(context);
      reservation = await this.config.leaseStore.reserveFromVerifiedProof({
        context,
        snapshot,
        session: this.requireSession(snapshot, request.role),
        observedChannel: this.observedChannel(channel),
        proof: state.proof,
        provenance: this.provenanceIdentity(provenance),
        trustedNow,
      });
      return issueForwardBodyOpenCapability({
        channel,
        reservation,
        snapshot,
        session: this.requireSession(snapshot, request.role),
        request,
      });
    } catch {
      if (reservation !== undefined) {
        await this.abortReservation(context, reservation.reservationId, 'admission_failed');
      }
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
      const commitment = await this.config.leaseStore.prepareCommitment({
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

  private assertProofClaim(
    claim: VersionedForwardState<'proof_claimed'>,
    input: ForwardClaimProofInputV1,
  ): void {
    if (
      claim.record.state !== 'proof_claimed' ||
      claim.record.requestId !== input.expected.requestId ||
      claim.record.requestDescriptorDigest !== input.expected.requestDescriptorDigest ||
      claim.record.proofDigest !== input.proofDigest ||
      claim.record.previousRecordDigest !== null ||
      claim.record.previousObjectVersionId !== null
    ) {
      throw new PreForwardAdmissionError();
    }
  }

  private assertCommissionedRoute(
    route: unknown,
  ): asserts route is CommissionedControlledRouteIdentityV1 {
    if (!this.config.bindingAuthority.isCommissionedRoute(route)) {
      throw new PreForwardAdmissionError();
    }
  }

  private assertDescriptorMatchesProof(
    descriptor: OfficialAciRequestDescriptorV1,
    expected: PreForwardRouteExpectation,
    proof: VerifiedPreForwardRouteProof,
    commissionedRoute: CommissionedControlledRouteIdentityV1,
    activePolicySnapshot: VerifiedActivePolicySnapshotV1,
  ): void {
    // Every field hashed into `descriptorDigest` must equal the authority that authorizes this
    // request, never only the caller's own copy of it: the verified proof, the caller's
    // proof-verified expectation, the branded commissioned route, or the branded verified policy
    // snapshot. A descriptor that names a different checkpoint, configuration generation, or
    // verification key than the proof is a different request identity and is rejected here.
    // The assignment dimension is carried as the digest the control plane signs into the proof's
    // tenant context; no caller-supplied assignment or route identifier is hashed into the
    // preimage, because neither has an authority to compare against.
    if (
      descriptor.orgId !== expected.orgId ||
      descriptor.deploymentId !== expected.deploymentId ||
      descriptor.assignmentDigest !==
        this.config.bindingAuthority.sha256DigestFromDigest64(
          proof.tenantContext.assignmentDigest,
        ) ||
      descriptor.requestId !== expected.requestId ||
      descriptor.bootEpoch !== expected.bootEpoch ||
      descriptor.role !== proof.role ||
      descriptor.modelId !== proof.model ||
      descriptor.modelRevision !== proof.modelRevision ||
      descriptor.routeIdentityDigest !==
        this.config.bindingAuthority.sha256DigestFromDigest64(proof.route.routeIdentityDigest) ||
      descriptor.modelArtifactDigest !==
        this.config.bindingAuthority.sha256DigestFromDigest64(proof.modelArtifactDigest) ||
      descriptor.activePolicyDigest !==
        this.config.bindingAuthority.sha256DigestFromDigest64(proof.policyDigest) ||
      descriptor.policyGeneration !== proof.policyGeneration ||
      descriptor.activationGeneration !== proof.activationGeneration ||
      descriptor.sessionId !== proof.sessionId ||
      descriptor.channelRootDigest !== commissionedRoute.channelRootDigest ||
      descriptor.trustedTimeCheckpointDigest !==
        this.config.bindingAuthority.sha256DigestFromDigest64(
          expected.trustedTimeCheckpointDigest,
        ) ||
      descriptor.configurationGeneration !== activePolicySnapshot.configurationGeneration ||
      commissionedRoute.verifierKeyId !== proof.issuer.keyId ||
      proof.orgId !== expected.orgId ||
      proof.deploymentId !== expected.deploymentId ||
      proof.requestId !== expected.requestId ||
      proof.role !== expected.role ||
      proof.route.origin !== expected.origin ||
      proof.route.route !== expected.route ||
      proof.route.method !== expected.method ||
      proof.route.routeIdentityDigest !== expected.routeIdentityDigest ||
      proof.challenge.gatewayNonce !== expected.gatewayNonce ||
      proof.challenge.bootEpoch !== expected.bootEpoch
    ) {
      throw new PreForwardAdmissionError();
    }
  }

  private assertDescriptorKeysetVersion(
    descriptor: OfficialAciRequestDescriptorV1,
    snapshot: VerifiedAciTrustSnapshot,
    highWater: Awaited<ReturnType<AciKeysetHighWaterAuthorityPort['read']>>,
  ): void {
    // The request's keyset version must be the version of the verified keyset the channel and
    // session are bound to and of the durable high-water the same digest is checked against.
    if (
      highWater === undefined ||
      snapshot.keyset.version !== highWater.keysetVersion ||
      descriptor.keysetVersion !== snapshot.keyset.version
    ) {
      throw new PreForwardAdmissionError();
    }
  }

  private claimState(decision: AdmittedPreForwardProofDecisionV1): ClaimState {
    if (typeof decision !== 'object' || decision === null) throw new PreForwardAdmissionError();
    const state = claims.get(decision);
    if (state === undefined) throw new PreForwardAdmissionError();
    return state;
  }

  private requireSession(
    snapshot: VerifiedAciTrustSnapshot,
    role: VerifiedAciSession['role'],
  ): VerifiedAciSession {
    const session = snapshot.sessions[role];
    if (session === undefined) throw new PreForwardAdmissionError();
    return session;
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
    )
      throw new PreForwardAdmissionError();
  }

  private async readAdmissionTime(context: AciTrustContext): Promise<number> {
    const sample = await this.config.trustedTime.read({
      orgId: context.orgId,
      deploymentId: context.deploymentId,
      bootEpoch: context.bootEpoch,
      checkpointDigest: context.checkpointDigest,
    });
    if (
      sample.orgId !== context.orgId ||
      sample.deploymentId !== context.deploymentId ||
      sample.bootEpoch !== context.bootEpoch ||
      sample.checkpointDigest !== context.checkpointDigest
    )
      throw new PreForwardAdmissionError();
    return sample.trustedNow;
  }

  private observedChannel(channel: MutuallyAttestedChannel) {
    return {
      observedChannelPin: channel.observedChannelPin,
      channelKeyDigest: channel.channelKeyDigest,
      exporterLabel: channel.exporterLabel,
      exporterDigest: channel.exporterDigest,
      transcriptDigest: channel.transcriptDigest,
    };
  }

  private provenanceIdentity(
    provenance: ClaimedPreForwardAdmissionInput['provenance'],
  ): ForwardReservationProvenanceIdentity {
    return {
      tupleDigest: provenance.tupleDigest,
      proofDigest: provenance.proofDigest,
      bindingDigest: provenance.bindingDigest,
      source: provenance.source,
    };
  }

  private reservationContext(reservation: {
    readonly orgId: string;
    readonly deploymentId: string;
    readonly bootEpoch: string;
    readonly trustedTimeCheckpointDigest: string;
  }): AciTrustContext {
    return {
      orgId: reservation.orgId,
      deploymentId: reservation.deploymentId,
      bootEpoch: reservation.bootEpoch,
      checkpointDigest: reservation.trustedTimeCheckpointDigest,
    };
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

  private async closeChannel(channel: MutuallyAttestedChannel): Promise<void> {
    try {
      await channel.close();
    } catch {
      return;
    }
  }

  private validateConfirmation(
    commitment: ForwardCommitment,
    confirmation: VerifiedCommitmentConfirmation,
  ): void {
    if (
      confirmation.protocol !== commitment.protocol ||
      confirmation.reservationId !== commitment.reservationId ||
      confirmation.requestId !== commitment.requestId ||
      confirmation.commitmentNonce !== commitment.commitmentNonce ||
      confirmation.commitmentTag !== commitment.commitmentTag
    ) {
      throw new PreForwardAdmissionError();
    }
  }
}
