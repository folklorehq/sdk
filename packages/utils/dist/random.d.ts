/** Mulberry32 seeded PRNG — a given seed reproduces the same [0,1) sequence. */
export declare function mulberry32(seed: number): () => number;
/** Fold a string into a 32-bit seed for `mulberry32` (char-code sum). */
export declare function seedFromString(s: string): number;
//# sourceMappingURL=random.d.ts.map