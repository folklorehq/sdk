import type { Sentinel } from './sentinel.js';
export type SentinelEncoding = 'raw' | 'raw-ci' | 'base64' | 'base64url' | 'hex' | 'url' | 'base64-decoded' | 'hex-decoded' | 'url-decoded';
export interface SentinelSighting {
    path: string;
    needle: string;
    encoding: SentinelEncoding;
    preview: string;
}
export type SentinelMarker = Sentinel | string | readonly string[];
/** Recursively hunt for any sentinel needle in a value, defeating common encodings + Error objects. */
export declare function findSentinel(value: unknown, marker: SentinelMarker): SentinelSighting[];
export declare function containsSentinel(value: unknown, marker: SentinelMarker): boolean;
//# sourceMappingURL=deep-scan.d.ts.map