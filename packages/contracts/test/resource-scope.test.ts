// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  RESOURCE_SCOPE_MAX_SELECTED,
  isPausableSourceKind,
  resourceScopeUnitFor,
  RESOURCE_SCOPE_UNITS,
  resourceScopePausedRequestSchema,
  resourceScopeRequestSchema,
  resourceScopeResponseSchema,
  resourceScopeUnitSchema,
  scopeResourcePageQuerySchema,
  scopeResourcePageSchema,
} from '../src/connectors/index.js';

const ids = (count: number): string[] => Array.from({ length: count }, (_, i) => `C${i}`);

describe('resourceScopeUnitSchema', () => {
  it.each(RESOURCE_SCOPE_UNITS)('accepts %s', (unit) => {
    expect(resourceScopeUnitSchema.safeParse(unit).success).toBe(true);
  });

  it('refuses an unknown unit', () => {
    expect(resourceScopeUnitSchema.safeParse('workspace').success).toBe(false);
  });
});

describe('resourceScopeRequestSchema', () => {
  it('accepts mode all with a revision', () => {
    expect(resourceScopeRequestSchema.safeParse({ mode: 'all', expectedRevision: 0 }).success).toBe(
      true,
    );
  });

  it('refuses mode all carrying resourceIds', () => {
    const result = resourceScopeRequestSchema.safeParse({
      mode: 'all',
      expectedRevision: 0,
      resourceIds: ['C1'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts one selected id', () => {
    const result = resourceScopeRequestSchema.safeParse({
      mode: 'selected',
      expectedRevision: 3,
      resourceIds: ['C1'],
    });
    expect(result.success).toBe(true);
  });

  it('refuses zero selected ids', () => {
    const result = resourceScopeRequestSchema.safeParse({
      mode: 'selected',
      expectedRevision: 0,
      resourceIds: [],
    });
    expect(result.success).toBe(false);
  });

  it('accepts exactly the maximum and refuses one more', () => {
    const at = {
      mode: 'selected',
      expectedRevision: 0,
      resourceIds: ids(RESOURCE_SCOPE_MAX_SELECTED),
    };
    expect(RESOURCE_SCOPE_MAX_SELECTED).toBe(500);
    expect(resourceScopeRequestSchema.safeParse(at).success).toBe(true);
    const over = { ...at, resourceIds: ids(501) };
    expect(resourceScopeRequestSchema.safeParse(over).success).toBe(false);
  });

  it('refuses an empty or oversized id', () => {
    const base = { mode: 'selected', expectedRevision: 0 };
    expect(resourceScopeRequestSchema.safeParse({ ...base, resourceIds: [''] }).success).toBe(
      false,
    );
    expect(
      resourceScopeRequestSchema.safeParse({ ...base, resourceIds: ['x'.repeat(257)] }).success,
    ).toBe(false);
  });

  it('refuses a negative or fractional revision', () => {
    expect(
      resourceScopeRequestSchema.safeParse({ mode: 'all', expectedRevision: -1 }).success,
    ).toBe(false);
    expect(
      resourceScopeRequestSchema.safeParse({ mode: 'all', expectedRevision: 1.5 }).success,
    ).toBe(false);
  });

  it('refuses an unknown mode and an extra key', () => {
    expect(
      resourceScopeRequestSchema.safeParse({ mode: 'none', expectedRevision: 0 }).success,
    ).toBe(false);
    expect(
      resourceScopeRequestSchema.safeParse({
        mode: 'selected',
        expectedRevision: 0,
        resourceIds: ['C1'],
        extra: 1,
      }).success,
    ).toBe(false);
  });
});

describe('resourceScopePausedRequestSchema', () => {
  it('accepts a paused flag with a revision', () => {
    expect(
      resourceScopePausedRequestSchema.safeParse({ paused: true, expectedRevision: 2 }).success,
    ).toBe(true);
  });

  it('refuses a missing flag, a missing revision and an extra key', () => {
    expect(resourceScopePausedRequestSchema.safeParse({ expectedRevision: 2 }).success).toBe(false);
    expect(resourceScopePausedRequestSchema.safeParse({ paused: true }).success).toBe(false);
    expect(
      resourceScopePausedRequestSchema.safeParse({
        paused: true,
        expectedRevision: 2,
        mode: 'all',
      }).success,
    ).toBe(false);
  });

  it('refuses a non-boolean flag', () => {
    expect(
      resourceScopePausedRequestSchema.safeParse({ paused: 'yes', expectedRevision: 2 }).success,
    ).toBe(false);
  });
});

describe('resourceScopeResponseSchema', () => {
  const valid = { revision: 1, mode: 'selected', resourceIds: ['C1'], paused: false };

  it('accepts a sealed scope view', () => {
    expect(resourceScopeResponseSchema.safeParse(valid).success).toBe(true);
  });

  it('requires paused', () => {
    const { paused: _paused, ...withoutPaused } = valid;
    expect(resourceScopeResponseSchema.safeParse(withoutPaused).success).toBe(false);
  });

  it('refuses an extra key such as a backfill state', () => {
    expect(resourceScopeResponseSchema.safeParse({ ...valid, backfill: 'owed' }).success).toBe(
      false,
    );
  });
});

describe('scope resource page schemas', () => {
  it('accepts an empty query and a bounded one', () => {
    expect(scopeResourcePageQuerySchema.safeParse({}).success).toBe(true);
    expect(
      scopeResourcePageQuerySchema.safeParse({ cursor: 'abc', query: 'x'.repeat(100) }).success,
    ).toBe(true);
  });

  it('refuses an oversized query or cursor and an extra key', () => {
    expect(scopeResourcePageQuerySchema.safeParse({ query: 'x'.repeat(101) }).success).toBe(false);
    expect(scopeResourcePageQuerySchema.safeParse({ cursor: 'x'.repeat(65) }).success).toBe(false);
    expect(scopeResourcePageQuerySchema.safeParse({ limit: 5 }).success).toBe(false);
  });

  it('accepts a page and refuses an item with an extra key', () => {
    const item = { id: 'C1', name: 'general', isPublic: true };
    expect(scopeResourcePageSchema.safeParse({ items: [item], nextCursor: null }).success).toBe(
      true,
    );
    expect(
      scopeResourcePageSchema.safeParse({ items: [{ ...item, topic: 't' }], nextCursor: null })
        .success,
    ).toBe(false);
  });
});

describe('scope eligibility by manifest', () => {
  it.each([
    ['slack', 'channel'],
    ['jira', 'project'],
    ['github', 'repository'],
  ] as const)('%s is scoped by %s', (kind, unit) => {
    expect(resourceScopeUnitFor(kind)).toBe(unit);
  });

  it.each(['notion', 'code', 'gmail', 'google_drive', 'not-a-kind'])(
    '%s has no resource scope',
    (kind) => {
      expect(resourceScopeUnitFor(kind)).toBeUndefined();
    },
  );

  it.each(['slack', 'notion', 'intercom', 'github'])('%s can be paused', (kind) => {
    expect(isPausableSourceKind(kind)).toBe(true);
  });

  it.each(['meeting', 'gmail', 'google_drive', 'not-a-kind'])('%s cannot be paused', (kind) => {
    expect(isPausableSourceKind(kind)).toBe(false);
  });
});
