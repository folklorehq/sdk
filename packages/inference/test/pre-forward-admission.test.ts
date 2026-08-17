// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { ForwardLeaseStore } from '../src/aci/ForwardLeaseStore.js';
import { NativeAciTransport } from '../src/aci/NativeAciTransport.js';
import { PreForwardAdmissionService } from '../src/aci/PreForwardAdmissionService.js';
import type {
  AciTrustContext,
  ForwardLeaseStorePort,
  MutuallyAttestedChannel,
  PreForwardRouteBinding,
  PrivateOfficialAciRequestWire,
  VerifiedAciSession,
  VerifiedAciTrustSnapshot,
  VerifiedPreForwardRouteProof,
} from '../src/ports.js';
import { InMemoryForwardReplayAuthority } from './doubles/aci/InMemoryAciStores.js';

const NOW = 1_750_000_150;
const CONTEXT: AciTrustContext = {
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  bootEpoch: 'boot-1',
  checkpointDigest: 'checkpoint-1',
};
const PIN = { type: 'tls_spki_sha256' as const, value: 'pin-1', domain: 'inference.example' };
const UPSTREAM_PIN = {
  type: 'tls_spki_sha256' as const,
  value: 'upstream-pin-1',
  domain: 'upstream.example',
};
const CHANNEL_BINDING = {
  channelKeyDigest: 'channel-key-1',
  exporterLabel: 'EXPORTER-ACI-CHANNEL',
  exporterDigest: 'exporter-1',
  transcriptDigest: 'transcript-1',
  observedChannelPin: PIN,
};

