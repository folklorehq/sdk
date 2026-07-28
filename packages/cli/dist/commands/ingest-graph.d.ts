import type { NormalizedFact } from '@folklore/connectors';
import type { LocalThemeGraph } from '@folklore/graph';
export declare function syncIngestedCorpusToGraph(options: {
    graph: LocalThemeGraph;
    orgId: string;
    facts: NormalizedFact[];
    containers: Array<{
        sourceContainerId: string;
        label: string;
    }>;
    themes: Array<{
        name: string;
        factSourceIds: string[];
    }>;
}): Promise<void>;
//# sourceMappingURL=ingest-graph.d.ts.map