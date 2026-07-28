import postgres from 'postgres';
export declare const LOCAL_AGE_SEARCH_PATH = "ag_catalog, \"$user\", public";
export declare function createAgePostgresClient(url: string, max?: number): postgres.Sql;
//# sourceMappingURL=local-postgres.d.ts.map