// SPDX-License-Identifier: Apache-2.0
import type {
  ForwardClaimProofInputV1,
  PreForwardProofClaimJournalPort,
  VersionedForwardState,
} from '../../../src/aci/official-aci-forward-records.js';
import {
  parseSha256DigestV1,
  type EvidenceVersionTokenV1,
  type FixedWidthSequenceV1,
  type S3ObjectVersionIdV1,
} from '../../../src/aci/official-aci-digests.js';

// Deterministic 3A.1 narrow proof-claim journal double. Records exact claim inputs and returns one
// configured committed proof record. It never verifies a proof or performs a second claim.
export class PreForwardProofClaimJournalDouble implements PreForwardProofClaimJournalPort {
  readonly calls: ForwardClaimProofInputV1[] = [];

  constructor(
    private readonly committed: VersionedForwardState<'proof_claimed'>,
    private readonly onClaim?: (input: ForwardClaimProofInputV1) => void,
  ) {}

  async claimProof(
    input: ForwardClaimProofInputV1,
  ): Promise<VersionedForwardState<'proof_claimed'>> {
    this.calls.push(input);
    this.onClaim?.(input);
    return this.committed;
  }
}

export function committedProofClaim(
  input: ForwardClaimProofInputV1,
): VersionedForwardState<'proof_claimed'> {
  return {
    record: {
      schema: 'ForwardReplayRecordV1',
      version: 1,
      state: 'proof_claimed',
      context: input.context,
      epochId: input.expected.epochId,
      sequence: '0000000000000000' as FixedWidthSequenceV1,
      previousRecordDigest: null,
      previousObjectVersionId: null,
      recordDigest: parseSha256DigestV1(`sha256:${'b'.repeat(64)}`),
      requestId: input.expected.requestId,
      requestDescriptorDigest: input.expected.requestDescriptorDigest,
      recordedAt: input.recordedAt,
      proofDigest: input.proofDigest,
      proofExpiresAt: input.proofExpiresAt,
    },
    objectVersionId: 'version-1' as S3ObjectVersionIdV1,
    versionToken: 'token-1' as EvidenceVersionTokenV1,
    objectDigest: parseSha256DigestV1(`sha256:${'c'.repeat(64)}`),
    objectByteLength: 128,
  };
}
