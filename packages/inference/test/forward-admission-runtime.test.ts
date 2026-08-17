// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';

import { createForwardAdmissionRuntime } from '../src/aci/ForwardAdmissionRuntime.js';
import { NativeAciTransport } from '../src/aci/NativeAciTransport.js';
import type { ForwardReplayJournalPort, TrustedWriteBoundaryPort } from '../src/ports.js';

const journal: ForwardReplayJournalPort = {
  load: async () => ({ sequence: 0, tailTag: '', entries: [] }),
  append: async ({ entry }) => ({
    sequence: entry.sequence,
    tailTag: entry.entryTag,
    entries: [entry],
  }),
};

const writeBoundary: TrustedWriteBoundaryPort = {
  isTrustedTimeBound: true,
  assertValid: ({ trustedNow, validUntil }) => {
    if (trustedNow >= validUntil) throw new Error('lease_expired');
  },
};

describe('forward admission runtime', () => {
  it('fails closed when durable journal or trusted write boundary is absent', () => {
    expect(() =>
      createForwardAdmissionRuntime({
        journal: undefined as never,
        commitmentKey: new Uint8Array(32),
        writeBoundary,
      }),
    ).toThrow('forward_runtime_unavailable');
    expect(() =>
      createForwardAdmissionRuntime({
        journal,
        commitmentKey: new Uint8Array(32),
        writeBoundary: undefined as never,
      }),
    ).toThrow('forward_runtime_unavailable');
  });

  it('wires durable authority, lease store, and native transport without enabling a default path', () => {
    const runtime = createForwardAdmissionRuntime({
      journal,
      commitmentKey: new Uint8Array(32),
      writeBoundary,
    });

    expect(runtime.transport).toBeInstanceOf(NativeAciTransport);
    expect(runtime.leaseStore).toBeDefined();
    expect(runtime.durableState).toBeDefined();
  });
});
