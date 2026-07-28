// SPDX-License-Identifier: Apache-2.0
import { drizzle } from 'drizzle-orm/postgres-js';
import type postgres from 'postgres';
import { createDrizzleCypherRunner } from './age-drizzle.js';
import { createAgePostgresClient } from './local-postgres.js';
import { ThemeGraphCore } from './ThemeGraphCore.js';

export class LocalThemeGraph extends ThemeGraphCore {
  constructor(sql: postgres.Sql) {
    super(createDrizzleCypherRunner(drizzle(sql)));
  }

  static fromDatabaseUrl(url: string): { graph: LocalThemeGraph; sql: postgres.Sql } {
    const sql = createAgePostgresClient(url);
    return { graph: new LocalThemeGraph(sql), sql };
  }
}
