// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import { ACI_POLICY_FIXTURE } from '../../contracts/test/fixtures/aci-v1.js';
import { AciReceiptVerifier } from '../src/aci/AciReceiptVerifier.js';
import { AciTrustState } from '../src/aci/AciTrustState.js';
import { OfficialAciExchange } from '../src/aci/OfficialAciExchange.js';
import { AciReceiptVerifierDouble } from './doubles/aci/AciReceiptVerifierDouble.js';
import { AciTrustStateDouble } from './doubles/aci/AciTrustStateDouble.js';
import { InMemoryAciTrustHighWaterStore } from './doubles/aci/InMemoryAciStores.js';
import type { AciTrustContext, OfficialAciExchangeConfig } from '../src/ports.js';

const TRUST_CONTEXT: AciTrustContext = {
  orgId: 'org-1',
  deploymentId: 'deployment-1',
  bootEpoch: 'boot-1',
  checkpointDigest: 'a'.repeat(64),
};

function exchangeConfig(): OfficialAciExchangeConfig {
  return {
    baseUrl: ACI_POLICY_FIXTURE.origin,
    policy: ACI_POLICY_FIXTURE,
    trustState: new AciTrustStateDouble(undefined),
    receiptVerifier: new AciReceiptVerifierDouble(),
    fetchImpl: fetch,
    trustedTimeAuthority: {
      read: async () => ({ trustedNow: 1_750_000_100, ...TRUST_CONTEXT }),
    },
    trustedTimeContext: TRUST_CONTEXT,
  };
}

describe('ACI security hardening RED tests', () => {
  it('requires a channel-bound customer-content transport', () => {
    expect(() => new OfficialAciExchange(exchangeConfig())).toThrow('channel_transport_required');
  });

  it('makes bypass execution and serialization impossible without a lease', async () => {
    const exchange = new OfficialAciExchange({
      ...exchangeConfig(),
      channelTransport: {
        open: async () => {
          throw new Error('not reached');
        },
      },
      transport: {
        send: async () => {
          throw new Error('not reached');
        },
      },
      leaseStore: { consume: async () => undefined },
    });
    await expect(
      exchange.execute(
        { role: 'generate', endpoint: '/v1/chat/completions', method: 'POST', body: {} },
        () => undefined,
      ),
    ).rejects.toMatchObject({ code: 'lease_required' });
    await expect(
      exchange.serialize({
        role: 'generate',
        endpoint: '/v1/chat/completions',
        method: 'POST',
        body: {},
      }),
    ).rejects.toMatchObject({ code: 'lease_required' });
  });

  it('requires durable trust high-water state', () => {
    expect(() => new AciTrustState(ACI_POLICY_FIXTURE, () => 1_750_000_100)).toThrow(
      'durable_state_required',
    );
  });

  it('cannot use the legacy synchronous trust path on a fresh production instance', () => {
    const state = new AciTrustState(
      ACI_POLICY_FIXTURE,
      () => 1_750_000_100,
      new InMemoryAciTrustHighWaterStore(),
    );
    expect(() => state.acquire()).toThrow('durable_state_required');
    expect(() => state.refresh(0, {} as never)).toThrow('durable_state_required');
  });

  it('requires durable receipt replay state', () => {
    expect(
      () =>
        new AciReceiptVerifier({
          baseUrl: ACI_POLICY_FIXTURE.origin,
          policy: ACI_POLICY_FIXTURE,
          fetchImpl: fetch,
          trustedTimeAuthority: {
            read: async () => ({ trustedNow: 1_750_000_100, ...TRUST_CONTEXT }),
          },
        }),
    ).toThrow('replay_store_required');
  });
});
