// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  codebaseRepositoryPageQuerySchema,
  codebaseSelectionRequestSchema,
  codebaseSelectionResponseSchema,
} from '../src/codebase-settings.js';

describe('codebase settings contracts', () => {
  it('accepts only bounded opaque repository pagination input', () => {
    expect(
      codebaseRepositoryPageQuerySchema.safeParse({
        cursor: 'eyJvZmZzZXQiOjEwMH0',
        query: 'docs',
      }).success,
    ).toBe(true);
    expect(codebaseRepositoryPageQuerySchema.safeParse({ cursor: 'opaque' }).success).toBe(false);
    expect(codebaseRepositoryPageQuerySchema.safeParse({ cursor: 'x'.repeat(513) }).success).toBe(
      false,
    );
    expect(codebaseRepositoryPageQuerySchema.safeParse({ query: '' }).success).toBe(false);
  });

  it('requires a revision for both all and selected writes', () => {
    expect(codebaseSelectionRequestSchema.safeParse({ mode: 'all' }).success).toBe(false);
    expect(
      codebaseSelectionRequestSchema.safeParse({ mode: 'selected', repositoryIds: [1] }).success,
    ).toBe(false);
    expect(
      codebaseSelectionRequestSchema.safeParse({
        mode: 'selected',
        expectedRevision: 2,
        repositoryIds: [1, 1],
      }).success,
    ).toBe(false);
  });

  it('keeps selection responses ID-only and bounded', () => {
    expect(
      codebaseSelectionResponseSchema.safeParse({ mode: 'all', revision: 0, repositoryIds: [] })
        .success,
    ).toBe(true);
    expect(
      codebaseSelectionResponseSchema.safeParse({
        mode: 'selected',
        revision: 1,
        repositoryIds: [1],
        fullName: 'acme/private',
      }).success,
    ).toBe(false);
  });
});
