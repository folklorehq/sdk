const GRAPH = 'folklore';
export async function ensureAgeGraph(sql) {
    await sql `CREATE EXTENSION IF NOT EXISTS age`;
    await sql.unsafe(`LOAD 'age'`);
    const existing = await sql `
    SELECT 1 AS ok FROM ag_catalog.ag_graph WHERE name = ${GRAPH}
  `;
    if (existing.length === 0) {
        await sql.unsafe(`SELECT ag_catalog.create_graph('${GRAPH}')`);
    }
}
//# sourceMappingURL=age-cypher.js.map