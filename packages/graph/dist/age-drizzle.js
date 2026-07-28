// SPDX-License-Identifier: Apache-2.0
import { sql } from 'drizzle-orm';
const GRAPH = 'folklore';
function toRows(result) {
    if (Array.isArray(result))
        return result;
    const r = result;
    return r.rows ?? [];
}
function parseAgtypeRows(rows, columns) {
    return rows.map((row) => {
        const out = {};
        for (const col of columns) {
            const raw = row[col];
            out[col] = raw != null ? JSON.parse(raw) : null;
        }
        return out;
    });
}
export function createDrizzleCypherRunner(db) {
    return {
        async run(cypher, params) {
            const p = JSON.stringify(params ?? {});
            await db.execute(sql `SELECT * FROM ag_catalog.cypher(${sql.raw(`'${GRAPH}'`)}, $$ ${sql.raw(cypher)} $$, ${p}::ag_catalog.agtype) AS (result ag_catalog.agtype)`);
        },
        async query(cypher, columns, params) {
            const p = JSON.stringify(params ?? {});
            const colDefs = columns.map((c) => `"${c}" ag_catalog.agtype`).join(', ');
            const result = await db.execute(sql `SELECT * FROM ag_catalog.cypher(${sql.raw(`'${GRAPH}'`)}, $$ ${sql.raw(cypher)} $$, ${p}::ag_catalog.agtype) AS (${sql.raw(colDefs)})`);
            return parseAgtypeRows(toRows(result), columns);
        },
    };
}
//# sourceMappingURL=age-drizzle.js.map