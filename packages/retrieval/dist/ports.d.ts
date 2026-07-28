import type { AudienceAccess, SensitivityLevel } from './sensitivity.js';
export interface RetrievedFact {
    id: string;
    kind: string;
    occurredAt: Date;
    sourceId: string;
    distance: number;
    snippet?: string;
}
export interface FactSearchParams {
    orgId: string;
    userId: string;
    query: string;
    limit: number;
}
export interface FactRetriever {
    search(params: FactSearchParams): Promise<RetrievedFact[]>;
}
export interface FactMetadata {
    id: string;
    kind: string;
    sourceId: string;
    sourceKind: string;
    occurredAt: Date;
    bodyRef: string | null;
    sensitivityLevel: SensitivityLevel;
}
export interface RetrieverDeps {
    loadFactMetadata: (orgId: string, factIds: string[]) => Promise<FactMetadata[]>;
    resolveAudienceAccess: (orgId: string, userId: string) => Promise<AudienceAccess>;
}
export type RetrieverFactory = (deps: RetrieverDeps) => FactRetriever;
//# sourceMappingURL=ports.d.ts.map