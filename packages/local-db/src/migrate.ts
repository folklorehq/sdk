// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const MIGRATIONS = ['001_local_baseline.sql', '002_age_graph.sql'] as const;

export async function migrateLocalDatabase(databaseUrl: string): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    for (const name of MIGRATIONS) {
      const here = dirname(fileURLToPath(import.meta.url));
      const ddl = readFileSync(join(here, 'migrations', name), 'utf8');
      await sql.unsafe(ddl);

      if (name === '001_local_baseline.sql') {
        await sql`
          INSERT INTO local_migrations (name)
          VALUES (${name})
          ON CONFLICT (name) DO NOTHING
        `;
        continue;
      }

      const applied = await sql`
        SELECT 1 AS ok FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'local_migrations'
      `;
      if (applied.length > 0) {
        await sql`
          INSERT INTO local_migrations (name)
          VALUES (${name})
          ON CONFLICT (name) DO NOTHING
        `;
      }
    }
  } finally {
    await sql.end();
  }
}
