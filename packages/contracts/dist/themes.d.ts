import { z } from 'zod';
/** A theme rendered as a knowledge-map node — content-free metadata only (ADL #12). */
export declare const themeGraphNodeSchema: z.ZodObject<{
    id: z.ZodString;
    name: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    isAggregate: z.ZodBoolean;
    importance: z.ZodNumber;
    factCount: z.ZodNumber;
    updatedAt: z.ZodString;
    ownerTeamId: z.ZodNullable<z.ZodString>;
    ownerTeamName: z.ZodNullable<z.ZodString>;
    ownerName: z.ZodNullable<z.ZodString>;
    audience: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    id: string;
    name: string;
    ownerName: string | null;
    tags: string[];
    factCount: number;
    updatedAt: string;
    isAggregate: boolean;
    importance: number;
    ownerTeamId: string | null;
    ownerTeamName: string | null;
    audience: string | null;
}, {
    id: string;
    name: string;
    ownerName: string | null;
    tags: string[];
    factCount: number;
    updatedAt: string;
    isAggregate: boolean;
    importance: number;
    ownerTeamId: string | null;
    ownerTeamName: string | null;
    audience: string | null;
}>;
export type ThemeGraphNode = z.infer<typeof themeGraphNodeSchema>;
/** A scored `RELATED_TO` edge between two themes (ADL #8/#39). */
export declare const themeGraphEdgeSchema: z.ZodObject<{
    source: z.ZodString;
    target: z.ZodString;
    weight: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    weight: number;
    source: string;
    target: string;
}, {
    weight: number;
    source: string;
    target: string;
}>;
export type ThemeGraphEdge = z.infer<typeof themeGraphEdgeSchema>;
export declare const themeGraphResponseSchema: z.ZodObject<{
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
        tags: z.ZodArray<z.ZodString, "many">;
        isAggregate: z.ZodBoolean;
        importance: z.ZodNumber;
        factCount: z.ZodNumber;
        updatedAt: z.ZodString;
        ownerTeamId: z.ZodNullable<z.ZodString>;
        ownerTeamName: z.ZodNullable<z.ZodString>;
        ownerName: z.ZodNullable<z.ZodString>;
        audience: z.ZodNullable<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
        ownerName: string | null;
        tags: string[];
        factCount: number;
        updatedAt: string;
        isAggregate: boolean;
        importance: number;
        ownerTeamId: string | null;
        ownerTeamName: string | null;
        audience: string | null;
    }, {
        id: string;
        name: string;
        ownerName: string | null;
        tags: string[];
        factCount: number;
        updatedAt: string;
        isAggregate: boolean;
        importance: number;
        ownerTeamId: string | null;
        ownerTeamName: string | null;
        audience: string | null;
    }>, "many">;
    edges: z.ZodArray<z.ZodObject<{
        source: z.ZodString;
        target: z.ZodString;
        weight: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        weight: number;
        source: string;
        target: string;
    }, {
        weight: number;
        source: string;
        target: string;
    }>, "many">;
    truncated: z.ZodBoolean;
}, "strip", z.ZodTypeAny, {
    nodes: {
        id: string;
        name: string;
        ownerName: string | null;
        tags: string[];
        factCount: number;
        updatedAt: string;
        isAggregate: boolean;
        importance: number;
        ownerTeamId: string | null;
        ownerTeamName: string | null;
        audience: string | null;
    }[];
    edges: {
        weight: number;
        source: string;
        target: string;
    }[];
    truncated: boolean;
}, {
    nodes: {
        id: string;
        name: string;
        ownerName: string | null;
        tags: string[];
        factCount: number;
        updatedAt: string;
        isAggregate: boolean;
        importance: number;
        ownerTeamId: string | null;
        ownerTeamName: string | null;
        audience: string | null;
    }[];
    edges: {
        weight: number;
        source: string;
        target: string;
    }[];
    truncated: boolean;
}>;
export type ThemeGraphResponse = z.infer<typeof themeGraphResponseSchema>;
/** One pending duplicate-theme pair awaiting human disposition (ADL #56 Stage B) — ids/scores/names only; the box resolves names from its own DB, never the control plane. */
export declare const themeMergeReviewItemSchema: z.ZodObject<{
    candidateId: z.ZodString;
    themeA: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
    }, {
        id: string;
        name: string;
    }>;
    themeB: z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        id: string;
        name: string;
    }, {
        id: string;
        name: string;
    }>;
    mergeScore: z.ZodNumber;
    signals: z.ZodObject<{
        cosine: z.ZodNumber;
        jaccard: z.ZodNumber;
        judge: z.ZodNullable<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        cosine: number;
        jaccard: number;
        judge: number | null;
    }, {
        cosine: number;
        jaccard: number;
        judge: number | null;
    }>;
    detectedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    mergeScore: number;
    signals: {
        cosine: number;
        jaccard: number;
        judge: number | null;
    };
    candidateId: string;
    themeA: {
        id: string;
        name: string;
    };
    themeB: {
        id: string;
        name: string;
    };
    detectedAt: string;
}, {
    mergeScore: number;
    signals: {
        cosine: number;
        jaccard: number;
        judge: number | null;
    };
    candidateId: string;
    themeA: {
        id: string;
        name: string;
    };
    themeB: {
        id: string;
        name: string;
    };
    detectedAt: string;
}>;
export type ThemeMergeReviewItem = z.infer<typeof themeMergeReviewItemSchema>;
export declare const themeMergeReviewListSchema: z.ZodObject<{
    total: z.ZodNumber;
    items: z.ZodArray<z.ZodObject<{
        candidateId: z.ZodString;
        themeA: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            id: string;
            name: string;
        }, {
            id: string;
            name: string;
        }>;
        themeB: z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            id: string;
            name: string;
        }, {
            id: string;
            name: string;
        }>;
        mergeScore: z.ZodNumber;
        signals: z.ZodObject<{
            cosine: z.ZodNumber;
            jaccard: z.ZodNumber;
            judge: z.ZodNullable<z.ZodNumber>;
        }, "strip", z.ZodTypeAny, {
            cosine: number;
            jaccard: number;
            judge: number | null;
        }, {
            cosine: number;
            jaccard: number;
            judge: number | null;
        }>;
        detectedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        mergeScore: number;
        signals: {
            cosine: number;
            jaccard: number;
            judge: number | null;
        };
        candidateId: string;
        themeA: {
            id: string;
            name: string;
        };
        themeB: {
            id: string;
            name: string;
        };
        detectedAt: string;
    }, {
        mergeScore: number;
        signals: {
            cosine: number;
            jaccard: number;
            judge: number | null;
        };
        candidateId: string;
        themeA: {
            id: string;
            name: string;
        };
        themeB: {
            id: string;
            name: string;
        };
        detectedAt: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    items: {
        mergeScore: number;
        signals: {
            cosine: number;
            jaccard: number;
            judge: number | null;
        };
        candidateId: string;
        themeA: {
            id: string;
            name: string;
        };
        themeB: {
            id: string;
            name: string;
        };
        detectedAt: string;
    }[];
    total: number;
}, {
    items: {
        mergeScore: number;
        signals: {
            cosine: number;
            jaccard: number;
            judge: number | null;
        };
        candidateId: string;
        themeA: {
            id: string;
            name: string;
        };
        themeB: {
            id: string;
            name: string;
        };
        detectedAt: string;
    }[];
    total: number;
}>;
export type ThemeMergeReviewList = z.infer<typeof themeMergeReviewListSchema>;
export declare const themeMergeActionSchema: z.ZodObject<{
    action: z.ZodEnum<["approve", "reject"]>;
    reason: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    action: "approve" | "reject";
    reason?: string | null | undefined;
}, {
    action: "approve" | "reject";
    reason?: string | null | undefined;
}>;
export type ThemeMergeAction = z.infer<typeof themeMergeActionSchema>;
//# sourceMappingURL=themes.d.ts.map