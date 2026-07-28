// SPDX-License-Identifier: Apache-2.0
/** Mulberry32 seeded PRNG — a given seed reproduces the same [0,1) sequence. */
export function mulberry32(seed) {
    let a = seed;
    return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
/** Fold a string into a 32-bit seed for `mulberry32` (char-code sum). */
export function seedFromString(s) {
    let a = 0;
    for (const c of s)
        a = (a + c.charCodeAt(0)) | 0;
    return a;
}
//# sourceMappingURL=random.js.map