// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import {
  exportDueMessageSchema,
  exportCompleteSignalSchema,
  wikiExportTargetKindSchema,
} from '../src/enclave.js';
import { projectedPageSchema } from '../src/wiki-export.js';

describe('exportDueMessageSchema', () => {
  it('parses an ids-only content-free signal', () => {
    const parsed = exportDueMessageSchema.parse({
      type: 'export-due',
      tenant_id: 'org-1',
      themeId: 'theme-1',
      targetId: 'target-1',
      kind: 'notion',
    });
    expect(parsed).toEqual({
      type: 'export-due',
      tenant_id: 'org-1',
      themeId: 'theme-1',
      targetId: 'target-1',
      kind: 'notion',
    });
  });

  it('rejects a smuggled token or prose field (strict, defense-in-depth)', () => {
    const result = exportDueMessageSchema.safeParse({
      type: 'export-due',
      tenant_id: 'org-1',
      themeId: 'theme-1',
      targetId: 'target-1',
      kind: 'notion',
      token: 'should-be-rejected',
      body: 'prose',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown destination kind', () => {
    expect(
      exportDueMessageSchema.safeParse({
        type: 'export-due',
        tenant_id: 'o',
        themeId: 't',
        targetId: 'g',
        kind: 'dropbox',
      }).success,
    ).toBe(false);
  });
});

describe('exportCompleteSignalSchema', () => {
  it('accepts a metadata-only completion signal', () => {
    const parsed = exportCompleteSignalSchema.parse({
      type: 'export-complete',
      orgId: 'org-1',
      targetId: 'target-1',
      externalWorkspaceRef: 'ws',
      externalPageRef: 'page',
      contentHash: 'h',
      exportedAt: new Date().toISOString(),
    });
    expect(parsed.externalPageRef).toBe('page');
  });
});

describe('projectedPageSchema', () => {
  it('validates a projected page with portable blocks', () => {
    const parsed = projectedPageSchema.parse({
      themeId: 't',
      title: 'T',
      ceiling: 'public',
      acknowledgedAbovePublic: false,
      blocks: [
        { kind: 'markdown', markdown: 'x' },
        { kind: 'table', columns: ['a'], rows: [['1']] },
      ],
      contentHash: 'h',
    });
    expect(parsed.blocks).toHaveLength(2);
  });
});

describe('wikiExportTargetKindSchema', () => {
  it('admits only notion and clickup', () => {
    expect(wikiExportTargetKindSchema.options).toEqual(['notion', 'clickup']);
  });
});
