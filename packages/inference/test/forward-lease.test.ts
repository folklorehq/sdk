// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { DurableForwardReplayAuthority } from '../src/aci/DurableForwardReplayAuthority.js';
import { ForwardCommitmentAuthenticator } from '../src/aci/ForwardCommitmentAuthenticator.js';
import { ForwardLeaseStore, ForwardLeaseStoreError } from '../src/aci/ForwardLeaseStore.js';
import type {
  AciTrustContext,
  ForwardProofReservation,
  ForwardReplayJournalEntry,
  ForwardReplayJournalPort,
  ForwardReservationProvenanceIdentity,
  MutuallyAttestedChannel,
  PrivateOfficialAciRequestWire,
  TrustedTimeAuthorityPort,
  VerifiedAciSession,
  VerifiedAciTrustSnapshot,
  VerifiedCommitmentConfirmation,
  VerifiedPreForwardRouteProof,
} from '../src/ports.js';
import { InMemoryForwardReplayAuthority } from './doubles/aci/InMemoryAciStores.js';

const CONTEXT: AciTrustContext = {
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  bootEpoch: 'boot-1',
  checkpointDigest: 'checkpoint-1',
};
const NOW = 1_750_000_150;
const PIN = { type: 'tls_spki_sha256' as const, value: 'pin-1', domain: 'inference.example' };
const PROVENANCE: ForwardReservationProvenanceIdentity = {
  tupleDigest: 'a'.repeat(64),
  proofDigest: 'b'.repeat(64),
  bindingDigest: 'c'.repeat(64),
  source: 'controlled-gateway',
};
const CHANNEL = {
  channelKeyDigest: 'channel-key-1',
  exporterLabel: 'EXPORTER-ACI-CHANNEL',
  exporterDigest: 'exporter-1',
  transcriptDigest: 'transcript-1',
  observedChannelPin: PIN,
};

const SESSION: VerifiedAciSession = {
  role: 'generate',
  model: 'provider/model-1',
  modelRevision: 'revision-1',
  sessionId: 'session-1',
  establishedAt: NOW - 10,
  expiresAt: NOW + 100,
  workloadKeysetDigest: 'keyset-1',
  channelKeyDigest: CHANNEL.channelKeyDigest,
  channelPins: [PIN],
  upstreamIdentityDigest: 'upstream-1',
  upstreamIdentity: {
    upstreamName: 'inference',
    urlOrigin: 'https://inference.example',
    verifierId: 'verifier-1',
    claims: {},
  },
};

const SNAPSHOT: VerifiedAciTrustSnapshot = {
  trustContext: CONTEXT,
  generation: 1,
  policyGeneration: 7,
  activationGeneration: 3,
  expiresAt: NOW + 100,
  keyset: {
    workloadId: 'workload-1',
    workloadKeysetDigest: 'keyset-1',
    version: 1,
    notAfter: NOW + 100,
    receiptSigningKeys: [],
    e2eePublicKeys: [],
    tlsPublicKeys: [],
    channelPins: [PIN],
    channelKeyDigest: CHANNEL.channelKeyDigest,
  },
  channelPins: [PIN],
  sessions: {
    embed: SESSION,
    generate: SESSION,
    critique: SESSION,
    judge: SESSION,
  },
  supersededKeysetDigests: [],
};

const PROOF: VerifiedPreForwardRouteProof = {
  proofVersion: 1,
  proofId: 'proof-1',
  requestId: 'request-1',
  orgId: CONTEXT.orgId,
  deploymentId: CONTEXT.deploymentId,
  tenantContext: { tenantId: 'tenant-1', assignmentDigest: 'assignment-1' },
  issuer: {
    workloadId: SNAPSHOT.keyset.workloadId,
    runtimeIdentityDigest: 'runtime-1',
    workloadArtifactDigest: 'artifact-1',
    keyId: 'issuer-1',
    attestedKeysetDigest: SNAPSHOT.keyset.workloadKeysetDigest,
  },
  pinnedTrustRootDigest: 'root-1',
  auth: { algorithm: 'Ed25519', signature: 'signature' },
  challenge: { gatewayNonce: 'gateway-1', bootEpoch: CONTEXT.bootEpoch },
  connection: CHANNEL,
  route: {
    origin: 'https://inference.example',
    route: '/v1/chat/completions',
    method: 'POST',
    routeIdentityDigest: 'route-1',
    workloadId: SNAPSHOT.keyset.workloadId,
  },
  role: SESSION.role,
  sessionId: SESSION.sessionId,
  model: SESSION.model,
  modelRevision: SESSION.modelRevision,
  modelArtifactDigest: 'model-artifact-1',
  snapshotDigest: 'snapshot-1',
  policyDigest: 'policy-1',
  tenantAadDigest: 'aad-1',
  capabilityDigest: 'capability-1',
  workloadKeysetDigest: SNAPSHOT.keyset.workloadKeysetDigest,
  policyGeneration: SNAPSHOT.policyGeneration,
  activationGeneration: SNAPSHOT.activationGeneration,
  issuedAt: NOW - 10,
  expiresAt: NOW + 50,
};

