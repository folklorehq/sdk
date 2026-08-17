// SPDX-License-Identifier: Apache-2.0
import { createHmac } from 'node:crypto';

import type { ForwardCommitmentAuthenticatorPort, ForwardAdmissionReservation } from '../ports.js';

const TAG_PREFIX = 'hmac-sha256:';

export class ForwardCommitmentAuthenticator implements ForwardCommitmentAuthenticatorPort {
  private readonly key: Uint8Array;

  constructor(key: Uint8Array) {
    if (key.byteLength < 32) throw new Error('commitment_key_required');
    this.key = Uint8Array.from(key);
  }

  create(input: {
    readonly reservation: ForwardAdmissionReservation;
    readonly wireSha256: string;
    readonly byteLength: number;
  }): string {
    return `${TAG_PREFIX}${createHmac('sha256', this.key)
      .update(
        [
          input.reservation.orgId,
          input.reservation.deploymentId,
          input.reservation.bootEpoch,
          input.reservation.reservationId,
          input.reservation.proofId,
          input.reservation.requestId,
          input.reservation.commitmentNonce,
          input.wireSha256,
          String(input.byteLength),
        ].join('\u0000'),
      )
      .digest('hex')}`;
  }

  journalTag(entry: Parameters<ForwardCommitmentAuthenticatorPort['journalTag']>[0]): string {
    return `${TAG_PREFIX}${createHmac('sha256', this.key)
      .update('journal\u0000')
      .update(JSON.stringify(entry))
      .digest('hex')}`;
  }
}
