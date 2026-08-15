// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import type {
  ControlProofExchangePort,
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
      sendControl: async () => undefined,
      receiveControlProof: async () => new Uint8Array([1]),
      writeBody: async () => {
        bodyWrites += 1;
      },
      close: async () => undefined,
    };
    const channelPort: MutuallyAttestedChannelPort = {
      open: async () => channel,
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
    };

    const opened = await channelPort.open({
      orgId: 'org-1',
      deploymentId: 'deployment-1',
      workloadId: 'workload-1',
      routeIdentityDigest: 'd'.repeat(64),
      pinnedTrustRootDigest: 'e'.repeat(64),
      channelKeyDigest: channel.channelKeyDigest,
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
        contentLength: 3,
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
    await opened.writeBody(new Uint8Array([1, 2, 3]));
    expect(bodyWrites).toBe(1);
  });
});
