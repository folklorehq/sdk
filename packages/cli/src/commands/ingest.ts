// SPDX-License-Identifier: Apache-2.0
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { NormalizedFact, NormalizedRecords } from '@folklore/connectors';
import { LocalThemeGraph, createAgePostgresClient, ensureAgeGraph } from '@folklore/graph';
import { StubInferenceBackend } from '@folklore/inference';
import { LocalFactStore, migrateLocalDatabase } from '@folklore/local-db';
import { MemoryVectorIndex, saveVectorIndex } from '@folklore/retrieval';
import { deterministicUuid } from '@folklore/utils';
import { syncIngestedCorpusToGraph } from './ingest-graph.js';
import { readProjectConfig, type FolkloreInitConfig } from './init.js';

export interface CorpusFile {
  records: NormalizedRecords;
  themes?: Array<{ name: string; factSourceIds: string[] }>;
}

export interface IngestResult {
  factCount: number;
  containerCount: number;
  themeCount: number;
  indexPath: string;
}

export function corpusThemes(corpus: CorpusFile): Array<{ name: string; factSourceIds: string[] }> {
  if (corpus.themes?.length) return corpus.themes;
  const nested = (
    corpus.records as NormalizedRecords & {
      themes?: Array<{ name: string; factSourceIds: string[] }>;
    }
  ).themes;
  return nested ?? [];
}

export function loadCorpusFile(fixturePath: string): CorpusFile {
  const abs = resolve(fixturePath);
  const parsed = JSON.parse(readFileSync(abs, 'utf8')) as CorpusFile;
  if (!parsed.records?.facts) {
    throw new Error('corpus fixture missing records.facts');
  }
  return parsed;
}

function reviveFact(fact: NormalizedFact): NormalizedFact {
  return {
    ...fact,
    occurredAt: new Date(fact.occurredAt),
  };
}

export async function runIngest(options: {
  cwd: string;
  fixturePath: string;
  config?: FolkloreInitConfig;
}): Promise<IngestResult> {
  const config = options.config ?? readProjectConfig(options.cwd);
  const corpus = loadCorpusFile(options.fixturePath);
  await migrateLocalDatabase(config.databaseUrl);

  const store = new LocalFactStore(config.databaseUrl);
  const graphSql = createAgePostgresClient(config.databaseUrl);
  const graph = new LocalThemeGraph(graphSql);
  const index = new MemoryVectorIndex();
  const inference = new StubInferenceBackend();

  try {
    await store.ensureOrg(config.orgId);
    await ensureAgeGraph(graphSql);
    const userId = config.userId ?? deterministicUuid(config.orgId, 'default-user');
    await store.ensureUser(config.orgId, userId, 'Local Developer');

    for (const container of corpus.records.containers ?? []) {
      await store.upsertContainer({
        orgId: config.orgId,
        sourceContainerId: container.sourceContainerId,
        label: container.label,
      });
    }

    for (const rawFact of corpus.records.facts) {
      const fact = reviveFact(rawFact);
      const body = fact.content?.body;
      if (!body) continue;
      const factId = await store.upsertFact({
        orgId: config.orgId,
        sourceFactId: fact.sourceFactId,
        kind: fact.kind,
        occurredAt: fact.occurredAt,
        body,
        containerSourceIds: fact.containerRefs,
      });
      const vector = await inference.embed(body);
      index.insert(factId, vector);
    }

    const resolvedThemes = corpusThemes(corpus);
    const themes =
      resolvedThemes.length > 0
        ? resolvedThemes
        : [
            {
              name: 'Imported corpus',
              factSourceIds: corpus.records.facts.map((f) => f.sourceFactId),
            },
          ];

    for (const theme of themes) {
      await store.upsertTheme({
        orgId: config.orgId,
        name: theme.name,
        factSourceIds: theme.factSourceIds,
      });
    }

    const revivedFacts = corpus.records.facts.map(reviveFact);
    await syncIngestedCorpusToGraph({
      graph,
      orgId: config.orgId,
      facts: revivedFacts,
      containers: (corpus.records.containers ?? []).map((c) => ({
        sourceContainerId: c.sourceContainerId,
        label: c.label,
      })),
      themes,
    });

    const indexPath = resolve(options.cwd, config.indexPath ?? '.folklore/vector-index.json');
    saveVectorIndex(indexPath, index);

    return {
      factCount: corpus.records.facts.length,
      containerCount: corpus.records.containers?.length ?? 0,
      themeCount: await store.countThemes(config.orgId),
      indexPath,
    };
  } finally {
    await store.close();
    await graphSql.end();
  }
}
