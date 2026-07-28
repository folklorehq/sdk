import { z } from 'zod';
/** One medium-confidence fact↔container association awaiting human disposition (ADL #24) — content-free metadata only (ADL #12). */
export declare const reviewQueueItemSchema: z.ZodObject<{
    scoreId: z.ZodString;
    factId: z.ZodString;
    containerId: z.ZodString;
    composite: z.ZodNumber;
    signals: z.ZodUnknown;
    confidence: z.ZodString;
    scoredAt: z.ZodString;
    fact: z.ZodObject<{
        kind: z.ZodString;
        occurredAt: z.ZodString;
        sourceId: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        kind: string;
        occurredAt: string;
        sourceId: string;
    }, {
        kind: string;
        occurredAt: string;
        sourceId: string;
    }>;
    container: z.ZodObject<{
        label: z.ZodString;
        shape: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        shape: string;
        label: string;
    }, {
        shape: string;
        label: string;
    }>;
}, "strip", z.ZodTypeAny, {
    composite: number;
    confidence: string;
    factId: string;
    containerId: string;
    scoreId: string;
    scoredAt: string;
    fact: {
        kind: string;
        occurredAt: string;
        sourceId: string;
    };
    container: {
        shape: string;
        label: string;
    };
    signals?: unknown;
}, {
    composite: number;
    confidence: string;
    factId: string;
    containerId: string;
    scoreId: string;
    scoredAt: string;
    fact: {
        kind: string;
        occurredAt: string;
        sourceId: string;
    };
    container: {
        shape: string;
        label: string;
    };
    signals?: unknown;
}>;
export type ReviewQueueItem = z.infer<typeof reviewQueueItemSchema>;
export declare const reviewQueueSchema: z.ZodObject<{
    total: z.ZodNumber;
    items: z.ZodArray<z.ZodObject<{
        scoreId: z.ZodString;
        factId: z.ZodString;
        containerId: z.ZodString;
        composite: z.ZodNumber;
        signals: z.ZodUnknown;
        confidence: z.ZodString;
        scoredAt: z.ZodString;
        fact: z.ZodObject<{
            kind: z.ZodString;
            occurredAt: z.ZodString;
            sourceId: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            kind: string;
            occurredAt: string;
            sourceId: string;
        }, {
            kind: string;
            occurredAt: string;
            sourceId: string;
        }>;
        container: z.ZodObject<{
            label: z.ZodString;
            shape: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            shape: string;
            label: string;
        }, {
            shape: string;
            label: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        composite: number;
        confidence: string;
        factId: string;
        containerId: string;
        scoreId: string;
        scoredAt: string;
        fact: {
            kind: string;
            occurredAt: string;
            sourceId: string;
        };
        container: {
            shape: string;
            label: string;
        };
        signals?: unknown;
    }, {
        composite: number;
        confidence: string;
        factId: string;
        containerId: string;
        scoreId: string;
        scoredAt: string;
        fact: {
            kind: string;
            occurredAt: string;
            sourceId: string;
        };
        container: {
            shape: string;
            label: string;
        };
        signals?: unknown;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    items: {
        composite: number;
        confidence: string;
        factId: string;
        containerId: string;
        scoreId: string;
        scoredAt: string;
        fact: {
            kind: string;
            occurredAt: string;
            sourceId: string;
        };
        container: {
            shape: string;
            label: string;
        };
        signals?: unknown;
    }[];
    total: number;
}, {
    items: {
        composite: number;
        confidence: string;
        factId: string;
        containerId: string;
        scoreId: string;
        scoredAt: string;
        fact: {
            kind: string;
            occurredAt: string;
            sourceId: string;
        };
        container: {
            shape: string;
            label: string;
        };
        signals?: unknown;
    }[];
    total: number;
}>;
export type ReviewQueue = z.infer<typeof reviewQueueSchema>;
export declare const reviewActionSchema: z.ZodObject<{
    action: z.ZodEnum<["assign", "remove"]>;
    reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    action: "assign" | "remove";
    reason?: string | null | undefined;
}, {
    action: "assign" | "remove";
    reason?: string | null | undefined;
}>;
export type ReviewAction = z.infer<typeof reviewActionSchema>;
//# sourceMappingURL=review.d.ts.map