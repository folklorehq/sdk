// SPDX-License-Identifier: Apache-2.0
import { drizzle } from 'drizzle-orm/postgres-js';
import { createDrizzleCypherRunner } from './age-drizzle.js';
import { createAgePostgresClient } from './local-postgres.js';
import { ThemeGraphCore } from './ThemeGraphCore.js';
export class LocalThemeGraph extends ThemeGraphCore {
    constructor(sql) {
        super(createDrizzleCypherRunner(drizzle(sql)));
    }
    static fromDatabaseUrl(url) {
        const sql = createAgePostgresClient(url);
        return { graph: new LocalThemeGraph(sql), sql };
    }
}
//# sourceMappingURL=LocalThemeGraph.js.map