// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { MemoryVectorIndex } from '../src/MemoryVectorIndex.js';

describe('MemoryVectorIndex', () => {
  it('ranks closer vectors higher', () => {
    const index = new MemoryVectorIndex();
    index.insert('a', [1, 0, 0]);
    index.insert('b', [0.9, 0.1, 0]);
    index.insert('c', [0, 1, 0]);
    const hits = index.search([1, 0, 0], 2);
    expect(hits[0]?.factId).toBe('a');
    expect(hits[1]?.factId).toBe('b');
  });
});
