/** SHA-256 hex digest of a string or buffer. */
export declare function sha256Hex(input: string | Buffer): string;
/** Deterministic, RFC-4122-shaped UUID derived from a namespace + key via SHA-256; same input → same UUID. */
export declare function deterministicUuid(namespace: string, key: string): string;
/** The canonical `sources`-row id for one (org, kind); the enclave-output writer and OAuth-connect signal must derive it identically. */
export declare function deriveSourceId(orgId: string, kind: string): string;
//# sourceMappingURL=hash.d.ts.map