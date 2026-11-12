// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { synthesisRequestSchema } from '../src/enclave.js';

const REQUEST = {
  type: 'wiki_synthesis',
  requestId: 'r',
  themeId: 't',
  orgId: 'o',
  leaseToken: 'l',
  themeName: 'n',
  themeType: 'topic',
  parentThemeCount: 0,
  factRefs: [],
  relatedThemes: [],
  contributorCount: 0,
  audiences: [],
};

describe('batch delivery wire fields', () => {
  it('reads an absent delivery mode as absent and refuses an unknown one', () => {
    expect(synthesisRequestSchema.parse(REQUEST).deliveryMode).toBeUndefined();
    expect(synthesisRequestSchema.parse({ ...REQUEST, deliveryMode: 'batch' }).deliveryMode).toBe(
      'batch',
    );
    expect(synthesisRequestSchema.safeParse({ ...REQUEST, deliveryMode: 'bulk' }).success).toBe(
      false,
    );
  });
});
