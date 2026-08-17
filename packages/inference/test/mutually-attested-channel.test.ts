// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import type {
  ControlProofExchangePort,
  ForwardWritePermit,
  MutuallyAttestedChannel,
  MutuallyAttestedChannelPort,
} from '../src/ports.js';

describe('mutually attested channel ports', () => {
  it('keeps the content-free proof exchange before the private body write', async () => {
    let proofReceived = false;
    let bodyWrites = 0;
    const channel: MutuallyAttestedChannel = {
      channelKeyDigest: 'a'.repeat(64),
      exporterLabel: 'EXPORTER-ACI-CHANNEL',
      exporterDigest: 'b'.repeat(64),
      transcriptDigest: 'c'.repeat(64),
      observedChannelPin: { type: 'tls_spki_sha256', value: 'd'.repeat(64) },
      sendControl: async () => undefined,
      receiveControlProof: async () => new Uint8Array([1]),
      writeBodyOnce: ({ bytes, permit }) => {
        expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
        expect(permit.leaseId).toBe('lease-1');
        permit.assertWriteStart();
        bodyWrites += 1;
        return {
          response: Promise.resolve({
            receiptId: 'receipt-1',
            responseBytes: new Uint8Array([8]),
            responseOk: true,
          }),
        };
      },
      close: async () => undefined,
    };
    const channelPort: MutuallyAttestedChannelPort = {
      open: async (input) => {
        expect(input.sessionId).toBe('session-1');
        expect(input.channelPins).toEqual([channel.observedChannelPin]);
        return channel;
      },
    };
    const proofExchange: ControlProofExchangePort = {
      exchange: async ({ challenge, descriptor, channel: selected }) => {
        expect(selected).toBe(channel);
        expect(challenge).toEqual({
          gatewayNonce: 'gateway-nonce-1',
          requestId: 'request-1',
          bootEpoch: 'boot-1',
        });
        expect(descriptor).not.toHaveProperty('requestWireSha256');
        expect(descriptor).not.toHaveProperty('requestBytes');
        proofReceived = true;
        return selected.receiveControlProof();
      },
      confirmCommitment: async ({ commitment }) => ({ ...commitment, confirmationSequence: 1 }),
    };

    const opened = await channelPort.open({
      orgId: 'org-1',
      deploymentId: 'deployment-1',
      workloadId: 'workload-1',
      routeIdentityDigest: 'd'.repeat(64),
      pinnedTrustRootDigest: 'e'.repeat(64),
      channelKeyDigest: channel.channelKeyDigest,
      sessionId: 'session-1',
      channelPins: [channel.observedChannelPin],
      exporterLabel: channel.exporterLabel,
      exporterDigest: channel.exporterDigest,
      transcriptDigest: channel.transcriptDigest,
    });
    const proof = await proofExchange.exchange({
      channel: opened,
      challenge: { gatewayNonce: 'gateway-nonce-1', requestId: 'request-1', bootEpoch: 'boot-1' },
      descriptor: {
        role: 'generate',
        method: 'POST',
        route: '/v1/chat/completions',
        tenantId: 'org-1',
        assignmentDigest: 'f'.repeat(64),
        tenantAadDigest: 'a'.repeat(64),
        capabilityDigest: 'b'.repeat(64),
        sessionId: 'session-1',
        model: 'provider/model-1',
        modelRevision: 'revision-1',
        modelArtifactDigest: 'c'.repeat(64),
        policyGeneration: 7,
        activationGeneration: 3,
      },
    });

    expect(proof).toEqual(new Uint8Array([1]));
    expect(proofReceived).toBe(true);
    expect(bodyWrites).toBe(0);
    const operation = opened.writeBodyOnce({
      bytes: new Uint8Array([1, 2, 3]),
      permit: {
        __aciForwardWritePermit: Symbol('permit'),
        leaseId: 'lease-1',
        validUntil: 1_750_000_100,
        channelKeyDigest: channel.channelKeyDigest,
        exporterLabel: channel.exporterLabel,
        exporterDigest: channel.exporterDigest,
        transcriptDigest: channel.transcriptDigest,
        observedChannelPin: channel.observedChannelPin,
        assertWriteStart: () => undefined,
      } as ForwardWritePermit,
    });
    await operation.response;
    expect(bodyWrites).toBe(1);
  });

  it('requires a synchronous write operation with the trusted boundary guard at enqueue', async () => {
    let guardCalls = 0;
    let bodyWrites = 0;
    const channel = {
      channelKeyDigest: 'a'.repeat(64),
      exporterLabel: 'EXPORTER-ACI-CHANNEL',
      exporterDigest: 'b'.repeat(64),
      transcriptDigest: 'c'.repeat(64),
      observedChannelPin: { type: 'tls_spki_sha256' as const, value: 'd'.repeat(64) },
      sendControl: async () => undefined,
      receiveControlProof: async () => new Uint8Array([1]),
      writeBodyOnce: ({ permit }: { permit: ForwardWritePermit }) => {
        permit.assertWriteStart();
        guardCalls += 1;
        bodyWrites += 1;
        return {
          response: Promise.resolve({
            receiptId: 'receipt-1',
            responseBytes: new Uint8Array([8]),
            responseOk: true,
          }),
        };
      },
      close: async () => undefined,
    } as unknown as MutuallyAttestedChannel;
    const permit = {
      __aciForwardWritePermit: Symbol('permit'),
      leaseId: 'lease-1',
      validUntil: 1_750_000_100,
      channelKeyDigest: channel.channelKeyDigest,
      exporterLabel: channel.exporterLabel,
      exporterDigest: channel.exporterDigest,
      transcriptDigest: channel.transcriptDigest,
      observedChannelPin: channel.observedChannelPin,
      assertWriteStart: () => undefined,
    } as ForwardWritePermit;

    const operation = channel.writeBodyOnce({ bytes: new Uint8Array([1]), permit });

    expect(operation).not.toBeInstanceOf(Promise);
    await operation.response;
    expect(bodyWrites).toBe(1);
    expect(guardCalls).toBe(1);
  });
});
