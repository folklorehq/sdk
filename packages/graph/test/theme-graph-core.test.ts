// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { ThemeGraphCore } from '../src/theme-graph-core.js';

describe('ThemeGraphCore', () => {
  it('linkFactToTheme issues MERGE cypher with score param', async () => {
    const run = vi.fn(async () => undefined);
    const graph = new ThemeGraphCore({ run, query: vi.fn(async () => []) });

    await graph.linkFactToTheme('fact-1', 'theme-1', 0.8, 'org-1');

    expect(run).toHaveBeenCalledOnce();
    const [cypher, params] = run.mock.calls[0]!;
    expect(cypher).toContain('SCORED_FOR');
    expect(params).toEqual({ factId: 'fact-1', themeId: 'theme-1', score: 0.8, orgId: 'org-1' });
  });
});
