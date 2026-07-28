// SPDX-License-Identifier: Apache-2.0
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { cosine } from '@folklore/utils';
export class MemoryVectorIndex {
    entries = new Map();
    insert(factId, vector) {
        this.entries.set(factId, vector);
    }
    search(query, limit) {
        const hits = [];
        for (const [factId, vector] of this.entries) {
            hits.push({ factId, score: cosine(query, vector) });
        }
        hits.sort((a, b) => b.score - a.score);
        return hits.slice(0, limit);
    }
    toJSON() {
        return [...this.entries.entries()].map(([factId, vector]) => ({ factId, vector }));
    }
    static fromJSON(entries) {
        const index = new MemoryVectorIndex();
        for (const entry of entries) {
            index.insert(entry.factId, entry.vector);
        }
        return index;
    }
}
export function loadVectorIndex(path) {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return MemoryVectorIndex.fromJSON(raw);
}
export function saveVectorIndex(path, index) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(index.toJSON(), null, 2)}\n`);
}
//# sourceMappingURL=MemoryVectorIndex.js.map