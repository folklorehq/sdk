// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { factListQuerySchema, factSourceKindSchema } from '../src/facts.js';

describe('facts contracts', () => {
  it('accepts every registered connector kind in fact queries', () => {
    const registeredKinds = [
      'github',
      'slack',
      'linear',
      'jira',
      'confluence',
      'notion',
      'intercom',
      'meeting',
      'email',
      'google_drive',
      'microsoft365',
      'zoom_bot',
      'zoom',
      'gmail',
      'microsoft365_mail',
      'google_calendar',
      'microsoft365_calendar',
      'code',
    ] as const;

    expect(factSourceKindSchema.options).toEqual(expect.arrayContaining(registeredKinds));
    for (const sourceKind of registeredKinds) {
      expect(factListQuerySchema.parse({ sourceKind }).sourceKind).toBe(sourceKind);
    }
  });
});
