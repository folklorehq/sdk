import type postgres from 'postgres';
import { ThemeGraphCore } from './theme-graph-core.js';
export declare class LocalThemeGraph extends ThemeGraphCore {
    constructor(sql: postgres.Sql);
    static fromDatabaseUrl(url: string): {
        graph: LocalThemeGraph;
        sql: postgres.Sql;
    };
}
//# sourceMappingURL=local-theme-graph.d.ts.map