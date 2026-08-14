// SPDX-License-Identifier: Apache-2.0
import type { AciTrustStatePort, VerifiedAciTrustSnapshot } from '../../../src/ports.js';

export class AciTrustStateDouble implements AciTrustStatePort {
  private snapshot: VerifiedAciTrustSnapshot | undefined;

  constructor(snapshot: VerifiedAciTrustSnapshot | undefined) {
    this.snapshot = snapshot;
  }

  acquire(): VerifiedAciTrustSnapshot | undefined {
    return this.snapshot;
  }

  replace(snapshot: VerifiedAciTrustSnapshot | undefined): void {
    this.snapshot = snapshot;
  }
}
