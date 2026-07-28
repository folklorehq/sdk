import type { CypherRunner } from './cypher-runner.js';
import type { ThemeGraph } from './ports.js';
export declare class ThemeGraphCore implements ThemeGraph {
    private readonly cypher;
    constructor(cypher: CypherRunner);
    linkFactToTheme(factId: string, themeId: string, score: number, orgId: string): Promise<void>;
    relateThemes(fromThemeId: string, toThemeId: string, confidence: number, relationshipType: string, orgId: string): Promise<void>;
    setContainerGrouping(containerId: string, themeId: string, confidence: number): Promise<void>;
    getFactThemes(factId: string, orgId: string, limit?: number): Promise<Array<{
        themeId: string;
        score: number;
    }>>;
    upsertThemeNode(themeId: string, orgId: string, name: string, description?: string): Promise<void>;
    linkThemeToParent(childThemeId: string, parentThemeId: string, weight: number): Promise<void>;
    upsertFactNode(factId: string, orgId: string, occurredAt: Date): Promise<void>;
    upsertContainerNode(containerId: string, orgId: string, label: string): Promise<void>;
    linkFactToContainer(factId: string, containerId: string): Promise<void>;
    getRelatedThemes(themeId: string, orgId: string, limit?: number): Promise<Array<{
        themeId: string;
        similarity: number;
    }>>;
    getParentThemes(themeId: string, orgId: string): Promise<Array<{
        parentThemeId: string;
        weight: number;
    }>>;
    getChildThemes(themeId: string, orgId: string, limit?: number): Promise<Array<{
        childThemeId: string;
        weight: number;
    }>>;
    getFactsForTheme(themeId: string, orgId: string, limit?: number): Promise<Array<{
        factId: string;
        score: number;
    }>>;
    mergeThemeEdges(loserThemeId: string, winnerThemeId: string, orgId: string): Promise<void>;
    private repointFactScores;
    private repointContainerGroupings;
    private repointParentEdges;
    private repointChildEdges;
    private repointRelatedEdges;
    private markNodeMerged;
}
//# sourceMappingURL=ThemeGraphCore.d.ts.map