const TRUSTED_TIME: TrustedTimeAuthorityPort = {
  read: async () => ({
    trustedNow: NOW,
    checkpointDigest: CONTEXT.checkpointDigest,
    bootEpoch: CONTEXT.bootEpoch,
    orgId: CONTEXT.orgId,
    deploymentId: CONTEXT.deploymentId,
  }),
};

class PersistentForwardReplayJournal implements ForwardReplayJournalPort {
  readonly entries: ForwardReplayJournalEntry[] = [];
  private writeArmedEnteredResolve: (() => void) | undefined;
  private writeArmedRelease: (() => void) | undefined;
  readonly writeArmedEntered = new Promise<void>((resolve) => {
    this.writeArmedEnteredResolve = resolve;
  });

  releaseWriteArmed(): void {
    this.writeArmedRelease?.();
    this.writeArmedRelease = undefined;
  }

  async load(input: { readonly orgId: string; readonly deploymentId: string }) {
    const entries = this.entries.filter(
      (entry) =>
        entry.scope.orgId === input.orgId && entry.scope.deploymentId === input.deploymentId,
    );
    return {
      sequence: entries.at(-1)?.sequence ?? 0,
      tailTag: entries.at(-1)?.entryTag ?? '',
      entries: structuredClone(entries),
    };
  }

  async append(input: {
    readonly orgId: string;
    readonly deploymentId: string;
    readonly expectedSequence: number;
    readonly expectedTailTag: string;
    readonly entry: ForwardReplayJournalEntry;
  }) {
    if (input.entry.state === 'write_armed' && this.writeArmedEnteredResolve !== undefined) {
      this.writeArmedEnteredResolve();
      this.writeArmedEnteredResolve = undefined;
      await new Promise<void>((resolve) => {
        this.writeArmedRelease = resolve;
      });
    }
    const current = await this.load(input);
    if (
      current.sequence !== input.expectedSequence ||
      current.tailTag !== input.expectedTailTag ||
      input.entry.scope.orgId !== input.orgId ||
      input.entry.scope.deploymentId !== input.deploymentId
    ) {
      throw new Error('journal_cas');
    }
    this.entries.push(structuredClone(input.entry));
    return {
      sequence: input.entry.sequence,
      tailTag: input.entry.entryTag,
      entries: structuredClone(this.entries),
    };
  }
}

function durableAuthority(
  journal: PersistentForwardReplayJournal,
  capacity = 4_096,
): DurableForwardReplayAuthority {
  return new DurableForwardReplayAuthority({
    journal,
    commitmentAuthenticator: new ForwardCommitmentAuthenticator(new Uint8Array(32).fill(7)),
    writeBoundary: { isTrustedTimeBound: true, assertValid: () => undefined },
    capacity,
  });
}

function wire(bytes = Uint8Array.from([1, 2, 3])): PrivateOfficialAciRequestWire {
  return {
    bytes,
    requestWireSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    byteLength: bytes.byteLength,
  };
}

function reservationInput(proof: VerifiedPreForwardRouteProof = PROOF) {
  return {
    context: CONTEXT,
    snapshot: SNAPSHOT,
    session: SESSION,
    observedChannel: CHANNEL,
    proof,
    provenance: PROVENANCE,
    trustedNow: NOW,
  };
}

