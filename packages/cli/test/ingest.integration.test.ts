// SPDX-License-Identifier: Apache-2.0
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalThemeGraph, createAgePostgresClient } from '@folklore/graph';
import { deterministicUuid } from '@folklore/utils';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runIngest } from '../src/commands/ingest.js';
import { initProject, readProjectConfig } from '../src/commands/init.js';
import { runQuery } from '../src/commands/query.js';

const DATABASE_URL = process.env.DATABASE_URL;

describe.runIf(DATABASE_URL)('folklore ingest + query (integration)', () => {
  let workDir: string;

  beforeAll(() => {
    workDir = mkdtempSync(join(tmpdir(), 'folklore-cli-'));
    initProject(workDir);
  });

  afterAll(() => {
    rmSync(workDir, { recursive: true, force: true });
  });

  it('loads corpus into Postgres, graph, and returns query hits', async () => {
    const fixture = new URL('../../../examples/corpus.json', import.meta.url).pathname;
    const ingest = await runIngest({ cwd: workDir, fixturePath: fixture });
    expect(ingest.factCount).toBe(4);
    expect(ingest.themeCount).toBe(1);

    const config = readProjectConfig(workDir);
    const sql = createAgePostgresClient(DATABASE_URL as string);
    const graph = new LocalThemeGraph(sql);
    try {
      const themeId = deterministicUuid(config.orgId, 'theme:Postgres vs Memgraph');
      const facts = await graph.getFactsForTheme(themeId, config.orgId);
      expect(facts.length).toBe(4);
    } finally {
      await sql.end();
    }

    const query = await runQuery({
      cwd: workDir,
      query: 'why did we pick Postgres over Memgraph',
      limit: 3,
    });
    expect(query.hits.length).toBeGreaterThan(0);
    expect(query.hits[0]?.snippet).toBeTruthy();
  });
});
