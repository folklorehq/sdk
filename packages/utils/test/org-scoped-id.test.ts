// SPDX-License-Identifier: Apache-2.0
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveOrgScopedId } from '../src/index.js';

const ORG = '99999999-9999-4999-8999-999999999999';
const OTHER_ORG = '88888888-8888-4888-8888-888888888888';
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function legacyThemeId(orgId: string, key: string): string {
  const h = createHash('sha256').update(`${orgId}:${key}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

describe('deriveOrgScopedId', () => {
  it('keeps every id already minted for a theme or aggregate', () => {
    for (const key of ['container-1', 'aggregate:abc', '2026-W12|team']) {
      expect(deriveOrgScopedId(ORG, key)).toBe(legacyThemeId(ORG, key));
    }
  });

  it('is uuid-shaped, stable per key, and separate per org', () => {
    expect(deriveOrgScopedId(ORG, 'k')).toMatch(UUID_SHAPE);
    expect(deriveOrgScopedId(ORG, 'k')).toBe(deriveOrgScopedId(ORG, 'k'));
    expect(deriveOrgScopedId(ORG, 'k')).not.toBe(deriveOrgScopedId(OTHER_ORG, 'k'));
    expect(deriveOrgScopedId(ORG, 'k')).not.toBe(deriveOrgScopedId(ORG, 'other'));
  });
});
