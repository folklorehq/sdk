import { z } from 'zod';
/** A single audience-gated fact hit — content-free metadata plus a decrypted snippet the caller is allowed to see (ADL #6/#34). */
export declare const searchResultSchema: z.ZodObject<{
    id: z.ZodString;
    kind: z.ZodString;
    occurredAt: z.ZodString;
    sourceId: z.ZodString;
    distance: z.ZodNumber;
    snippet: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    kind: string;
    occurredAt: string;
    sourceId: string;
    distance: number;
    snippet?: string | undefined;
}, {
    id: string;
    kind: string;
    occurredAt: string;
    sourceId: string;
    distance: number;
    snippet?: string | undefined;
}>;
export type SearchResult = z.infer<typeof searchResultSchema>;
export declare const searchResponseSchema: z.ZodObject<{
    query: z.ZodString;
    results: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodString;
        occurredAt: z.ZodString;
        sourceId: z.ZodString;
        distance: z.ZodNumber;
        snippet: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        kind: string;
        occurredAt: string;
        sourceId: string;
        distance: number;
        snippet?: string | undefined;
    }, {
        id: string;
        kind: string;
        occurredAt: string;
        sourceId: string;
        distance: number;
        snippet?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    query: string;
    results: {
        id: string;
        kind: string;
        occurredAt: string;
        sourceId: string;
        distance: number;
        snippet?: string | undefined;
    }[];
}, {
    query: string;
    results: {
        id: string;
        kind: string;
        occurredAt: string;
        sourceId: string;
        distance: number;
        snippet?: string | undefined;
    }[];
}>;
export type SearchResponse = z.infer<typeof searchResponseSchema>;
export declare const answerRequestSchema: z.ZodObject<{
    q: z.ZodString;
    limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    q: string;
    limit?: number | undefined;
}, {
    q: string;
    limit?: number | undefined;
}>;
export type AnswerRequest = z.infer<typeof answerRequestSchema>;
/** A grounded answer over enclave data: synthesized text plus the facts it was drawn from as citations. `grounded` is false when no visible fact matched, so the model was never asked to invent one. */
export declare const answerResponseSchema: z.ZodObject<{
    query: z.ZodString;
    answer: z.ZodString;
    grounded: z.ZodBoolean;
    citations: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        kind: z.ZodString;
        occurredAt: z.ZodString;
        sourceId: z.ZodString;
        distance: z.ZodNumber;
        snippet: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        kind: string;
        occurredAt: string;
        sourceId: string;
        distance: number;
        snippet?: string | undefined;
    }, {
        id: string;
        kind: string;
        occurredAt: string;
        sourceId: string;
        distance: number;
        snippet?: string | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    query: string;
    answer: string;
    grounded: boolean;
    citations: {
        id: string;
        kind: string;
        occurredAt: string;
        sourceId: string;
        distance: number;
        snippet?: string | undefined;
    }[];
}, {
    query: string;
    answer: string;
    grounded: boolean;
    citations: {
        id: string;
        kind: string;
        occurredAt: string;
        sourceId: string;
        distance: number;
        snippet?: string | undefined;
    }[];
}>;
export type AnswerResponse = z.infer<typeof answerResponseSchema>;
//# sourceMappingURL=search.d.ts.map