import { isSensitivityWithin } from './sensitivity.js';
export class LocalFactRetriever {
    deps;
    constructor(deps) {
        this.deps = deps;
    }
    async search(params) {
        const queryVector = await this.deps.inference.embed(params.query);
        const hits = this.deps.index.search(queryVector, params.limit);
        const factIds = hits.map((hit) => hit.factId);
        const access = await this.deps.resolveAudienceAccess(params.orgId, params.userId);
        const metadata = await this.deps.loadMetadata(params.orgId, factIds);
        const visibleIds = metadata
            .filter((row) => isSensitivityWithin(row.sensitivityLevel, access.maxSensitivity))
            .map((row) => row.id);
        const bodies = await this.deps.loadBodies(params.orgId, visibleIds);
        const metaById = new Map(metadata.map((row) => [row.id, row]));
        return hits
            .filter((hit) => visibleIds.includes(hit.factId))
            .map((hit) => {
            const meta = metaById.get(hit.factId);
            return {
                id: hit.factId,
                kind: meta.kind,
                occurredAt: meta.occurredAt,
                sourceId: meta.sourceId,
                distance: 1 - hit.score,
                snippet: bodies.get(hit.factId),
            };
        });
    }
}
//# sourceMappingURL=LocalFactRetriever.js.map