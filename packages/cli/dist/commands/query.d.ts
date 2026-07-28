export interface QueryResult {
    query: string;
    hits: Array<{
        id: string;
        kind: string;
        distance: number;
        snippet?: string;
    }>;
}
export declare function runQuery(options: {
    cwd: string;
    query: string;
    limit?: number;
}): Promise<QueryResult>;
//# sourceMappingURL=query.d.ts.map