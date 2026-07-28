// SPDX-License-Identifier: Apache-2.0
import { sql } from 'drizzle-orm';
import type { CypherRunner } from './cypher-runner.js';

const GRAPH = 'folklore';

function toRows(result: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(result)) return result as Array<Record<string, unknown>>;
  const r = result as { rows?: Array<Record<string, unknown>> };
  return r.rows ?? [];
}

function parseAgtypeRows<T extends Record<string, unknown>>(
  rows: Array<Record<string, unknown>>,
  columns: string[],
): T[] {
  return rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const col of columns) {
      const raw = row[col] as string;
      out[col] = raw != null ? (JSON.parse(raw) as unknown) : null;
    }
    return out as T;
  });
}

export function createDrizzleCypherRunner(db: {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>;
}): CypherRunner {
  return {
    async run(cypher, params) {
      const p = JSON.stringify(params ?? {});
      await db.execute(
        sql`SELECT * FROM ag_catalog.cypher(${sql.raw(`'${GRAPH}'`)}, $$ ${sql.raw(cypher)} $$, ${p}::ag_catalog.agtype) AS (result ag_catalog.agtype)`,
      );
    },
    async query(cypher, columns, params) {
      const p = JSON.stringify(params ?? {});
      const colDefs = columns.map((c) => `"${c}" ag_catalog.agtype`).join(', ');
      const result = await db.execute(
        sql`SELECT * FROM ag_catalog.cypher(${sql.raw(`'${GRAPH}'`)}, $$ ${sql.raw(cypher)} $$, ${p}::ag_catalog.agtype) AS (${sql.raw(colDefs)})`,
      );
      return parseAgtypeRows(toRows(result), columns);
    },
  };
}
