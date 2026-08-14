// SPDX-License-Identifier: Apache-2.0
import type {
  AciReceiptVerificationInput,
  AciReceiptVerifierPort,
  VerifiedAciReceipt,
} from '../../../src/ports.js';

export class AciReceiptVerifierDouble implements AciReceiptVerifierPort {
  readonly inputs: AciReceiptVerificationInput[] = [];

  constructor(
    private readonly handler: (
      input: AciReceiptVerificationInput,
    ) => Promise<VerifiedAciReceipt> = async (input) => ({
      receiptId: input.receiptId ?? '',
      servedAt: 1,
      sessionId: input.snapshot.sessions[input.role].sessionId,
    }),
  ) {}

  async verify(input: AciReceiptVerificationInput): Promise<VerifiedAciReceipt> {
    this.inputs.push(input);
    return this.handler(input);
  }
}
