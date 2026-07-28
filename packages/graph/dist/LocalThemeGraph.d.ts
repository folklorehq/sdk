import type postgres from 'postgres';
import { ThemeGraphCore } from './ThemeGraphCore.js';
export declare class LocalThemeGraph extends ThemeGraphCore {
    constructor(sql: postgres.Sql);
    static fromDatabaseUrl(url: string): {
        graph: LocalThemeGraph;
        sql: postgres.Sql;
    };
}
//# sourceMappingURL=LocalThemeGraph.d.ts.map