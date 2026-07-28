// SPDX-License-Identifier: Apache-2.0
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { cosine } from '@folklore/utils';

export interface VectorEntry {
  factId: string;
  vector: number[];
}

export interface VectorSearchHit {
  factId: string;
  score: number;
}

export class MemoryVectorIndex {
  private readonly entries = new Map<string, number[]>();

  insert(factId: string, vector: number[]): void {
    this.entries.set(factId, vector);
  }

  search(query: number[], limit: number): VectorSearchHit[] {
    const hits: VectorSearchHit[] = [];
    for (const [factId, vector] of this.entries) {
      hits.push({ factId, score: cosine(query, vector) });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits.slice(0, limit);
  }

  toJSON(): VectorEntry[] {
    return [...this.entries.entries()].map(([factId, vector]) => ({ factId, vector }));
  }

  static fromJSON(entries: VectorEntry[]): MemoryVectorIndex {
    const index = new MemoryVectorIndex();
    for (const entry of entries) {
      index.insert(entry.factId, entry.vector);
    }
    return index;
  }
}

export function loadVectorIndex(path: string): MemoryVectorIndex {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as VectorEntry[];
  return MemoryVectorIndex.fromJSON(raw);
}

export function saveVectorIndex(path: string, index: MemoryVectorIndex): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(index.toJSON(), null, 2)}\n`);
}
