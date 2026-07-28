// SPDX-License-Identifier: Apache-2.0
import type { NormalizedFact } from '@folklore/connectors';
import type { LocalThemeGraph } from '@folklore/graph';
import { deterministicUuid } from '@folklore/utils';

const DEFAULT_THEME_SCORE = 1;

export async function syncIngestedCorpusToGraph(options: {
  graph: LocalThemeGraph;
  orgId: string;
  facts: NormalizedFact[];
  containers: Array<{ sourceContainerId: string; label: string }>;
  themes: Array<{ name: string; factSourceIds: string[] }>;
}): Promise<void> {
  const { graph, orgId } = options;

  for (const container of options.containers) {
    const containerId = deterministicUuid(orgId, container.sourceContainerId);
    await graph.upsertContainerNode(containerId, orgId, container.label);
  }

  for (const fact of options.facts) {
    const factId = deterministicUuid(orgId, fact.sourceFactId);
    await graph.upsertFactNode(factId, orgId, new Date(fact.occurredAt));
    for (const containerRef of fact.containerRefs ?? []) {
      const containerId = deterministicUuid(orgId, containerRef);
      await graph.linkFactToContainer(factId, containerId);
    }
  }

  for (const theme of options.themes) {
    const themeId = deterministicUuid(orgId, `theme:${theme.name}`);
    await graph.upsertThemeNode(themeId, orgId, theme.name);
    for (const sourceFactId of theme.factSourceIds) {
      const factId = deterministicUuid(orgId, sourceFactId);
      await graph.linkFactToTheme(factId, themeId, DEFAULT_THEME_SCORE, orgId);
    }
  }
}
