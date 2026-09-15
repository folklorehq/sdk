// SPDX-License-Identifier: Apache-2.0
import { canonicalJson } from '@folklore/utils';
import { parseSha256DigestV1, type Sha256DigestV1 } from '../../../src/aci/official-aci-digests.js';
import type {
  OfficialAciR2AProvenanceDigestFactoryPort,
  ProductionVerifiedModelProvenanceDecisionPreimageV1,
} from '../../../src/ports.js';

export interface DeterministicOfficialAciR2AOutputs {
  readonly productionProvenanceDecision: string;
}

// Deterministic 3A.1 slice of the R2A digest factory. Parses its configured outputs through the
// public strict Sha256DigestV1 parser (never `as`), records the exact input received and the
// canonical preimage constructed, and returns the pre-parsed output. It is not a production factory
// and never recomputes a signed-domain digest.
export class DeterministicOfficialAciR2ADigestFactory implements OfficialAciR2AProvenanceDigestFactoryPort {
  readonly provenanceDecisionCalls: {
    readonly preimage: ProductionVerifiedModelProvenanceDecisionPreimageV1;
    readonly canonicalPreimage: string;
  }[] = [];

  private readonly productionProvenanceDecision: Sha256DigestV1;

  constructor(outputs: DeterministicOfficialAciR2AOutputs) {
    this.productionProvenanceDecision = parseSha256DigestV1(outputs.productionProvenanceDecision);
  }

  mintProductionProvenanceDecision(
    preimage: ProductionVerifiedModelProvenanceDecisionPreimageV1,
  ): Sha256DigestV1 {
    this.provenanceDecisionCalls.push({ preimage, canonicalPreimage: canonicalJson(preimage) });
    return this.productionProvenanceDecision;
  }
}