function session(role: VerifiedAciSession['role']): VerifiedAciSession {
  return {
    role,
    model: 'provider/model-1',
    modelRevision: 'revision-1',
    sessionId: 'session-1',
    establishedAt: NOW - 10,
    expiresAt: NOW + 100,
    workloadKeysetDigest: 'upstream-keyset-1',
    channelKeyDigest: 'upstream-channel-key-1',
    channelPins: [UPSTREAM_PIN],
    upstreamIdentityDigest: 'upstream-1',
    upstreamIdentity: {
      upstreamName: 'inference',
      urlOrigin: 'https://inference.example',
      verifierId: 'verifier-1',
      claims: {},
    },
  };
}

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
    channelKeyDigest: CHANNEL_BINDING.channelKeyDigest,
  },
  channelPins: [PIN],
  sessions: {
    embed: session('embed'),
    generate: session('generate'),
    critique: session('critique'),
    judge: session('judge'),
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
  connection: {
    channelKeyDigest: CHANNEL_BINDING.channelKeyDigest,
    exporterLabel: CHANNEL_BINDING.exporterLabel,
    exporterDigest: CHANNEL_BINDING.exporterDigest,
    transcriptDigest: CHANNEL_BINDING.transcriptDigest,
  },
  route: {
    origin: 'https://inference.example',
    route: '/v1/chat/completions',
    method: 'POST',
    routeIdentityDigest: 'route-1',
    workloadId: SNAPSHOT.keyset.workloadId,
  },
  role: 'generate',
  sessionId: 'session-1',
  model: 'provider/model-1',
  modelRevision: 'revision-1',
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

const EXPECTED_PROOF: PreForwardRouteBinding = {
  orgId: PROOF.orgId,
  deploymentId: PROOF.deploymentId,
  tenantId: PROOF.tenantContext.tenantId,
  assignmentDigest: PROOF.tenantContext.assignmentDigest,
  proofId: PROOF.proofId,
  workloadId: PROOF.issuer.workloadId,
  runtimeIdentityDigest: PROOF.issuer.runtimeIdentityDigest,
  workloadArtifactDigest: PROOF.issuer.workloadArtifactDigest,
  pinnedTrustRootDigest: PROOF.pinnedTrustRootDigest,
  channelKeyDigest: PROOF.connection.channelKeyDigest,
  exporterLabel: PROOF.connection.exporterLabel,
  exporterDigest: PROOF.connection.exporterDigest,
  transcriptDigest: PROOF.connection.transcriptDigest,
  snapshotDigest: PROOF.snapshotDigest,
  policyDigest: PROOF.policyDigest,
  tenantAadDigest: PROOF.tenantAadDigest,
  origin: PROOF.route.origin,
  route: PROOF.route.route,
  method: PROOF.route.method,
  routeIdentityDigest: PROOF.route.routeIdentityDigest,
  role: PROOF.role,
  sessionId: PROOF.sessionId,
  model: PROOF.model,
  modelRevision: PROOF.modelRevision,
  modelArtifactDigest: PROOF.modelArtifactDigest,
  workloadKeysetDigest: PROOF.workloadKeysetDigest,
  capabilityDigest: PROOF.capabilityDigest,
  policyGeneration: PROOF.policyGeneration,
  activationGeneration: PROOF.activationGeneration,
  gatewayNonce: PROOF.challenge.gatewayNonce,
  requestId: PROOF.requestId,
  bootEpoch: PROOF.challenge.bootEpoch,
  trustedTimeCheckpointDigest: CONTEXT.checkpointDigest,
};

function wire(bytes = Uint8Array.from([1, 2, 3])): PrivateOfficialAciRequestWire {
  return {
    bytes,
    requestWireSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    byteLength: bytes.byteLength,
  };
}

function trustedTime() {
  return {
    read: async () => ({
      trustedNow: NOW,
      ...CONTEXT,
    }),
  };
}

function channel(events: string[]): MutuallyAttestedChannel {
  return {
    ...CHANNEL_BINDING,
    sendControl: async () => events.push('control-write'),
    receiveControlProof: async () => Uint8Array.from([1]),
    writeBodyOnce: ({ bytes, permit }) => {
      expect(bytes).toEqual(Uint8Array.from([1, 2, 3]));
      permit.assertWriteStart();
      events.push('body-write');
      return {
        response: Promise.resolve({
          receiptId: 'receipt-1',
          responseBytes: Uint8Array.from([8]),
          responseOk: true,
        }),
      };
    },
    close: async () => events.push('close'),
  };
}

function descriptor() {
  return {
    role: 'generate' as const,
    method: 'POST' as const,
    route: PROOF.route.route,
    tenantId: PROOF.tenantContext.tenantId,
    assignmentDigest: PROOF.tenantContext.assignmentDigest,
    tenantAadDigest: PROOF.tenantAadDigest,
    capabilityDigest: PROOF.capabilityDigest,
    sessionId: PROOF.sessionId,
    model: PROOF.model,
    modelRevision: PROOF.modelRevision,
    modelArtifactDigest: PROOF.modelArtifactDigest,
    policyGeneration: PROOF.policyGeneration,
    activationGeneration: PROOF.activationGeneration,
  };
}

describe('PreForwardAdmissionService', () => {
  it('opens the body only after proof admission and writes once through the durable CAS boundary', async () => {
    const events: string[] = [];
    const authority = new InMemoryForwardReplayAuthority();
    const leaseStore = new ForwardLeaseStore({ durableState: authority });
    const openedChannel = channel(events);
    let serializerCalls = 0;
    const proofVerifier = {
      verify: async () => {
        events.push('verify');
        await authority.claimProof({
          orgId: PROOF.orgId,
          deploymentId: PROOF.deploymentId,
          bootEpoch: PROOF.challenge.bootEpoch,
          proofId: PROOF.proofId,
          requestId: PROOF.requestId,
          expiresAt: PROOF.expiresAt,
        });
        return PROOF;
      },
      release: async () => undefined,
      cleanup: async () => undefined,
    };
    const requestSerializer = {
      serialize: async (request: { readonly body: unknown }) => {
        serializerCalls += 1;
        events.push('serialize');
        expect(request.body).toEqual({ messages: ['body'] });
        return wire();
      },
    };
    const service = new PreForwardAdmissionService({
      trustState: {
        acquireWithTrustedTime: async () => {
          events.push('snapshot');
          return SNAPSHOT;
        },
        refreshWithTrustedTime: async () => false,
      },
      channelPort: {
        open: async (input) => {
          expect(input.channelPins).toEqual([PIN]);
          events.push('open');
          return openedChannel;
        },
      },
      controlProofExchange: {
        exchange: async () => {
          events.push('proof-exchange');
          return Uint8Array.from([1]);
        },
        confirmCommitment: async ({ commitment: value }) => {
          events.push('commitment-confirm');
          return { ...value, confirmationSequence: 1 };
        },
      },
      proofVerifier,
      trustedTime: trustedTime(),
      leaseStore,
      requestSerializer,
      keysetHighWater: {
        read: async () => ({
          generation: SNAPSHOT.generation,
          policyGeneration: SNAPSHOT.policyGeneration,
          activationGeneration: SNAPSHOT.activationGeneration,
          keysetVersion: SNAPSHOT.keyset.version,
          currentKeysetDigest: SNAPSHOT.keyset.workloadKeysetDigest,
          supersededKeysetDigests: [],
          trustContext: CONTEXT,
        }),
      },
    });

    const bodyCapability = await service.admit({
      request: { role: 'generate', endpoint: PROOF.route.route, method: 'POST' },
      context: CONTEXT,
      challenge: { ...PROOF.challenge, requestId: PROOF.requestId },
      descriptor: descriptor(),
      expectedProof: EXPECTED_PROOF,
    });

    expect(events).toEqual(['snapshot', 'open', 'proof-exchange', 'verify']);
    expect(serializerCalls).toBe(0);
    expect(events).not.toContain('body-write');

    const finalized = await service.finalizeBody(bodyCapability, { messages: ['body'] });
    expect(serializerCalls).toBe(1);
    expect(events).toContain('serialize');
    expect(events).toContain('commitment-confirm');
    await expect(service.finalizeBody(bodyCapability, { messages: ['body'] })).rejects.toThrow(
      'admission_required',
    );
    expect(serializerCalls).toBe(1);

    const response = await new NativeAciTransport().send({ capability: finalized.capability });
    expect(response.receiptId).toBe('receipt-1');
    expect(events).toContain('body-write');
    expect(events.at(-1)).toBe('close');
    await expect(
      new NativeAciTransport().send({ capability: finalized.capability }),
    ).rejects.toThrow('admission_required');
  });

  it('rejects an unissued capability without writing a body', async () => {
    const events: string[] = [];
    await expect(new NativeAciTransport().send({ capability: {} as never })).rejects.toThrow(
      'admission_required',
    );
    expect(events).toEqual([]);
  });

  it('aborts durable state and closes the channel when commitment confirmation fails', async () => {
    const events: string[] = [];
    const authority = new InMemoryForwardReplayAuthority();
    const leaseStore = new ForwardLeaseStore({ durableState: authority });
    const aborts: string[] = [];
    const trackedLeaseStore: ForwardLeaseStorePort = {
      reserveFromVerifiedProof: leaseStore.reserveFromVerifiedProof.bind(leaseStore),
      prepareCommitment: leaseStore.prepareCommitment.bind(leaseStore),
      finalize: leaseStore.finalize.bind(leaseStore),
      writeOnce: leaseStore.writeOnce.bind(leaseStore),
      abort: async (input) => {
        aborts.push(input.reason);
        await leaseStore.abort(input);
      },
      recoverAfterRestart: leaseStore.recoverAfterRestart.bind(leaseStore),
      cleanup: leaseStore.cleanup.bind(leaseStore),
    };
    const proofVerifier = {
      verify: async () => {
        await authority.claimProof({
          orgId: PROOF.orgId,
          deploymentId: PROOF.deploymentId,
          bootEpoch: PROOF.challenge.bootEpoch,
          proofId: PROOF.proofId,
          requestId: PROOF.requestId,
          expiresAt: PROOF.expiresAt,
        });
        return PROOF;
      },
      release: async () => undefined,
      cleanup: async () => undefined,
    };
    const service = new PreForwardAdmissionService({
      trustState: {
        acquireWithTrustedTime: async () => SNAPSHOT,
        refreshWithTrustedTime: async () => false,
      },
      channelPort: {
        open: async () => channel(events),
      },
      controlProofExchange: {
        exchange: async () => Uint8Array.from([1]),
        confirmCommitment: async () => {
          throw new Error('confirmation rejected');
        },
      },
      proofVerifier,
      trustedTime: trustedTime(),
      leaseStore: trackedLeaseStore,
      requestSerializer: {
        serialize: async () => wire(),
      },
      keysetHighWater: {
        read: async () => ({
          generation: SNAPSHOT.generation,
          policyGeneration: SNAPSHOT.policyGeneration,
          activationGeneration: SNAPSHOT.activationGeneration,
          keysetVersion: SNAPSHOT.keyset.version,
          currentKeysetDigest: SNAPSHOT.keyset.workloadKeysetDigest,
          supersededKeysetDigests: [],
          trustContext: CONTEXT,
        }),
      },
    });

    const bodyCapability = await service.admit({
      request: { role: 'generate', endpoint: PROOF.route.route, method: 'POST' },
      context: CONTEXT,
      challenge: { ...PROOF.challenge, requestId: PROOF.requestId },
      descriptor: descriptor(),
      expectedProof: EXPECTED_PROOF,
    });

    await expect(service.finalizeBody(bodyCapability, { messages: ['body'] })).rejects.toThrow(
      'ACI admission failed',
    );
    expect(aborts).toEqual(['finalize_failed']);
    expect(events).toContain('close');
    await expect(service.finalizeBody(bodyCapability, { messages: ['body'] })).rejects.toThrow(
      'admission_required',
    );
  });
});
