// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

import { digest64Schema } from '../shared.js';
import {
  PLACEMENT_IDENTITY_MAX_PROVIDER_PROOF_CHARS,
  placementIdentityMethodV1Schema,
} from './bootstrap.js';

/*
  The console asks the control plane to forward the provider identity it established at sign-in.
  The request names only the contractual method and the signer-issued challenge digest; it carries
  no identity digest, account, tenant, or caller-supplied proof, so the caller cannot select an
  identity. The response is the session's own opaque provider proof.
*/
export const placementSignInProviderProofRequestV1Schema = z
  .object({
    schema: z.literal('PlacementSignInProviderProofRequestV1'),
    version: z.literal(1),
    method: placementIdentityMethodV1Schema,
    challengeDigest: digest64Schema,
  })
  .strict();

export type PlacementSignInProviderProofRequestV1 = z.infer<
  typeof placementSignInProviderProofRequestV1Schema
>;

export const placementSignInProviderProofResponseV1Schema = z
  .object({ proof: z.string().min(1).max(PLACEMENT_IDENTITY_MAX_PROVIDER_PROOF_CHARS) })
  .strict();

export type PlacementSignInProviderProofResponseV1 = z.infer<
  typeof placementSignInProviderProofResponseV1Schema
>;

export function placementSignInProviderProofResponseV1(
  proof: string,
): PlacementSignInProviderProofResponseV1 {
  return placementSignInProviderProofResponseV1Schema.parse({ proof });
}
