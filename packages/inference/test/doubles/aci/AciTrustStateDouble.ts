// SPDX-License-Identifier: Apache-2.0
import type {
  AciTrustContext,
  AciV2TrustStatePort,
  VerifiedAciTrustSnapshot,
} from '../../../src/ports.js';

export class AciTrustStateDouble implements AciV2TrustStatePort {
  private snapshot: VerifiedAciTrustSnapshot | undefined;

  constructor(snapshot: VerifiedAciTrustSnapshot | undefined) {
    this.snapshot = snapshot;
  }

  acquire(): VerifiedAciTrustSnapshot | undefined {
    return this.snapshot;
  }

  async acquireWithTrustedTime(
    _context: AciTrustContext,
  ): Promise<VerifiedAciTrustSnapshot | undefined> {
    return this.snapshot;
  }

  async refreshWithTrustedTime(
    _expectedGeneration: number,
    _candidate: VerifiedAciTrustSnapshot,
    _context: AciTrustContext,
  ): Promise<boolean> {
    return false;
  }

  replace(snapshot: VerifiedAciTrustSnapshot | undefined): void {
    this.snapshot = snapshot;
  }
}
