// SPDX-License-Identifier: Apache-2.0
import type postgres from 'postgres';
import type { CypherRunner } from './cypher-runner.js';

const GRAPH = 'folklore';

export async function ensureAgeGraph(sql: postgres.Sql): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS age`;
  await sql.unsafe(`LOAD 'age'`);
  const existing = await sql`
    SELECT 1 AS ok FROM ag_catalog.ag_graph WHERE name = ${GRAPH}
  `;
  if (existing.length === 0) {
    await sql.unsafe(`SELECT ag_catalog.create_graph('${GRAPH}')`);
  }
}

export type { CypherRunner };
