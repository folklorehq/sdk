// SPDX-License-Identifier: Apache-2.0
import { mulberry32, seedFromString } from '@folklore/utils/random';
const SENTINEL_PREFIX = 'LEAKCANARY';
const FRAGMENT_ALPHABET = 'ABCDEFGHIJKLMNPQRSTUVWXYZ23456789';
// 10 chars keeps a fragment fully inside a 12-char prefix leak (the common preview/snippet shape),
// while 33^10 entropy makes an accidental collision with real text effectively impossible.
const FRAGMENT_LENGTH = 10;
const FRAGMENT_COUNT = 5;
/** Deterministic markers: one long unique value + several SHORT fragments a truncated leak keeps. */
export function makeSentinel(seed) {
    const next = mulberry32(seedFromString(`${SENTINEL_PREFIX}:${seed}`));
    const fragments = [];
    for (let f = 0; f < FRAGMENT_COUNT; f += 1) {
        let fragment = '';
        for (let i = 0; i < FRAGMENT_LENGTH; i += 1) {
            fragment += FRAGMENT_ALPHABET[Math.floor(next() * FRAGMENT_ALPHABET.length)];
        }
        fragments.push(fragment);
    }
    return {
        value: `${SENTINEL_PREFIX}_${seed.toUpperCase()}_${fragments.join('')}`,
        fragments,
        seed,
    };
}
/** Every needle to hunt for: the full marker AND each short fragment. */
export function sentinelNeedles(sentinel) {
    return [sentinel.value, ...sentinel.fragments];
}
// A fragment sits at OFFSET 0 so a prefix/preview leak (body.slice(0, N)) still exposes one, and
// fragments are interspersed so any bounded snippet of the prose catches at least one.
export function sentinelSentence(sentinel) {
    const [f0, f1, f2, f3, f4] = sentinel.fragments;
    return (`${f0} confidential Q4 revenue and layoffs ${f1}; ` +
        `performance-improvement plan for a named person ${f2}; ` +
        `incident postmortem root cause ${f3}; do-not-share ${f4}. (${sentinel.value})`);
}
//# sourceMappingURL=sentinel.js.map