async function preparedReservation(authority = new InMemoryForwardReplayAuthority()) {
  await authority.claimProof({
    orgId: PROOF.orgId,
    deploymentId: PROOF.deploymentId,
    bootEpoch: PROOF.challenge.bootEpoch,
    proofId: PROOF.proofId,
    requestId: PROOF.requestId,
    expiresAt: PROOF.expiresAt,
  });
  const store = new ForwardLeaseStore({ durableState: authority });
  const reservation = await store.reserveFromVerifiedProof(reservationInput());
  const requestWire = wire();
  const prepared = await store.prepareCommitment({ reservation, requestWire });
  const confirmation = { ...prepared, confirmationSequence: 1 };
  return { authority, store, reservation, requestWire, confirmation };
}

async function preparedLease(authority = new InMemoryForwardReplayAuthority()) {
  const prepared = await preparedReservation(authority);
  const { store, reservation, requestWire, confirmation } = prepared;
  const lease = await store.finalize({ reservation, requestWire, confirmation });
  return { ...prepared, lease };
}

function channel(responseBytes = Uint8Array.from([8])): MutuallyAttestedChannel {
  return {
    ...CHANNEL,
    sendControl: async () => undefined,
    receiveControlProof: async () => Uint8Array.from([1]),
    writeBodyOnce: ({ bytes, permit }) => {
      expect(bytes).toEqual(Uint8Array.from([1, 2, 3]));
      expect(permit.leaseId).not.toBe('');
      permit.assertWriteStart();
      return {
        response: Promise.resolve({ receiptId: 'receipt-1', responseBytes, responseOk: true }),
      };
    },
    close: async () => undefined,
  };
}

