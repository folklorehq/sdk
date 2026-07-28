/** ThemeGraph port — the contract for writing and querying graph edges between Facts/Containers and Themes (ADL #8, #46). */
export interface ThemeGraph {
    /** Record a scored edge from a Fact to a Theme; idempotent — re-ingesting refreshes the score rather than duplicating it. */
    linkFactToTheme(factId: string, themeId: string, score: number, orgId: string): Promise<void>;
    /** Record a directed relationship between two Themes; idempotent per (fromThemeId, toThemeId, relationshipType) triple. */
    relateThemes(fromThemeId: string, toThemeId: string, confidence: number, relationshipType: string, orgId: string): Promise<void>;
    /** Write or refresh the GROUPED_INTO shortcut edge; only written when ≥90% of the Container's Facts point to the same Theme (ADL #8). */
    setContainerGrouping(containerId: string, themeId: string, confidence: number): Promise<void>;
    /** Return the top Themes for a given Fact, ordered by edge score descending (default limit 10). */
    getFactThemes(factId: string, orgId: string, limit?: number): Promise<Array<{
        themeId: string;
        score: number;
    }>>;
    /** Create or refresh a Theme node's name/description when synthesizing an aggregate theme (ADL #46 — replaces the Initiative tier). */
    upsertThemeNode(themeId: string, orgId: string, name: string, description?: string): Promise<void>;
    /** Record a PART_OF edge from a child Theme to a parent Theme; idempotent — refreshes the weight on each call. */
    linkThemeToParent(childThemeId: string, parentThemeId: string, weight: number): Promise<void>;
    /** Create or refresh a Fact node with its occurrence timestamp. */
    upsertFactNode(factId: string, orgId: string, occurredAt: Date): Promise<void>;
    /** Create or refresh a Container node with its display label. */
    upsertContainerNode(containerId: string, orgId: string, label: string): Promise<void>;
    /** Record a BELONGS_TO edge from a Fact to its parent Container. */
    linkFactToContainer(factId: string, containerId: string): Promise<void>;
    /** Return Themes related to the given Theme via RELATED_TO edges, ordered by similarity descending (default 10). */
    getRelatedThemes(themeId: string, orgId: string, limit?: number): Promise<Array<{
        themeId: string;
        similarity: number;
    }>>;
    /** Return all parent (aggregate) Themes that the given Theme is PART_OF. */
    getParentThemes(themeId: string, orgId: string): Promise<Array<{
        parentThemeId: string;
        weight: number;
    }>>;
    /** Return child Themes that are PART_OF the given aggregate Theme (reverse PART_OF), by weight. */
    getChildThemes(themeId: string, orgId: string, limit?: number): Promise<Array<{
        childThemeId: string;
        weight: number;
    }>>;
    /** Return Facts that have a SCORED_FOR edge to the given Theme, ordered by score descending (default 50). */
    getFactsForTheme(themeId: string, orgId: string, limit?: number): Promise<Array<{
        factId: string;
        score: number;
    }>>;
    /** ADL #56 Stage B — re-point every edge on a merged loser Theme onto the winner; idempotent. */
    mergeThemeEdges(loserThemeId: string, winnerThemeId: string, orgId: string): Promise<void>;
}
//# sourceMappingURL=ports.d.ts.map