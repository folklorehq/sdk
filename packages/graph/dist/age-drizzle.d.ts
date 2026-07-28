import { sql } from 'drizzle-orm';
import type { CypherRunner } from './cypher-runner.js';
export declare function createDrizzleCypherRunner(db: {
    execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
}): CypherRunner;
//# sourceMappingURL=age-drizzle.d.ts.map