describe('ForwardLeaseStore', () => {
  it('constructs every reservation field from verified proof and trusted bindings', async () => {
    const authority = new InMemoryForwardReplayAuthority();
    await authority.claimProof({
      orgId: PROOF.orgId,
      deploymentId: PROOF.deploymentId,
      bootEpoch: PROOF.challenge.bootEpoch,
      proofId: PROOF.proofId,
      requestId: PROOF.requestId,
      expiresAt: PROOF.expiresAt,
    });
    const store = new ForwardLeaseStore({ durableState: authority });
    const result = await store.reserveFromVerifiedProof({
      ...reservationInput(),
    });

    expect(result).toMatchObject({
      orgId: CONTEXT.orgId,
      deploymentId: CONTEXT.deploymentId,
      tenantId: PROOF.tenantContext.tenantId,
      assignmentDigest: PROOF.tenantContext.assignmentDigest,
      workloadId: PROOF.issuer.workloadId,
      runtimeIdentityDigest: PROOF.issuer.runtimeIdentityDigest,
      workloadArtifactDigest: PROOF.issuer.workloadArtifactDigest,
      pinnedTrustRootDigest: PROOF.pinnedTrustRootDigest,
      workloadKeysetDigest: PROOF.workloadKeysetDigest,
      tenantAadDigest: PROOF.tenantAadDigest,
      bootEpoch: CONTEXT.bootEpoch,
      trustedTimeCheckpointDigest: CONTEXT.checkpointDigest,
      gatewayNonce: PROOF.challenge.gatewayNonce,
      proofId: PROOF.proofId,
      requestId: PROOF.requestId,
      snapshotDigest: PROOF.snapshotDigest,
      policyDigest: PROOF.policyDigest,
      role: PROOF.role,
      sessionId: PROOF.sessionId,
      model: PROOF.model,
      modelRevision: PROOF.modelRevision,
      modelArtifactDigest: PROOF.modelArtifactDigest,
      capabilityDigest: PROOF.capabilityDigest,
      origin: PROOF.route.origin,
      route: PROOF.route.route,
      method: PROOF.route.method,
      routeIdentityDigest: PROOF.route.routeIdentityDigest,
      channelKeyDigest: CHANNEL.channelKeyDigest,
      exporterLabel: CHANNEL.exporterLabel,
      exporterDigest: CHANNEL.exporterDigest,
      transcriptDigest: CHANNEL.transcriptDigest,
      policyGeneration: PROOF.policyGeneration,
      activationGeneration: PROOF.activationGeneration,
      proofIssuedAt: PROOF.issuedAt,
      proofExpiresAt: PROOF.expiresAt,
      snapshotExpiresAt: SNAPSHOT.expiresAt,
      observedChannelPin: PIN,
      tupleDigest: PROVENANCE.tupleDigest,
      proofDigest: PROVENANCE.proofDigest,
      bindingDigest: PROVENANCE.bindingDigest,
      source: PROVENANCE.source,
    });
  });

  it('rejects a malformed or zero provenance identity at reservation', async () => {
    const authority = new InMemoryForwardReplayAuthority();
    await authority.claimProof({
      orgId: PROOF.orgId,
      deploymentId: PROOF.deploymentId,
      bootEpoch: PROOF.challenge.bootEpoch,
      proofId: PROOF.proofId,
      requestId: PROOF.requestId,
      expiresAt: PROOF.expiresAt,
    });
    const store = new ForwardLeaseStore({ durableState: authority });
    const malformed: Array<Partial<ForwardReservationProvenanceIdentity>> = [
      { tupleDigest: 'not-a-digest' },
      { tupleDigest: '0'.repeat(64) },
      { proofDigest: '1'.repeat(63) },
      { proofDigest: null as never },
      { bindingDigest: '0'.repeat(64) },
      { source: 'other' as never },
    ];
    for (const override of malformed) {
      await expect(
        store.reserveFromVerifiedProof({
          ...reservationInput(),
          provenance: { ...PROVENANCE, ...override },
        }),
      ).rejects.toMatchObject({ code: 'lease_invalid' });
    }
  });

  it('rejects a mutation of any committed provenance field before finalize and consume', async () => {
    const mutations: Array<Partial<ForwardProofReservation>> = [
      { tupleDigest: '1'.repeat(64) },
      { proofDigest: '1'.repeat(64) },
      { bindingDigest: '1'.repeat(64) },
      { source: 'provider-native' },
    ];
    for (const mutation of mutations) {
      const { store, reservation, requestWire, confirmation } = await preparedReservation();
      await expect(
        store.finalize({ reservation: { ...reservation, ...mutation }, requestWire, confirmation }),
      ).rejects.toMatchObject({ code: 'lease_binding_mismatch' });

      const leased = await preparedLease();
      const writeBodyOnce = vi.fn();
      await expect(
        leased.store.writeOnce({
          lease: { ...leased.lease, ...mutation },
          confirmation: leased.confirmation,
          trustedTime: TRUSTED_TIME,
          channel: { ...channel(), writeBodyOnce },
          requestWire: wire(),
        }),
      ).rejects.toMatchObject({ code: 'lease_binding_mismatch' });
      expect(writeBodyOnce).not.toHaveBeenCalled();
    }
  });

  it('requires a durable authority and fails closed when it is unavailable', async () => {
    expect(() => new ForwardLeaseStore()).toThrowError('durable_state_required');
    const durable = {
      claimProof: async () => undefined,
      releaseProof: async () => undefined,
      reserve: async () => {
        throw new Error('unavailable');
      },
      finalize: async () => {
        throw new Error('unavailable');
      },
      consumeForWrite: async () => {
        throw new Error('unavailable');
      },
      prepareCommitment: async () => {
        throw new Error('unavailable');
      },
      abort: async () => undefined,
      recoverAfterRestart: async () => undefined,
      cleanup: async () => undefined,
    } satisfies import('../src/ports.js').ForwardReplayAuthorityPort;
    const store = new ForwardLeaseStore({ durableState: durable });
    await expect(store.reserveFromVerifiedProof(reservationInput())).rejects.toMatchObject({
      code: 'durable_state_unavailable',
    });
  });

  it('terminalizes reservations after failed commitment preparation and finalization', async () => {
    const authority = new InMemoryForwardReplayAuthority();
    await authority.claimProof({
      orgId: PROOF.orgId,
      deploymentId: PROOF.deploymentId,
      bootEpoch: PROOF.challenge.bootEpoch,
      proofId: PROOF.proofId,
      requestId: PROOF.requestId,
      expiresAt: PROOF.expiresAt,
    });
    const store = new ForwardLeaseStore({ durableState: authority });
    const reservation = await store.reserveFromVerifiedProof(reservationInput());
    const invalidWire = { ...wire(), requestWireSha256: 'sha256:invalid' };

    await expect(
      store.prepareCommitment({ reservation, requestWire: invalidWire }),
    ).rejects.toMatchObject({
      code: 'request_wire_mismatch',
    });
    expect(invalidWire.bytes).toEqual(new Uint8Array(3));
    await expect(
      store.prepareCommitment({ reservation, requestWire: wire() }),
    ).rejects.toMatchObject({ code: 'lease_invalid' });

    const prepared = await preparedReservation();
    const failedWire = wire();
    await expect(
      prepared.store.finalize({
        reservation: prepared.reservation,
        requestWire: failedWire,
        confirmation: { ...prepared.confirmation, commitmentTag: 'foreign-commitment' },
      }),
    ).rejects.toMatchObject({ code: 'commitment_mismatch' });
    expect(failedWire.bytes).toEqual(new Uint8Array(3));
    await expect(
      prepared.store.finalize({
        reservation: prepared.reservation,
        requestWire: wire(),
        confirmation: prepared.confirmation,
      }),
    ).rejects.toMatchObject({ code: 'lease_invalid' });
  });

  it('keeps request body, hash, and length out of the durable journal', async () => {
    const journal = new PersistentForwardReplayJournal();
    const authority = durableAuthority(journal);
    await authority.claimProof({
      orgId: PROOF.orgId,
      deploymentId: PROOF.deploymentId,
      bootEpoch: PROOF.challenge.bootEpoch,
      proofId: PROOF.proofId,
      requestId: PROOF.requestId,
      expiresAt: PROOF.expiresAt,
    });
    const store = new ForwardLeaseStore({ durableState: authority });
    const reservation = await store.reserveFromVerifiedProof(reservationInput());
    const requestWire = wire(Uint8Array.from([7, 8, 9]));
    const commitment = await store.prepareCommitment({ reservation, requestWire });
    await store.finalize({
      reservation,
      requestWire,
      confirmation: { ...commitment, confirmationSequence: 1 },
    });

    const serialized = JSON.stringify(journal.entries);
    expect(serialized).not.toContain(requestWire.requestWireSha256);
    expect(serialized).not.toContain('"bytes"');
    expect(serialized).not.toContain('"byteLength"');
    expect(serialized).not.toContain('"wireByteLength"');
  });

  it('recomputes exact hash and byte length before durable finalization', async () => {
    const first = await preparedReservation();

    const wrongLength = wire(Uint8Array.from([1, 2]));
    await expect(
      first.store.finalize({
        reservation: first.reservation,
        requestWire: wrongLength,
        confirmation: first.confirmation,
      }),
    ).rejects.toMatchObject({ code: 'commitment_mismatch' });
    expect(wrongLength.bytes).toEqual(new Uint8Array(2));

    const second = await preparedReservation();
    const alternate = wire(Uint8Array.from([9, 8, 7]));
    await expect(
      second.store.finalize({
        reservation: second.reservation,
        requestWire: alternate,
        confirmation: second.confirmation,
      }),
    ).rejects.toMatchObject({ code: 'commitment_mismatch' });
    expect(alternate.bytes).toEqual(new Uint8Array(3));
  });

  it('rejects confirmation substitutions for wire, reservation, and observed channel bindings', async () => {
    const substitutions: Array<Partial<VerifiedCommitmentConfirmation>> = [
      { reservationId: 'foreign-reservation' },
      { proofId: 'foreign-proof' },
      { requestId: 'foreign-request' },
      { commitmentNonce: 'foreign-nonce' },
      { commitmentTag: 'foreign-commitment' },
      { channelKeyDigest: 'foreign-channel' },
      { exporterLabel: 'foreign-exporter' },
      { exporterDigest: 'foreign-exporter-digest' },
      { transcriptDigest: 'foreign-transcript' },
      { observedChannelPin: { ...PIN, value: 'foreign-pin' } },
      { confirmationSequence: 0 },
      { confirmationSequence: 2 },
    ];

    for (const substitution of substitutions) {
      const {
        store,
        reservation,
        confirmation: preparedConfirmation,
      } = await preparedReservation();
      const requestWire = wire();
      await expect(
        store.finalize({
          reservation,
          requestWire,
          confirmation: { ...preparedConfirmation, ...substitution },
        }),
      ).rejects.toMatchObject({ code: 'commitment_mismatch' });
      expect(requestWire.bytes).toEqual(new Uint8Array(3));
    }
  });

  it('uses one durable terminal transition for write and erases the lease wire', async () => {
    const { store, lease, confirmation } = await preparedLease();
    const requestWire = wire();
    const response = await store.writeOnce({
      lease,
      confirmation,
      trustedTime: TRUSTED_TIME,
      channel: channel(),
      requestWire,
    });

    expect(response.receiptId).toBe('receipt-1');
    expect(requestWire.bytes).toEqual(new Uint8Array(3));
    expect(lease.privateRequestWire.bytes).toEqual(new Uint8Array(3));
    await expect(
      store.writeOnce({
        lease,
        confirmation,
        trustedTime: TRUSTED_TIME,
        channel: channel(),
        requestWire: wire(),
      }),
    ).rejects.toMatchObject({ code: 'lease_replay' });
  });

  it('rejects every observed channel binding substitution before any body write', async () => {
    const substitutions: Array<(base: MutuallyAttestedChannel) => MutuallyAttestedChannel> = [
      (base) => ({ ...base, channelKeyDigest: 'foreign-channel' }),
      (base) => ({ ...base, exporterLabel: 'foreign-exporter' }),
      (base) => ({ ...base, exporterDigest: 'foreign-exporter-digest' }),
      (base) => ({ ...base, transcriptDigest: 'foreign-transcript' }),
      (base) => ({ ...base, observedChannelPin: { ...PIN, value: 'foreign-pin' } }),
    ];

    for (const substitute of substitutions) {
      const { store, lease, confirmation } = await preparedLease();
      const writeBodyOnce = vi.fn();
      const substituted = { ...substitute(channel()), writeBodyOnce };

      await expect(
        store.writeOnce({
          lease,
          confirmation,
          trustedTime: TRUSTED_TIME,
          channel: substituted,
          requestWire: wire(),
        }),
      ).rejects.toMatchObject({ code: 'lease_binding_mismatch' });
      expect(writeBodyOnce).not.toHaveBeenCalled();
    }
  });

  it('rejects a delayed write at the trusted expiry boundary and prevents retry', async () => {
    const { store, lease, confirmation } = await preparedLease();
    const expired: TrustedTimeAuthorityPort = {
      read: async () => ({
        trustedNow: lease.boundedWriteValidUntil,
        checkpointDigest: CONTEXT.checkpointDigest,
        bootEpoch: CONTEXT.bootEpoch,
        orgId: CONTEXT.orgId,
        deploymentId: CONTEXT.deploymentId,
      }),
    };
    const writeBodyOnce = vi.fn();
    const selected = { ...channel(), writeBodyOnce };

    await expect(
      store.writeOnce({
        lease,
        confirmation,
        trustedTime: expired,
        channel: selected,
        requestWire: wire(),
      }),
    ).rejects.toMatchObject({ code: 'lease_expired' });
    expect(writeBodyOnce).not.toHaveBeenCalled();
  });

  it('quarantines every nonterminal record after restart and cleans expired capacity', async () => {
    const authority = new InMemoryForwardReplayAuthority(1);
    await authority.claimProof({
      orgId: PROOF.orgId,
      deploymentId: PROOF.deploymentId,
      bootEpoch: PROOF.challenge.bootEpoch,
      proofId: PROOF.proofId,
      requestId: PROOF.requestId,
      expiresAt: PROOF.expiresAt,
    });
    const store = new ForwardLeaseStore({ durableState: authority });
    await store.reserveFromVerifiedProof(reservationInput());
    await store.recoverAfterRestart({ context: CONTEXT });

    await expect(
      authority.claimProof({
        orgId: PROOF.orgId,
        deploymentId: PROOF.deploymentId,
        bootEpoch: PROOF.challenge.bootEpoch,
        proofId: PROOF.proofId,
        requestId: PROOF.requestId,
        expiresAt: PROOF.expiresAt,
      }),
    ).rejects.toThrow('proof_replay');

    await store.cleanup({ context: CONTEXT, trustedNow: PROOF.expiresAt });
    const secondProof = { ...PROOF, proofId: 'proof-2', requestId: 'request-2' };
    await authority.claimProof({
      orgId: secondProof.orgId,
      deploymentId: secondProof.deploymentId,
      bootEpoch: secondProof.challenge.bootEpoch,
      proofId: secondProof.proofId,
      requestId: secondProof.requestId,
      expiresAt: secondProof.expiresAt,
    });
  });

  it('quarantines a nonterminal reservation from a different boot epoch', async () => {
    const authority = new InMemoryForwardReplayAuthority();
    await authority.claimProof({
      orgId: PROOF.orgId,
      deploymentId: PROOF.deploymentId,
      bootEpoch: PROOF.challenge.bootEpoch,
      proofId: PROOF.proofId,
      requestId: PROOF.requestId,
      expiresAt: PROOF.expiresAt,
    });
    const store = new ForwardLeaseStore({ durableState: authority });
    const reservation = await store.reserveFromVerifiedProof(reservationInput());
    const requestWire = wire();
    const prepared = await store.prepareCommitment({ reservation, requestWire });
    const confirmation = { ...prepared, confirmationSequence: 1 };

    await store.recoverAfterRestart({
      context: { ...CONTEXT, bootEpoch: 'boot-2', checkpointDigest: 'checkpoint-2' },
    });

    await expect(store.finalize({ reservation, requestWire, confirmation })).rejects.toMatchObject({
      code: 'lease_invalid',
    });
  });

  it('rehydrates durable nonterminal state and quarantines it across a different boot authority', async () => {
    const journal = new PersistentForwardReplayJournal();
    const authority1 = durableAuthority(journal, 1);
    await authority1.claimProof({
      orgId: PROOF.orgId,
      deploymentId: PROOF.deploymentId,
      bootEpoch: PROOF.challenge.bootEpoch,
      proofId: PROOF.proofId,
      requestId: PROOF.requestId,
      expiresAt: PROOF.expiresAt,
    });
    const store1 = new ForwardLeaseStore({ durableState: authority1 });
    const reservation = await store1.reserveFromVerifiedProof(reservationInput());
    const requestWire = wire();
    const prepared = await store1.prepareCommitment({ reservation, requestWire });
    const confirmation = { ...prepared, confirmationSequence: 1 };

    const authority2 = durableAuthority(journal, 1);
    const store2 = new ForwardLeaseStore({ durableState: authority2 });
    const nextContext = { ...CONTEXT, bootEpoch: 'boot-2', checkpointDigest: 'checkpoint-2' };
    await store2.recoverAfterRestart({ context: nextContext });

    await expect(store2.finalize({ reservation, requestWire, confirmation })).rejects.toMatchObject(
      {
        code: 'lease_invalid',
      },
    );
    expect(journal.entries.some((entry) => entry.state === 'quarantined')).toBe(true);
    await authority2.claimProof({
      orgId: CONTEXT.orgId,
      deploymentId: CONTEXT.deploymentId,
      bootEpoch: nextContext.bootEpoch,
      proofId: 'proof-2',
      requestId: 'request-2',
      expiresAt: PROOF.expiresAt,
    });

    const authority3 = durableAuthority(journal, 1);
    await authority3.recoverAfterRestart({
      context: { ...nextContext, bootEpoch: 'boot-3', checkpointDigest: 'checkpoint-3' },
    });
    await expect(
      authority3.claimProof({
        orgId: CONTEXT.orgId,
        deploymentId: CONTEXT.deploymentId,
        bootEpoch: CONTEXT.bootEpoch,
        proofId: PROOF.proofId,
        requestId: PROOF.requestId,
        expiresAt: PROOF.expiresAt,
      }),
    ).rejects.toThrow('proof_replay');
  });

  it('persists trusted expiry cleanup so an abandoned proof releases capacity across restart', async () => {
    const journal = new PersistentForwardReplayJournal();
    const authority1 = durableAuthority(journal, 1);
    const expired = { ...PROOF, expiresAt: NOW };
    await authority1.claimProof({
      orgId: expired.orgId,
      deploymentId: expired.deploymentId,
      bootEpoch: expired.challenge.bootEpoch,
      proofId: expired.proofId,
      requestId: expired.requestId,
      expiresAt: expired.expiresAt,
    });
    await authority1.cleanup({ context: CONTEXT, trustedNow: NOW });

    const authority2 = durableAuthority(journal, 1);
    await authority2.recoverAfterRestart({ context: CONTEXT });
    await expect(
      authority2.claimProof({
        orgId: expired.orgId,
        deploymentId: expired.deploymentId,
        bootEpoch: expired.challenge.bootEpoch,
        proofId: expired.proofId,
        requestId: expired.requestId,
        expiresAt: expired.expiresAt + 10,
      }),
    ).resolves.toBeUndefined();
  });

  it('fails closed when the durable journal is tampered with after a restart', async () => {
    const journal = new PersistentForwardReplayJournal();
    const authority1 = durableAuthority(journal);
    await authority1.claimProof({
      orgId: PROOF.orgId,
      deploymentId: PROOF.deploymentId,
      bootEpoch: PROOF.challenge.bootEpoch,
      proofId: PROOF.proofId,
      requestId: PROOF.requestId,
      expiresAt: PROOF.expiresAt,
    });
    const first = journal.entries[0];
    if (first === undefined) throw new Error('missing journal entry');
    journal.entries[0] = { ...first, entryTag: 'tampered' };

    const authority2 = durableAuthority(journal);
    await expect(
      authority2.claimProof({
        orgId: PROOF.orgId,
        deploymentId: PROOF.deploymentId,
        bootEpoch: PROOF.challenge.bootEpoch,
        proofId: 'proof-2',
        requestId: 'request-2',
        expiresAt: PROOF.expiresAt,
      }),
    ).rejects.toThrow('durable_state_unavailable');
  });

  it('does not write after durable write arming crosses the lease deadline', async () => {
    const journal = new PersistentForwardReplayJournal();
    const authority = durableAuthority(journal);
    const prepared = await preparedLease(authority);
    let trustedNow = NOW;
    const trustedTime: TrustedTimeAuthorityPort = {
      read: async () => ({ trustedNow, ...CONTEXT }),
    };
    const writeBodyOnce = vi.fn(channel().writeBodyOnce);
    const blocked = prepared.store.writeOnce({
      lease: prepared.lease,
      confirmation: prepared.confirmation,
      trustedTime,
      channel: { ...channel(), writeBodyOnce },
      requestWire: wire(),
    });

    await journal.writeArmedEntered;
    trustedNow = prepared.lease.boundedWriteValidUntil;
    journal.releaseWriteArmed();

    await expect(blocked).rejects.toMatchObject({ code: 'lease_expired' });
    expect(writeBodyOnce).not.toHaveBeenCalled();
  });

  it('terminalizes direct durable admission when journal completion crosses the lease deadline', async () => {
    const journal = new PersistentForwardReplayJournal();
    const authority = durableAuthority(journal);
    const prepared = await preparedLease(authority);
    let trustedNow = NOW;
    const trustedTime: TrustedTimeAuthorityPort = {
      read: async () => ({ trustedNow, ...CONTEXT }),
    };
    const writeBodyOnce = vi.fn(() => ({
      response: Promise.resolve({
        receiptId: 'receipt-1',
        responseBytes: Uint8Array.from([8]),
        responseOk: true,
      }),
    }));
    const blocked = authority.consumeForWrite({
      lease: prepared.lease,
      confirmation: prepared.confirmation,
      trustedTime,
      writeAtBoundary: () => writeBodyOnce(),
    });

    await journal.writeArmedEntered;
    trustedNow = prepared.lease.boundedWriteValidUntil;
    journal.releaseWriteArmed();

    await expect(blocked).rejects.toThrow('lease_expired');
    expect(writeBodyOnce).not.toHaveBeenCalled();
    expect(journal.entries.at(-1)?.state).toBe('aborted');
  });

  it('zeroizes all write copies when the channel fails after the write boundary', async () => {
    const { store, lease, confirmation } = await preparedLease();
    const requestWire = wire();
    const failingChannel = {
      ...channel(),
      writeBodyOnce: () => {
        throw new Error('transport failure');
      },
    };

    await expect(
      store.writeOnce({
        lease,
        confirmation,
        trustedTime: TRUSTED_TIME,
        channel: failingChannel,
        requestWire,
      }),
    ).rejects.toMatchObject({ code: 'lease_invalid' });
    expect(requestWire.bytes).toEqual(new Uint8Array(3));
    expect(lease.privateRequestWire.bytes).toEqual(new Uint8Array(3));
    await expect(
      store.writeOnce({
        lease,
        confirmation,
        trustedTime: TRUSTED_TIME,
        channel: failingChannel,
        requestWire: wire(),
      }),
    ).rejects.toMatchObject({ code: 'lease_replay' });
  });

  it('keeps content out of errors', async () => {
    const { store, lease, confirmation } = await preparedLease();
    const candidate = { ...lease, model: 'customer-secret' };
    await expect(
      store.writeOnce({
        lease: candidate,
        confirmation,
        trustedTime: TRUSTED_TIME,
        channel: channel(),
        requestWire: wire(),
      }),
    ).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ForwardLeaseStoreError);
      expect((error as Error).message).not.toContain('customer-secret');
      return true;
    });
  });
});
