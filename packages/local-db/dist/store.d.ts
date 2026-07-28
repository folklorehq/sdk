export type LocalSensitivityLevel = 'public' | 'team_scoped' | 'restricted' | 'confidential';
export interface LocalFactRecord {
    id: string;
    kind: string;
    sourceId: string;
    sourceKind: string;
    occurredAt: Date;
    sensitivityLevel: LocalSensitivityLevel;
}
export interface LocalFactInput {
    orgId: string;
    sourceFactId: string;
    kind: string;
    occurredAt: Date;
    body: string;
    sensitivityLevel?: LocalSensitivityLevel;
    sourceId?: string;
    containerSourceIds?: string[];
}
export interface LocalContainerInput {
    orgId: string;
    sourceContainerId: string;
    label: string;
}
export interface LocalThemeInput {
    orgId: string;
    name: string;
    factSourceIds: string[];
}
export declare class LocalFactStore {
    private readonly sql;
    constructor(databaseUrl: string);
    close(): Promise<void>;
    ensureOrg(orgId: string, name?: string): Promise<void>;
    ensureUser(orgId: string, userId: string, displayName: string): Promise<void>;
    upsertContainer(input: LocalContainerInput): Promise<string>;
    upsertFact(input: LocalFactInput): Promise<string>;
    upsertTheme(input: LocalThemeInput): Promise<string>;
    loadFactMetadata(orgId: string, factIds: string[]): Promise<LocalFactRecord[]>;
    loadFactBodies(orgId: string, factIds: string[]): Promise<Map<string, string>>;
    countThemes(orgId: string): Promise<number>;
}
//# sourceMappingURL=store.d.ts.map