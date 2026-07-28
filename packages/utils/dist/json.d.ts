/** Strips markdown code fences some models wrap around JSON, then parses. */
export declare function parseJsonFence<T>(raw: string): T;
/** The first JSON object substring (first `{` to last `}`) in model output, or `{}`. */
export declare function extractJsonObject(raw: string): string;
//# sourceMappingURL=json.d.ts.map