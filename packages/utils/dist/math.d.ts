/** Clamp a number to the [0, 1] range. */
export declare function clamp01(x: number): number;
/** Cosine similarity between two equal-length vectors; 0 if empty, unequal-length, or zero-magnitude. */
export declare function cosine(a: number[], b: number[]): number;
/** Arithmetic mean of the values; 0 if empty. */
export declare function mean(xs: number[]): number;
/** Median of the finite values, averaging the two middle elements for even counts; 0 if empty. */
export declare function median(xs: number[]): number;
/** Jaccard similarity between two string sets: |A ∩ B| / |A ∪ B|; 0 if both empty. */
export declare function jaccard(a: string[], b: string[]): number;
//# sourceMappingURL=math.d.ts.map