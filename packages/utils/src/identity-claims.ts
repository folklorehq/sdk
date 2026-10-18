// SPDX-License-Identifier: Apache-2.0
import { groupBy } from './collection.js';

export interface SourceIdentityClaim {
  readonly orgId: string;
  readonly kind: string;
  readonly sourceUserId: string;
}

export interface PartitionedClaims<T> {
  readonly unambiguous: T[];
  readonly ambiguous: T[][];
}

function sourceIdentityKey(claim: SourceIdentityClaim): string {
  const { orgId, kind, sourceUserId } = claim;
  return `${orgId.length}:${orgId}:${kind.length}:${kind}:${sourceUserId.length}:${sourceUserId}`;
}

/** Competing claims on one source identity are all held back; a lone claim may be applied. */
export function partitionSourceIdentityClaims<T extends SourceIdentityClaim>(
  claims: readonly T[],
): PartitionedClaims<T> {
  const unambiguous: T[] = [];
  const ambiguous: T[][] = [];
  for (const group of groupBy([...claims], sourceIdentityKey).values()) {
    const [only] = group;
    if (group.length === 1 && only) unambiguous.push(only);
    else ambiguous.push(group);
  }
  return { unambiguous, ambiguous };
}
