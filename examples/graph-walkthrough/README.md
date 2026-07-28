# Graph walkthrough

Minimal steps for exploring the `ThemeGraph` port against local Postgres + Apache AGE.

## Prerequisites

- Docker (for Postgres with AGE — see `deploy/docker/docker-compose.yml`)
- A built SDK checkout (`pnpm install && pnpm build`)

## Steps

1. Start local services:

   ```bash
   docker compose -f deploy/docker/docker-compose.yml up -d
   ```

2. Scaffold config and apply schema (relational tables + AGE graph):

   ```bash
   pnpm exec folklore init --migrate
   ```

3. Load the sample corpus (relational tables + Apache AGE graph nodes):

   ```bash
   pnpm exec folklore ingest --fixture examples/corpus.json
   ```

4. In application code, construct a graph adapter:

   ```typescript
   import postgres from 'postgres';
   import { LocalThemeGraph } from '@folklore/graph';

   const sql = postgres(process.env.DATABASE_URL!);
   const graph = new LocalThemeGraph(sql);
   await graph.upsertThemeNode(themeId, orgId, 'Postgres vs Memgraph');
   ```

`LocalThemeGraph` uses the same Cypher queries as production `AgeThemeGraph`, but runs through a
plain `postgres` client instead of Drizzle — suitable for the public SDK without `tenant-db`.

See `packages/graph/src/schema/local-graph.sql` for the AGE graph name and labels used in local dev.
