// SPDX-License-Identifier: Apache-2.0
import type {
  FixedWidthSequenceV1,
  Sha256DigestV1,
  VersionedContentFreeRecordV1,
} from './official-aci-digests.js';
import type { OfficialAciRequestDescriptorDigestV1 } from './official-aci-request-descriptor.js';
import type { OfficialAciTrustContextV1 } from '../ports.js';

// Minimal 3A.1 proof-claim slice of the forward replay record. Only the `proof_claimed` state and
// the narrow claim API required by the admitted-proof handoff exist here; 3A.2 introduces the full
// state machine and the typed ForwardReplayJournalPort. This is not a placeholder cast.
export interface ProofClaimedForwardReplayRecordV1 {
  readonly schema: 'ForwardReplayRecordV1';
  readonly version: 1;
  readonly state: 'proof_claimed';
  readonly context: OfficialAciTrustContextV1;
  readonly epochId: string;
  readonly sequence: FixedWidthSequenceV1;
  readonly previousRecordDigest: null;
  readonly previousObjectVersionId: null;
  readonly recordDigest: Sha256DigestV1;
  readonly requestId: string;
  readonly requestDescriptorDigest: OfficialAciRequestDescriptorDigestV1;
  readonly recordedAt: string;
  readonly proofDigest: Sha256DigestV1;
  readonly proofExpiresAt: string;
}

export type ForwardReplayCanonicalStateV1 = 'proof_claimed';

export type VersionedForwardState<S extends ForwardReplayCanonicalStateV1> =
  S extends 'proof_claimed'
    ? VersionedContentFreeRecordV1<ProofClaimedForwardReplayRecordV1>
    : never;

export interface ForwardAbsentCasV1 {
  readonly expectedPriorState: 'absent';
  readonly epochId: string;
  readonly requestId: string;
  readonly requestDescriptorDigest: OfficialAciRequestDescriptorDigestV1;
  readonly expectedPriorSequence: null;
  readonly expectedPriorRecordDigest: null;
  readonly expectedPriorObjectVersionId: null;
  readonly expectedPriorVersionToken: null;
}

export interface ForwardClaimProofInputV1 {
  readonly expected: ForwardAbsentCasV1;
  readonly context: OfficialAciTrustContextV1;
  readonly proofDigest: Sha256DigestV1;
  readonly proofExpiresAt: string;
  readonly recordedAt: string;
}

export interface PreForwardProofClaimJournalPort {
  claimProof(input: ForwardClaimProofInputV1): Promise<VersionedForwardState<'proof_claimed'>>;
}
