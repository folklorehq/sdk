export interface Sentinel {
    readonly value: string;
    readonly fragments: readonly string[];
    readonly seed: string;
}
/** Deterministic markers: one long unique value + several SHORT fragments a truncated leak keeps. */
export declare function makeSentinel(seed: string): Sentinel;
/** Every needle to hunt for: the full marker AND each short fragment. */
export declare function sentinelNeedles(sentinel: Sentinel): string[];
export declare function sentinelSentence(sentinel: Sentinel): string;
//# sourceMappingURL=sentinel.d.ts.map