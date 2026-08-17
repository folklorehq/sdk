// SPDX-License-Identifier: Apache-2.0
import type { ForwardReplayJournalPort, TrustedWriteBoundaryPort } from '../ports.js';
import { DurableForwardReplayAuthority } from './DurableForwardReplayAuthority.js';
import { ForwardCommitmentAuthenticator } from './ForwardCommitmentAuthenticator.js';
import { ForwardLeaseStore } from './ForwardLeaseStore.js';
import { NativeAciTransport } from './NativeAciTransport.js';

export interface ForwardAdmissionRuntimeConfig {
  readonly journal?: ForwardReplayJournalPort;
  readonly commitmentKey?: Uint8Array;
  readonly writeBoundary?: TrustedWriteBoundaryPort;
  readonly capacity?: number;
}

export interface ForwardAdmissionRuntime {
  readonly durableState: DurableForwardReplayAuthority;
  readonly leaseStore: ForwardLeaseStore;
  readonly transport: NativeAciTransport;
}

export function createForwardAdmissionRuntime(
  config?: ForwardAdmissionRuntimeConfig,
): ForwardAdmissionRuntime {
  const commitmentKey = config?.commitmentKey;
  if (
    typeof config?.journal?.load !== 'function' ||
    typeof config.journal.append !== 'function' ||
    !(commitmentKey instanceof Uint8Array) ||
    commitmentKey.byteLength < 32 ||
    config.writeBoundary?.isTrustedTimeBound !== true ||
    typeof config.writeBoundary.assertValid !== 'function'
  ) {
    throw new Error('forward_runtime_unavailable');
  }
  const durableState = new DurableForwardReplayAuthority({
    journal: config.journal,
    commitmentAuthenticator: new ForwardCommitmentAuthenticator(commitmentKey),
    writeBoundary: config.writeBoundary,
    capacity: config.capacity,
  });
  return Object.freeze({
    durableState,
    leaseStore: new ForwardLeaseStore({ durableState }),
    transport: new NativeAciTransport(),
  });
}
