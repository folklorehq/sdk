// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { syncIngestedCorpusToGraph } from '../src/commands/ingest-graph.js';

describe('syncIngestedCorpusToGraph', () => {
  it('writes container, fact, and theme graph nodes', async () => {
    const calls: string[] = [];
    const graph = {
      upsertContainerNode: async () => {
        calls.push('container');
      },
      upsertFactNode: async () => {
        calls.push('fact');
      },
      linkFactToContainer: async () => {
        calls.push('belongs');
      },
      upsertThemeNode: async () => {
        calls.push('theme');
      },
      linkFactToTheme: async () => {
        calls.push('scored');
      },
    };

    await syncIngestedCorpusToGraph({
      graph: graph as never,
      orgId: '00000000-0000-0000-0000-000000000001',
      containers: [{ sourceContainerId: 'gh:pr:1', label: 'github_pr' }],
      facts: [
        {
          sourceFactId: 'f1',
          kind: 'content',
          occurredAt: new Date('2026-01-01T00:00:00.000Z'),
          authors: [],
          containerRefs: ['gh:pr:1'],
          content: { body: 'hello', explicitLinks: [] },
          raw: {},
        },
      ],
      themes: [{ name: 'Theme A', factSourceIds: ['f1'] }],
    });

    expect(calls).toEqual(['container', 'fact', 'belongs', 'theme', 'scored']);
  });
});
