// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { loadCorpusFile } from '../src/commands/ingest.js';

describe('loadCorpusFile', () => {
  it('loads examples/corpus.json with facts and themes', () => {
    const corpus = loadCorpusFile(
      new URL('../../../examples/corpus.json', import.meta.url).pathname,
    );
    expect(corpus.records.facts.length).toBeGreaterThan(0);
    expect(corpus.themes?.[0]?.name).toBe('Postgres vs Memgraph');
  });

  it('rejects fixtures without records.facts', () => {
    expect(() => loadCorpusFile('/does/not/exist.json')).toThrow();
  });
});
