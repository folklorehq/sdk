// SPDX-License-Identifier: Apache-2.0
/** Clamp a number to the [0, 1] range. */
export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/** Cosine similarity between two equal-length vectors; 0 if empty, unequal-length, or zero-magnitude. */
export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    magA += a[i]! * a[i]!;
    magB += b[i]! * b[i]!;
  }
  return magA && magB ? dot / (Math.sqrt(magA) * Math.sqrt(magB)) : 0;
}

/** Arithmetic mean of the values; 0 if empty. */
export function mean(xs: number[]): number {
  return xs.length === 0 ? 0 : xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

/** Median of the finite values, averaging the two middle elements for even counts; 0 if empty. */
export function median(xs: number[]): number {
  const sorted = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Jaccard similarity between two string sets: |A ∩ B| / |A ∪ B|; 0 if both empty. */
export function jaccard(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
