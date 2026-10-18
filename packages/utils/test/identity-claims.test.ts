// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { partitionSourceIdentityClaims } from '../src/identity-claims.js';

const claim = (
  orgId: string,
  kind: string,
  sourceUserId: string,
  id = `${kind}-${sourceUserId}`,
) => ({
  id,
  orgId,
  kind,
  sourceUserId,
});

describe('partitionSourceIdentityClaims', () => {
  it('keeps one claim per source identity unambiguous', () => {
    const claims = [claim('o', 'jira', 'a'), claim('o', 'jira', 'b'), claim('o', 'github', 'a')];

    const { unambiguous, ambiguous } = partitionSourceIdentityClaims(claims);

    expect(unambiguous).toEqual(claims);
    expect(ambiguous).toEqual([]);
  });

  it('holds back every competing claim on one source identity as one group', () => {
    const first = claim('o', 'jira', 'a', 'link-1');
    const second = claim('o', 'jira', 'a', 'link-2');
    const lone = claim('o', 'jira', 'b');

    const { unambiguous, ambiguous } = partitionSourceIdentityClaims([first, lone, second]);

    expect(unambiguous).toEqual([lone]);
    expect(ambiguous).toEqual([[first, second]]);
  });

  it('does not let kind and user id boundaries collide', () => {
    const left = claim('o', 'a:b', 'c');
    const right = claim('o', 'a', 'b:c');

    const { unambiguous, ambiguous } = partitionSourceIdentityClaims([left, right]);

    expect(unambiguous).toEqual([left, right]);
    expect(ambiguous).toEqual([]);
  });

  it('does not let org and kind boundaries collide', () => {
    const left = claim('o:j', 'ira', 'a');
    const right = claim('o', 'j:ira', 'a');

    expect(partitionSourceIdentityClaims([left, right]).ambiguous).toEqual([]);
  });

  it('separates the same kind and user in two orgs', () => {
    const { unambiguous } = partitionSourceIdentityClaims([
      claim('o1', 'jira', 'a'),
      claim('o2', 'jira', 'a'),
    ]);

    expect(unambiguous).toHaveLength(2);
  });

  it('returns two empty lists for no claims', () => {
    expect(partitionSourceIdentityClaims([])).toEqual({ unambiguous: [], ambiguous: [] });
  });
});
