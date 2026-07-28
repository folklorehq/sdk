import type { InferenceBackend } from '@folklore/inference';
import { type AudienceAccess } from './sensitivity.js';
import type { FactRetriever, FactSearchParams, RetrievedFact } from './ports.js';
import { MemoryVectorIndex } from './memory-index.js';
export interface LocalFactBodyLoader {
    loadBodies(orgId: string, factIds: string[]): Promise<Map<string, string>>;
}
export interface LocalFactMetadataLoader {
    loadMetadata(orgId: string, factIds: string[]): Promise<Array<{
        id: string;
        kind: string;
        sourceId: string;
        occurredAt: Date;
        sensitivityLevel: AudienceAccess['maxSensitivity'];
    }>>;
}
export interface LocalFactRetrieverDeps {
    index: MemoryVectorIndex;
    inference: InferenceBackend;
    loadMetadata: LocalFactMetadataLoader['loadMetadata'];
    loadBodies: LocalFactBodyLoader['loadBodies'];
    resolveAudienceAccess: (orgId: string, userId: string) => Promise<AudienceAccess>;
}
export declare class LocalFactRetriever implements FactRetriever {
    private readonly deps;
    constructor(deps: LocalFactRetrieverDeps);
    search(params: FactSearchParams): Promise<RetrievedFact[]>;
}
//# sourceMappingURL=local-retriever.d.ts.map