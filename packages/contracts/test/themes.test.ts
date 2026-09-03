// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { themeGraphNodeSchema, themeGraphResponseSchema } from '../src/themes.js';

const VALID_NODE = {
  id: 'theme-1',
  name: 'Billing v2',
  tags: ['initiative'],
  docType: 'initiative',
  isAggregate: false,
  importance: 0.8,
  factCount: 12,
  hasWiki: true,
  sources: ['github', 'slack'],
  updatedAt: '2026-06-01T00:00:00.000Z',
  ownerTeamId: null,
  ownerTeamName: 'Payments',
  ownerName: null,
  audience: 'Engineering',
};

describe('themeGraphNodeSchema', () => {
  it('parses a node with source kinds', () => {
    const parsed = themeGraphNodeSchema.parse(VALID_NODE);
    expect(parsed.sources).toEqual(['github', 'slack']);
  });

  it('parses an empty source list', () => {
    const parsed = themeGraphNodeSchema.parse({ ...VALID_NODE, sources: [] });
    expect(parsed.sources).toEqual([]);
  });

  it('rejects a node without the sources field', () => {
    expect(() => themeGraphNodeSchema.parse({ ...VALID_NODE, sources: undefined })).toThrow();
  });
});

describe('themeGraphResponseSchema', () => {
  it('parses a graph whose nodes carry sources', () => {
    const parsed = themeGraphResponseSchema.parse({
      nodes: [VALID_NODE],
      edges: [{ source: 'theme-1', target: 'theme-2', weight: 0.5 }],
      truncated: false,
    });
    expect(parsed.nodes[0]!.sources).toEqual(['github', 'slack']);
  });
});
