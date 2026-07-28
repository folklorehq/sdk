import { z } from 'zod';
export declare const factKindSchema: z.ZodEnum<["content", "transition"]>;
export type FactKind = z.infer<typeof factKindSchema>;
export declare const containerSeedSchema: z.ZodObject<{
    sourceContainerId: z.ZodString;
    label: z.ZodString;
    shape: z.ZodString;
}, "strip", z.ZodTypeAny, {
    shape: string;
    label: string;
    sourceContainerId: string;
}, {
    shape: string;
    label: string;
    sourceContainerId: string;
}>;
export type ContainerSeed = z.infer<typeof containerSeedSchema>;
export declare const hnswNeighborSchema: z.ZodObject<{
    factId: z.ZodString;
    similarity: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    factId: string;
    similarity: number;
}, {
    factId: string;
    similarity: number;
}>;
export type HnswNeighbor = z.infer<typeof hnswNeighborSchema>;
export declare const sensitivityLevelSchema: z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>;
export type SensitivityLevel = z.infer<typeof sensitivityLevelSchema>;
export declare const wikiExportTargetKindSchema: z.ZodEnum<["notion", "clickup"]>;
export type WikiExportTargetKind = z.infer<typeof wikiExportTargetKindSchema>;
export declare const processedFactSchema: z.ZodObject<{
    factId: z.ZodString;
    orgId: z.ZodString;
    sourceKind: z.ZodString;
    sourceFactId: z.ZodString;
    occurredAt: z.ZodString;
    bodyS3Key: z.ZodString;
    bodyHash: z.ZodString;
    kind: z.ZodEnum<["content", "transition"]>;
    containerRefs: z.ZodArray<z.ZodString, "many">;
    explicitLinks: z.ZodArray<z.ZodString, "many">;
    sourceThreadId: z.ZodOptional<z.ZodString>;
    extractedEntities: z.ZodArray<z.ZodString, "many">;
    containerSeeds: z.ZodArray<z.ZodObject<{
        sourceContainerId: z.ZodString;
        label: z.ZodString;
        shape: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        shape: string;
        label: string;
        sourceContainerId: string;
    }, {
        shape: string;
        label: string;
        sourceContainerId: string;
    }>, "many">;
    hnswNeighbors: z.ZodArray<z.ZodObject<{
        factId: z.ZodString;
        similarity: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        factId: string;
        similarity: number;
    }, {
        factId: string;
        similarity: number;
    }>, "many">;
    sensitivityLevel: z.ZodDefault<z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>>;
    metrics: z.ZodDefault<z.ZodArray<z.ZodObject<{
        key: z.ZodEnum<[import("./metrics.js").FactMetricKey, ...import("./metrics.js").FactMetricKey[]]>;
        value: z.ZodNumber;
        unit: z.ZodEnum<["lines", "files", "seconds", "count"]>;
    }, "strip", z.ZodTypeAny, {
        value: number;
        key: import("./metrics.js").FactMetricKey;
        unit: "lines" | "files" | "seconds" | "count";
    }, {
        value: number;
        key: import("./metrics.js").FactMetricKey;
        unit: "lines" | "files" | "seconds" | "count";
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    kind: "transition" | "content";
    factId: string;
    orgId: string;
    sourceKind: string;
    sourceFactId: string;
    occurredAt: string;
    bodyS3Key: string;
    bodyHash: string;
    containerRefs: string[];
    explicitLinks: string[];
    extractedEntities: string[];
    containerSeeds: {
        shape: string;
        label: string;
        sourceContainerId: string;
    }[];
    hnswNeighbors: {
        factId: string;
        similarity: number;
    }[];
    sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
    metrics: {
        value: number;
        key: import("./metrics.js").FactMetricKey;
        unit: "lines" | "files" | "seconds" | "count";
    }[];
    sourceThreadId?: string | undefined;
}, {
    kind: "transition" | "content";
    factId: string;
    orgId: string;
    sourceKind: string;
    sourceFactId: string;
    occurredAt: string;
    bodyS3Key: string;
    bodyHash: string;
    containerRefs: string[];
    explicitLinks: string[];
    extractedEntities: string[];
    containerSeeds: {
        shape: string;
        label: string;
        sourceContainerId: string;
    }[];
    hnswNeighbors: {
        factId: string;
        similarity: number;
    }[];
    sourceThreadId?: string | undefined;
    sensitivityLevel?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
    metrics?: {
        value: number;
        key: import("./metrics.js").FactMetricKey;
        unit: "lines" | "files" | "seconds" | "count";
    }[] | undefined;
}>;
export type ProcessedFact = z.infer<typeof processedFactSchema>;
export declare const encryptedBodySchema: z.ZodObject<{
    format: z.ZodLiteral<"esdk-v1">;
    ciphertext: z.ZodString;
}, "strip", z.ZodTypeAny, {
    format: "esdk-v1";
    ciphertext: string;
}, {
    format: "esdk-v1";
    ciphertext: string;
}>;
export type EncryptedBody = z.infer<typeof encryptedBodySchema>;
export declare const encryptedBlockSchema: z.ZodObject<{
    type: z.ZodString;
    sensitivityLevel: z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>;
    audienceId: z.ZodNullable<z.ZodString>;
    factIds: z.ZodArray<z.ZodString, "many">;
    body: z.ZodObject<{
        format: z.ZodLiteral<"esdk-v1">;
        ciphertext: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        format: "esdk-v1";
        ciphertext: string;
    }, {
        format: "esdk-v1";
        ciphertext: string;
    }>;
}, "strip", z.ZodTypeAny, {
    type: string;
    factIds: string[];
    body: {
        format: "esdk-v1";
        ciphertext: string;
    };
    sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
    audienceId: string | null;
}, {
    type: string;
    factIds: string[];
    body: {
        format: "esdk-v1";
        ciphertext: string;
    };
    sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
    audienceId: string | null;
}>;
export type EncryptedBlock = z.infer<typeof encryptedBlockSchema>;
export declare const wikiArticleSchema: z.ZodObject<{
    audienceId: z.ZodNullable<z.ZodString>;
    content: z.ZodString;
    contentFormat: z.ZodEnum<["esdk-v1", "plaintext"]>;
    factCount: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    content: string;
    factCount: number;
    audienceId: string | null;
    contentFormat: "esdk-v1" | "plaintext";
}, {
    content: string;
    factCount: number;
    audienceId: string | null;
    contentFormat: "esdk-v1" | "plaintext";
}>;
export type WikiArticle = z.infer<typeof wikiArticleSchema>;
export declare const richBlockKindCountSchema: z.ZodObject<{
    kind: z.ZodEnum<["diagram", "graph", "chart", "code", "embed", "canvas"]>;
    seen: z.ZodNumber;
    dropped: z.ZodNumber;
    repaired: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    kind: "code" | "diagram" | "graph" | "chart" | "embed" | "canvas";
    seen: number;
    dropped: number;
    repaired: number;
}, {
    kind: "code" | "diagram" | "graph" | "chart" | "embed" | "canvas";
    seen: number;
    dropped: number;
    repaired?: number | undefined;
}>;
export type RichBlockKindCount = z.infer<typeof richBlockKindCountSchema>;
export declare const wikiSynthesisResultSchema: z.ZodObject<{
    type: z.ZodLiteral<"wiki_synthesis">;
    requestId: z.ZodString;
    themeId: z.ZodString;
    orgId: z.ZodString;
    articles: z.ZodArray<z.ZodObject<{
        audienceId: z.ZodNullable<z.ZodString>;
        content: z.ZodString;
        contentFormat: z.ZodEnum<["esdk-v1", "plaintext"]>;
        factCount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        content: string;
        factCount: number;
        audienceId: string | null;
        contentFormat: "esdk-v1" | "plaintext";
    }, {
        content: string;
        factCount: number;
        audienceId: string | null;
        contentFormat: "esdk-v1" | "plaintext";
    }>, "many">;
    blocks: z.ZodArray<z.ZodObject<{
        type: z.ZodString;
        sensitivityLevel: z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>;
        audienceId: z.ZodNullable<z.ZodString>;
        factIds: z.ZodArray<z.ZodString, "many">;
        body: z.ZodObject<{
            format: z.ZodLiteral<"esdk-v1">;
            ciphertext: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            format: "esdk-v1";
            ciphertext: string;
        }, {
            format: "esdk-v1";
            ciphertext: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        factIds: string[];
        body: {
            format: "esdk-v1";
            ciphertext: string;
        };
        sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
        audienceId: string | null;
    }, {
        type: string;
        factIds: string[];
        body: {
            format: "esdk-v1";
            ciphertext: string;
        };
        sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
        audienceId: string | null;
    }>, "many">;
    citedFactIds: z.ZodArray<z.ZodString, "many">;
    richBlockCounts: z.ZodDefault<z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<["diagram", "graph", "chart", "code", "embed", "canvas"]>;
        seen: z.ZodNumber;
        dropped: z.ZodNumber;
        repaired: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        kind: "code" | "diagram" | "graph" | "chart" | "embed" | "canvas";
        seen: number;
        dropped: number;
        repaired: number;
    }, {
        kind: "code" | "diagram" | "graph" | "chart" | "embed" | "canvas";
        seen: number;
        dropped: number;
        repaired?: number | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    type: "wiki_synthesis";
    themeId: string;
    blocks: {
        type: string;
        factIds: string[];
        body: {
            format: "esdk-v1";
            ciphertext: string;
        };
        sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
        audienceId: string | null;
    }[];
    orgId: string;
    requestId: string;
    articles: {
        content: string;
        factCount: number;
        audienceId: string | null;
        contentFormat: "esdk-v1" | "plaintext";
    }[];
    citedFactIds: string[];
    richBlockCounts: {
        kind: "code" | "diagram" | "graph" | "chart" | "embed" | "canvas";
        seen: number;
        dropped: number;
        repaired: number;
    }[];
}, {
    type: "wiki_synthesis";
    themeId: string;
    blocks: {
        type: string;
        factIds: string[];
        body: {
            format: "esdk-v1";
            ciphertext: string;
        };
        sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
        audienceId: string | null;
    }[];
    orgId: string;
    requestId: string;
    articles: {
        content: string;
        factCount: number;
        audienceId: string | null;
        contentFormat: "esdk-v1" | "plaintext";
    }[];
    citedFactIds: string[];
    richBlockCounts?: {
        kind: "code" | "diagram" | "graph" | "chart" | "embed" | "canvas";
        seen: number;
        dropped: number;
        repaired?: number | undefined;
    }[] | undefined;
}>;
export type WikiSynthesisResult = z.infer<typeof wikiSynthesisResultSchema>;
export declare const themeFactScoreSchema: z.ZodObject<{
    factId: z.ZodString;
    score: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    factId: string;
    score: number;
}, {
    factId: string;
    score: number;
}>;
export type ThemeFactScore = z.infer<typeof themeFactScoreSchema>;
export declare const synthesizedThemeSchema: z.ZodObject<{
    themeId: z.ZodString;
    name: z.ZodString;
    kind: z.ZodEnum<["topic", "ceremony"]>;
    team: z.ZodString;
    importance: z.ZodNumber;
    tags: z.ZodArray<z.ZodString, "many">;
    containerIds: z.ZodArray<z.ZodString, "many">;
    facts: z.ZodArray<z.ZodObject<{
        factId: z.ZodString;
        score: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        factId: string;
        score: number;
    }, {
        factId: string;
        score: number;
    }>, "many">;
    docType: z.ZodDefault<z.ZodString>;
    docTypeConfidence: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    kind: "topic" | "ceremony";
    name: string;
    team: string;
    tags: string[];
    themeId: string;
    importance: number;
    containerIds: string[];
    facts: {
        factId: string;
        score: number;
    }[];
    docType: string;
    docTypeConfidence: number;
}, {
    kind: "topic" | "ceremony";
    name: string;
    team: string;
    tags: string[];
    themeId: string;
    importance: number;
    containerIds: string[];
    facts: {
        factId: string;
        score: number;
    }[];
    docType?: string | undefined;
    docTypeConfidence?: number | undefined;
}>;
export type SynthesizedTheme = z.infer<typeof synthesizedThemeSchema>;
export declare const relatedThemeEdgeSchema: z.ZodObject<{
    fromThemeId: z.ZodString;
    toThemeId: z.ZodString;
    similarity: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    similarity: number;
    fromThemeId: string;
    toThemeId: string;
}, {
    similarity: number;
    fromThemeId: string;
    toThemeId: string;
}>;
export type RelatedThemeEdge = z.infer<typeof relatedThemeEdgeSchema>;
export declare const themeMergeSignalsSchema: z.ZodObject<{
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
export type ThemeMergeSignals = z.infer<typeof themeMergeSignalsSchema>;
export declare const themeMergeCandidateStatusSchema: z.ZodEnum<["pending", "auto"]>;
export type ThemeMergeCandidateStatus = z.infer<typeof themeMergeCandidateStatusSchema>;
export declare const themeMergeCandidateSchema: z.ZodObject<{
    themeIdA: z.ZodString;
    themeIdB: z.ZodString;
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
    status: z.ZodEnum<["pending", "auto"]>;
}, "strip", z.ZodTypeAny, {
    status: "pending" | "auto";
    themeIdA: string;
    themeIdB: string;
    mergeScore: number;
    signals: {
        cosine: number;
        jaccard: number;
        judge: number | null;
    };
}, {
    status: "pending" | "auto";
    themeIdA: string;
    themeIdB: string;
    mergeScore: number;
    signals: {
        cosine: number;
        jaccard: number;
        judge: number | null;
    };
}>;
export type ThemeMergeCandidate = z.infer<typeof themeMergeCandidateSchema>;
export declare const aggregateThemeChildSchema: z.ZodObject<{
    childThemeId: z.ZodString;
    weight: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    childThemeId: string;
    weight: number;
}, {
    childThemeId: string;
    weight: number;
}>;
export type AggregateThemeChild = z.infer<typeof aggregateThemeChildSchema>;
export declare const aggregateThemeSchema: z.ZodObject<{
    aggregateThemeId: z.ZodString;
    name: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    importance: z.ZodNumber;
    children: z.ZodArray<z.ZodObject<{
        childThemeId: z.ZodString;
        weight: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        childThemeId: string;
        weight: number;
    }, {
        childThemeId: string;
        weight: number;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    tags: string[];
    importance: number;
    aggregateThemeId: string;
    children: {
        childThemeId: string;
        weight: number;
    }[];
}, {
    name: string;
    tags: string[];
    importance: number;
    aggregateThemeId: string;
    children: {
        childThemeId: string;
        weight: number;
    }[];
}>;
export type AggregateTheme = z.infer<typeof aggregateThemeSchema>;
export declare const themeSynthesisResultSchema: z.ZodObject<{
    type: z.ZodLiteral<"theme_synthesis">;
    requestId: z.ZodString;
    orgId: z.ZodString;
    themes: z.ZodArray<z.ZodObject<{
        themeId: z.ZodString;
        name: z.ZodString;
        kind: z.ZodEnum<["topic", "ceremony"]>;
        team: z.ZodString;
        importance: z.ZodNumber;
        tags: z.ZodArray<z.ZodString, "many">;
        containerIds: z.ZodArray<z.ZodString, "many">;
        facts: z.ZodArray<z.ZodObject<{
            factId: z.ZodString;
            score: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            factId: string;
            score: number;
        }, {
            factId: string;
            score: number;
        }>, "many">;
        docType: z.ZodDefault<z.ZodString>;
        docTypeConfidence: z.ZodDefault<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        kind: "topic" | "ceremony";
        name: string;
        team: string;
        tags: string[];
        themeId: string;
        importance: number;
        containerIds: string[];
        facts: {
            factId: string;
            score: number;
        }[];
        docType: string;
        docTypeConfidence: number;
    }, {
        kind: "topic" | "ceremony";
        name: string;
        team: string;
        tags: string[];
        themeId: string;
        importance: number;
        containerIds: string[];
        facts: {
            factId: string;
            score: number;
        }[];
        docType?: string | undefined;
        docTypeConfidence?: number | undefined;
    }>, "many">;
    related: z.ZodArray<z.ZodObject<{
        fromThemeId: z.ZodString;
        toThemeId: z.ZodString;
        similarity: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        similarity: number;
        fromThemeId: string;
        toThemeId: string;
    }, {
        similarity: number;
        fromThemeId: string;
        toThemeId: string;
    }>, "many">;
    mergeCandidates: z.ZodDefault<z.ZodArray<z.ZodObject<{
        themeIdA: z.ZodString;
        themeIdB: z.ZodString;
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
        status: z.ZodEnum<["pending", "auto"]>;
    }, "strip", z.ZodTypeAny, {
        status: "pending" | "auto";
        themeIdA: string;
        themeIdB: string;
        mergeScore: number;
        signals: {
            cosine: number;
            jaccard: number;
            judge: number | null;
        };
    }, {
        status: "pending" | "auto";
        themeIdA: string;
        themeIdB: string;
        mergeScore: number;
        signals: {
            cosine: number;
            jaccard: number;
            judge: number | null;
        };
    }>, "many">>;
    aggregates: z.ZodDefault<z.ZodArray<z.ZodObject<{
        aggregateThemeId: z.ZodString;
        name: z.ZodString;
        tags: z.ZodArray<z.ZodString, "many">;
        importance: z.ZodNumber;
        children: z.ZodArray<z.ZodObject<{
            childThemeId: z.ZodString;
            weight: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            childThemeId: string;
            weight: number;
        }, {
            childThemeId: string;
            weight: number;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        name: string;
        tags: string[];
        importance: number;
        aggregateThemeId: string;
        children: {
            childThemeId: string;
            weight: number;
        }[];
    }, {
        name: string;
        tags: string[];
        importance: number;
        aggregateThemeId: string;
        children: {
            childThemeId: string;
            weight: number;
        }[];
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    type: "theme_synthesis";
    related: {
        similarity: number;
        fromThemeId: string;
        toThemeId: string;
    }[];
    orgId: string;
    requestId: string;
    themes: {
        kind: "topic" | "ceremony";
        name: string;
        team: string;
        tags: string[];
        themeId: string;
        importance: number;
        containerIds: string[];
        facts: {
            factId: string;
            score: number;
        }[];
        docType: string;
        docTypeConfidence: number;
    }[];
    mergeCandidates: {
        status: "pending" | "auto";
        themeIdA: string;
        themeIdB: string;
        mergeScore: number;
        signals: {
            cosine: number;
            jaccard: number;
            judge: number | null;
        };
    }[];
    aggregates: {
        name: string;
        tags: string[];
        importance: number;
        aggregateThemeId: string;
        children: {
            childThemeId: string;
            weight: number;
        }[];
    }[];
}, {
    type: "theme_synthesis";
    related: {
        similarity: number;
        fromThemeId: string;
        toThemeId: string;
    }[];
    orgId: string;
    requestId: string;
    themes: {
        kind: "topic" | "ceremony";
        name: string;
        team: string;
        tags: string[];
        themeId: string;
        importance: number;
        containerIds: string[];
        facts: {
            factId: string;
            score: number;
        }[];
        docType?: string | undefined;
        docTypeConfidence?: number | undefined;
    }[];
    mergeCandidates?: {
        status: "pending" | "auto";
        themeIdA: string;
        themeIdB: string;
        mergeScore: number;
        signals: {
            cosine: number;
            jaccard: number;
            judge: number | null;
        };
    }[] | undefined;
    aggregates?: {
        name: string;
        tags: string[];
        importance: number;
        aggregateThemeId: string;
        children: {
            childThemeId: string;
            weight: number;
        }[];
    }[] | undefined;
}>;
export type ThemeSynthesisResult = z.infer<typeof themeSynthesisResultSchema>;
export declare const synthesisFactRefSchema: z.ZodObject<{
    factId: z.ZodString;
    s3Key: z.ZodString;
    occurredAt: z.ZodString;
    kind: z.ZodString;
    score: z.ZodNumber;
    sourceKind: z.ZodOptional<z.ZodString>;
    sensitivityLevel: z.ZodDefault<z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>>;
}, "strip", z.ZodTypeAny, {
    kind: string;
    factId: string;
    occurredAt: string;
    sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
    score: number;
    s3Key: string;
    sourceKind?: string | undefined;
}, {
    kind: string;
    factId: string;
    occurredAt: string;
    score: number;
    s3Key: string;
    sourceKind?: string | undefined;
    sensitivityLevel?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
}>;
export type SynthesisFactRef = z.infer<typeof synthesisFactRefSchema>;
export declare const synthesisRelatedThemeSchema: z.ZodObject<{
    themeId: z.ZodString;
    name: z.ZodString;
    similarity: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    name: string;
    themeId: string;
    similarity: number;
}, {
    name: string;
    themeId: string;
    similarity: number;
}>;
export type SynthesisRelatedTheme = z.infer<typeof synthesisRelatedThemeSchema>;
export declare const knowledgeEdgeKindSchema: z.ZodEnum<["RELATED_TO", "PARENT", "CHILD"]>;
export type KnowledgeEdgeKind = z.infer<typeof knowledgeEdgeKindSchema>;
export declare const knowledgeSkeletonNeighborSchema: z.ZodObject<{
    themeId: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    edge: z.ZodEnum<["RELATED_TO", "PARENT", "CHILD"]>;
    weight: z.ZodNumber;
    hops: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    tags: string[];
    themeId: string;
    weight: number;
    edge: "RELATED_TO" | "PARENT" | "CHILD";
    hops: number;
}, {
    tags: string[];
    themeId: string;
    weight: number;
    edge: "RELATED_TO" | "PARENT" | "CHILD";
    hops: number;
}>;
export type KnowledgeSkeletonNeighbor = z.infer<typeof knowledgeSkeletonNeighborSchema>;
export declare const knowledgeSkeletonEntitySchema: z.ZodObject<{
    entityId: z.ZodString;
    kind: z.ZodString;
}, "strip", z.ZodTypeAny, {
    kind: string;
    entityId: string;
}, {
    kind: string;
    entityId: string;
}>;
export type KnowledgeSkeletonEntity = z.infer<typeof knowledgeSkeletonEntitySchema>;
export declare const knowledgeSkeletonSchema: z.ZodObject<{
    node: z.ZodObject<{
        themeId: z.ZodString;
        tags: z.ZodArray<z.ZodString, "many">;
    }, "strip", z.ZodTypeAny, {
        tags: string[];
        themeId: string;
    }, {
        tags: string[];
        themeId: string;
    }>;
    neighbors: z.ZodArray<z.ZodObject<{
        themeId: z.ZodString;
        tags: z.ZodArray<z.ZodString, "many">;
        edge: z.ZodEnum<["RELATED_TO", "PARENT", "CHILD"]>;
        weight: z.ZodNumber;
        hops: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        tags: string[];
        themeId: string;
        weight: number;
        edge: "RELATED_TO" | "PARENT" | "CHILD";
        hops: number;
    }, {
        tags: string[];
        themeId: string;
        weight: number;
        edge: "RELATED_TO" | "PARENT" | "CHILD";
        hops: number;
    }>, "many">;
    entities: z.ZodArray<z.ZodObject<{
        entityId: z.ZodString;
        kind: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        kind: string;
        entityId: string;
    }, {
        kind: string;
        entityId: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    node: {
        tags: string[];
        themeId: string;
    };
    neighbors: {
        tags: string[];
        themeId: string;
        weight: number;
        edge: "RELATED_TO" | "PARENT" | "CHILD";
        hops: number;
    }[];
    entities: {
        kind: string;
        entityId: string;
    }[];
}, {
    node: {
        tags: string[];
        themeId: string;
    };
    neighbors: {
        tags: string[];
        themeId: string;
        weight: number;
        edge: "RELATED_TO" | "PARENT" | "CHILD";
        hops: number;
    }[];
    entities: {
        kind: string;
        entityId: string;
    }[];
}>;
export type KnowledgeSkeleton = z.infer<typeof knowledgeSkeletonSchema>;
export declare const knowledgeNeighborhoodNeighborSchema: z.ZodObject<{
    themeId: z.ZodString;
    canonicalName: z.ZodString;
    tags: z.ZodArray<z.ZodString, "many">;
    edge: z.ZodEnum<["RELATED_TO", "PARENT", "CHILD"]>;
    weight: z.ZodNumber;
    oneLineSummary: z.ZodString;
}, "strip", z.ZodTypeAny, {
    tags: string[];
    themeId: string;
    weight: number;
    edge: "RELATED_TO" | "PARENT" | "CHILD";
    canonicalName: string;
    oneLineSummary: string;
}, {
    tags: string[];
    themeId: string;
    weight: number;
    edge: "RELATED_TO" | "PARENT" | "CHILD";
    canonicalName: string;
    oneLineSummary: string;
}>;
export type KnowledgeNeighborhoodNeighbor = z.infer<typeof knowledgeNeighborhoodNeighborSchema>;
export declare const knowledgeNeighborhoodEntitySchema: z.ZodObject<{
    entityId: z.ZodString;
    canonicalName: z.ZodString;
    kind: z.ZodString;
}, "strip", z.ZodTypeAny, {
    kind: string;
    entityId: string;
    canonicalName: string;
}, {
    kind: string;
    entityId: string;
    canonicalName: string;
}>;
export type KnowledgeNeighborhoodEntity = z.infer<typeof knowledgeNeighborhoodEntitySchema>;
export declare const knowledgeNeighborhoodSchema: z.ZodObject<{
    node: z.ZodObject<{
        themeId: z.ZodString;
        canonicalName: z.ZodString;
        tags: z.ZodArray<z.ZodString, "many">;
        summary: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        tags: string[];
        themeId: string;
        canonicalName: string;
        summary: string;
    }, {
        tags: string[];
        themeId: string;
        canonicalName: string;
        summary: string;
    }>;
    neighbors: z.ZodArray<z.ZodObject<{
        themeId: z.ZodString;
        canonicalName: z.ZodString;
        tags: z.ZodArray<z.ZodString, "many">;
        edge: z.ZodEnum<["RELATED_TO", "PARENT", "CHILD"]>;
        weight: z.ZodNumber;
        oneLineSummary: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        tags: string[];
        themeId: string;
        weight: number;
        edge: "RELATED_TO" | "PARENT" | "CHILD";
        canonicalName: string;
        oneLineSummary: string;
    }, {
        tags: string[];
        themeId: string;
        weight: number;
        edge: "RELATED_TO" | "PARENT" | "CHILD";
        canonicalName: string;
        oneLineSummary: string;
    }>, "many">;
    entities: z.ZodArray<z.ZodObject<{
        entityId: z.ZodString;
        canonicalName: z.ZodString;
        kind: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        kind: string;
        entityId: string;
        canonicalName: string;
    }, {
        kind: string;
        entityId: string;
        canonicalName: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    node: {
        tags: string[];
        themeId: string;
        canonicalName: string;
        summary: string;
    };
    neighbors: {
        tags: string[];
        themeId: string;
        weight: number;
        edge: "RELATED_TO" | "PARENT" | "CHILD";
        canonicalName: string;
        oneLineSummary: string;
    }[];
    entities: {
        kind: string;
        entityId: string;
        canonicalName: string;
    }[];
}, {
    node: {
        tags: string[];
        themeId: string;
        canonicalName: string;
        summary: string;
    };
    neighbors: {
        tags: string[];
        themeId: string;
        weight: number;
        edge: "RELATED_TO" | "PARENT" | "CHILD";
        canonicalName: string;
        oneLineSummary: string;
    }[];
    entities: {
        kind: string;
        entityId: string;
        canonicalName: string;
    }[];
}>;
export type KnowledgeNeighborhood = z.infer<typeof knowledgeNeighborhoodSchema>;
export declare const DEFAULT_SYNTHESIS_INPUT_TOKEN_BUDGET = 50000;
export declare const synthesisAudienceSchema: z.ZodObject<{
    id: z.ZodNullable<z.ZodString>;
    name: z.ZodString;
    publicEligible: z.ZodBoolean;
    maxSensitivity: z.ZodDefault<z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>>;
}, "strip", z.ZodTypeAny, {
    id: string | null;
    name: string;
    publicEligible: boolean;
    maxSensitivity: "public" | "team_scoped" | "restricted" | "confidential";
}, {
    id: string | null;
    name: string;
    publicEligible: boolean;
    maxSensitivity?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
}>;
export type SynthesisAudience = z.infer<typeof synthesisAudienceSchema>;
export declare const synthesisRequestSchema: z.ZodObject<{
    type: z.ZodLiteral<"wiki_synthesis">;
    requestId: z.ZodString;
    themeId: z.ZodString;
    orgId: z.ZodString;
    themeName: z.ZodString;
    themeType: z.ZodString;
    parentThemeCount: z.ZodNumber;
    factRefs: z.ZodArray<z.ZodObject<{
        factId: z.ZodString;
        s3Key: z.ZodString;
        occurredAt: z.ZodString;
        kind: z.ZodString;
        score: z.ZodNumber;
        sourceKind: z.ZodOptional<z.ZodString>;
        sensitivityLevel: z.ZodDefault<z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>>;
    }, "strip", z.ZodTypeAny, {
        kind: string;
        factId: string;
        occurredAt: string;
        sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
        score: number;
        s3Key: string;
        sourceKind?: string | undefined;
    }, {
        kind: string;
        factId: string;
        occurredAt: string;
        score: number;
        s3Key: string;
        sourceKind?: string | undefined;
        sensitivityLevel?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
    }>, "many">;
    relatedThemes: z.ZodArray<z.ZodObject<{
        themeId: z.ZodString;
        name: z.ZodString;
        similarity: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        name: string;
        themeId: string;
        similarity: number;
    }, {
        name: string;
        themeId: string;
        similarity: number;
    }>, "many">;
    contributorCount: z.ZodNumber;
    audiences: z.ZodArray<z.ZodObject<{
        id: z.ZodNullable<z.ZodString>;
        name: z.ZodString;
        publicEligible: z.ZodBoolean;
        maxSensitivity: z.ZodDefault<z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>>;
    }, "strip", z.ZodTypeAny, {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity: "public" | "team_scoped" | "restricted" | "confidential";
    }, {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
    }>, "many">;
    newlyAssociatedFactIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    inputTokenBudget: z.ZodDefault<z.ZodNumber>;
    knowledgeSkeleton: z.ZodOptional<z.ZodObject<{
        node: z.ZodObject<{
            themeId: z.ZodString;
            tags: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            tags: string[];
            themeId: string;
        }, {
            tags: string[];
            themeId: string;
        }>;
        neighbors: z.ZodArray<z.ZodObject<{
            themeId: z.ZodString;
            tags: z.ZodArray<z.ZodString, "many">;
            edge: z.ZodEnum<["RELATED_TO", "PARENT", "CHILD"]>;
            weight: z.ZodNumber;
            hops: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            tags: string[];
            themeId: string;
            weight: number;
            edge: "RELATED_TO" | "PARENT" | "CHILD";
            hops: number;
        }, {
            tags: string[];
            themeId: string;
            weight: number;
            edge: "RELATED_TO" | "PARENT" | "CHILD";
            hops: number;
        }>, "many">;
        entities: z.ZodArray<z.ZodObject<{
            entityId: z.ZodString;
            kind: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            kind: string;
            entityId: string;
        }, {
            kind: string;
            entityId: string;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        node: {
            tags: string[];
            themeId: string;
        };
        neighbors: {
            tags: string[];
            themeId: string;
            weight: number;
            edge: "RELATED_TO" | "PARENT" | "CHILD";
            hops: number;
        }[];
        entities: {
            kind: string;
            entityId: string;
        }[];
    }, {
        node: {
            tags: string[];
            themeId: string;
        };
        neighbors: {
            tags: string[];
            themeId: string;
            weight: number;
            edge: "RELATED_TO" | "PARENT" | "CHILD";
            hops: number;
        }[];
        entities: {
            kind: string;
            entityId: string;
        }[];
    }>>;
}, "strip", z.ZodTypeAny, {
    type: "wiki_synthesis";
    themeId: string;
    orgId: string;
    requestId: string;
    themeName: string;
    themeType: string;
    parentThemeCount: number;
    factRefs: {
        kind: string;
        factId: string;
        occurredAt: string;
        sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
        score: number;
        s3Key: string;
        sourceKind?: string | undefined;
    }[];
    relatedThemes: {
        name: string;
        themeId: string;
        similarity: number;
    }[];
    contributorCount: number;
    audiences: {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity: "public" | "team_scoped" | "restricted" | "confidential";
    }[];
    newlyAssociatedFactIds: string[];
    inputTokenBudget: number;
    knowledgeSkeleton?: {
        node: {
            tags: string[];
            themeId: string;
        };
        neighbors: {
            tags: string[];
            themeId: string;
            weight: number;
            edge: "RELATED_TO" | "PARENT" | "CHILD";
            hops: number;
        }[];
        entities: {
            kind: string;
            entityId: string;
        }[];
    } | undefined;
}, {
    type: "wiki_synthesis";
    themeId: string;
    orgId: string;
    requestId: string;
    themeName: string;
    themeType: string;
    parentThemeCount: number;
    factRefs: {
        kind: string;
        factId: string;
        occurredAt: string;
        score: number;
        s3Key: string;
        sourceKind?: string | undefined;
        sensitivityLevel?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
    }[];
    relatedThemes: {
        name: string;
        themeId: string;
        similarity: number;
    }[];
    contributorCount: number;
    audiences: {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
    }[];
    newlyAssociatedFactIds?: string[] | undefined;
    inputTokenBudget?: number | undefined;
    knowledgeSkeleton?: {
        node: {
            tags: string[];
            themeId: string;
        };
        neighbors: {
            tags: string[];
            themeId: string;
            weight: number;
            edge: "RELATED_TO" | "PARENT" | "CHILD";
            hops: number;
        }[];
        entities: {
            kind: string;
            entityId: string;
        }[];
    } | undefined;
}>;
export type SynthesisRequest = z.infer<typeof synthesisRequestSchema>;
export declare const themeContainerFactRefSchema: z.ZodObject<{
    factId: z.ZodString;
    s3Key: z.ZodString;
    occurredAt: z.ZodString;
    entities: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    factId: string;
    occurredAt: string;
    s3Key: string;
    entities: string[];
}, {
    factId: string;
    occurredAt: string;
    s3Key: string;
    entities?: string[] | undefined;
}>;
export type ThemeContainerFactRef = z.infer<typeof themeContainerFactRefSchema>;
export declare const themeContainerRefSchema: z.ZodObject<{
    containerId: z.ZodString;
    label: z.ZodString;
    team: z.ZodString;
    factRefs: z.ZodArray<z.ZodObject<{
        factId: z.ZodString;
        s3Key: z.ZodString;
        occurredAt: z.ZodString;
        entities: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strip", z.ZodTypeAny, {
        factId: string;
        occurredAt: string;
        s3Key: string;
        entities: string[];
    }, {
        factId: string;
        occurredAt: string;
        s3Key: string;
        entities?: string[] | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    label: string;
    team: string;
    factRefs: {
        factId: string;
        occurredAt: string;
        s3Key: string;
        entities: string[];
    }[];
    containerId: string;
}, {
    label: string;
    team: string;
    factRefs: {
        factId: string;
        occurredAt: string;
        s3Key: string;
        entities?: string[] | undefined;
    }[];
    containerId: string;
}>;
export type ThemeContainerRef = z.infer<typeof themeContainerRefSchema>;
export declare const themeSynthesisRequestSchema: z.ZodObject<{
    type: z.ZodLiteral<"theme_synthesis">;
    requestId: z.ZodString;
    orgId: z.ZodString;
    containers: z.ZodArray<z.ZodObject<{
        containerId: z.ZodString;
        label: z.ZodString;
        team: z.ZodString;
        factRefs: z.ZodArray<z.ZodObject<{
            factId: z.ZodString;
            s3Key: z.ZodString;
            occurredAt: z.ZodString;
            entities: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            factId: string;
            occurredAt: string;
            s3Key: string;
            entities: string[];
        }, {
            factId: string;
            occurredAt: string;
            s3Key: string;
            entities?: string[] | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        label: string;
        team: string;
        factRefs: {
            factId: string;
            occurredAt: string;
            s3Key: string;
            entities: string[];
        }[];
        containerId: string;
    }, {
        label: string;
        team: string;
        factRefs: {
            factId: string;
            occurredAt: string;
            s3Key: string;
            entities?: string[] | undefined;
        }[];
        containerId: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type: "theme_synthesis";
    orgId: string;
    requestId: string;
    containers: {
        label: string;
        team: string;
        factRefs: {
            factId: string;
            occurredAt: string;
            s3Key: string;
            entities: string[];
        }[];
        containerId: string;
    }[];
}, {
    type: "theme_synthesis";
    orgId: string;
    requestId: string;
    containers: {
        label: string;
        team: string;
        factRefs: {
            factId: string;
            occurredAt: string;
            s3Key: string;
            entities?: string[] | undefined;
        }[];
        containerId: string;
    }[];
}>;
export type ThemeSynthesisRequest = z.infer<typeof themeSynthesisRequestSchema>;
export declare const teamOnboardingThemeSchema: z.ZodObject<{
    themeId: z.ZodString;
    name: z.ZodString;
    themeType: z.ZodString;
    factRefs: z.ZodArray<z.ZodObject<{
        factId: z.ZodString;
        s3Key: z.ZodString;
        occurredAt: z.ZodString;
        kind: z.ZodString;
        score: z.ZodNumber;
        sourceKind: z.ZodOptional<z.ZodString>;
        sensitivityLevel: z.ZodDefault<z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>>;
    }, "strip", z.ZodTypeAny, {
        kind: string;
        factId: string;
        occurredAt: string;
        sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
        score: number;
        s3Key: string;
        sourceKind?: string | undefined;
    }, {
        kind: string;
        factId: string;
        occurredAt: string;
        score: number;
        s3Key: string;
        sourceKind?: string | undefined;
        sensitivityLevel?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    name: string;
    themeId: string;
    themeType: string;
    factRefs: {
        kind: string;
        factId: string;
        occurredAt: string;
        sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
        score: number;
        s3Key: string;
        sourceKind?: string | undefined;
    }[];
}, {
    name: string;
    themeId: string;
    themeType: string;
    factRefs: {
        kind: string;
        factId: string;
        occurredAt: string;
        score: number;
        s3Key: string;
        sourceKind?: string | undefined;
        sensitivityLevel?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
    }[];
}>;
export type TeamOnboardingTheme = z.infer<typeof teamOnboardingThemeSchema>;
export declare const teamOnboardingSynthesisRequestSchema: z.ZodObject<{
    type: z.ZodLiteral<"team_onboarding_synthesis">;
    requestId: z.ZodString;
    orgId: z.ZodString;
    teamId: z.ZodString;
    teamName: z.ZodString;
    themes: z.ZodArray<z.ZodObject<{
        themeId: z.ZodString;
        name: z.ZodString;
        themeType: z.ZodString;
        factRefs: z.ZodArray<z.ZodObject<{
            factId: z.ZodString;
            s3Key: z.ZodString;
            occurredAt: z.ZodString;
            kind: z.ZodString;
            score: z.ZodNumber;
            sourceKind: z.ZodOptional<z.ZodString>;
            sensitivityLevel: z.ZodDefault<z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>>;
        }, "strip", z.ZodTypeAny, {
            kind: string;
            factId: string;
            occurredAt: string;
            sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
            score: number;
            s3Key: string;
            sourceKind?: string | undefined;
        }, {
            kind: string;
            factId: string;
            occurredAt: string;
            score: number;
            s3Key: string;
            sourceKind?: string | undefined;
            sensitivityLevel?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        name: string;
        themeId: string;
        themeType: string;
        factRefs: {
            kind: string;
            factId: string;
            occurredAt: string;
            sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
            score: number;
            s3Key: string;
            sourceKind?: string | undefined;
        }[];
    }, {
        name: string;
        themeId: string;
        themeType: string;
        factRefs: {
            kind: string;
            factId: string;
            occurredAt: string;
            score: number;
            s3Key: string;
            sourceKind?: string | undefined;
            sensitivityLevel?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
        }[];
    }>, "many">;
    audiences: z.ZodArray<z.ZodObject<{
        id: z.ZodNullable<z.ZodString>;
        name: z.ZodString;
        publicEligible: z.ZodBoolean;
        maxSensitivity: z.ZodDefault<z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>>;
    }, "strip", z.ZodTypeAny, {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity: "public" | "team_scoped" | "restricted" | "confidential";
    }, {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
    }>, "many">;
    newlyAssociatedFactIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    inputTokenBudget: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "team_onboarding_synthesis";
    orgId: string;
    requestId: string;
    themes: {
        name: string;
        themeId: string;
        themeType: string;
        factRefs: {
            kind: string;
            factId: string;
            occurredAt: string;
            sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
            score: number;
            s3Key: string;
            sourceKind?: string | undefined;
        }[];
    }[];
    audiences: {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity: "public" | "team_scoped" | "restricted" | "confidential";
    }[];
    newlyAssociatedFactIds: string[];
    inputTokenBudget: number;
    teamId: string;
    teamName: string;
}, {
    type: "team_onboarding_synthesis";
    orgId: string;
    requestId: string;
    themes: {
        name: string;
        themeId: string;
        themeType: string;
        factRefs: {
            kind: string;
            factId: string;
            occurredAt: string;
            score: number;
            s3Key: string;
            sourceKind?: string | undefined;
            sensitivityLevel?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
        }[];
    }[];
    audiences: {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
    }[];
    teamId: string;
    teamName: string;
    newlyAssociatedFactIds?: string[] | undefined;
    inputTokenBudget?: number | undefined;
}>;
export type TeamOnboardingSynthesisRequest = z.infer<typeof teamOnboardingSynthesisRequestSchema>;
export declare const synthesisQueueRequestSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    type: z.ZodLiteral<"wiki_synthesis">;
    requestId: z.ZodString;
    themeId: z.ZodString;
    orgId: z.ZodString;
    themeName: z.ZodString;
    themeType: z.ZodString;
    parentThemeCount: z.ZodNumber;
    factRefs: z.ZodArray<z.ZodObject<{
        factId: z.ZodString;
        s3Key: z.ZodString;
        occurredAt: z.ZodString;
        kind: z.ZodString;
        score: z.ZodNumber;
        sourceKind: z.ZodOptional<z.ZodString>;
        sensitivityLevel: z.ZodDefault<z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>>;
    }, "strip", z.ZodTypeAny, {
        kind: string;
        factId: string;
        occurredAt: string;
        sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
        score: number;
        s3Key: string;
        sourceKind?: string | undefined;
    }, {
        kind: string;
        factId: string;
        occurredAt: string;
        score: number;
        s3Key: string;
        sourceKind?: string | undefined;
        sensitivityLevel?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
    }>, "many">;
    relatedThemes: z.ZodArray<z.ZodObject<{
        themeId: z.ZodString;
        name: z.ZodString;
        similarity: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        name: string;
        themeId: string;
        similarity: number;
    }, {
        name: string;
        themeId: string;
        similarity: number;
    }>, "many">;
    contributorCount: z.ZodNumber;
    audiences: z.ZodArray<z.ZodObject<{
        id: z.ZodNullable<z.ZodString>;
        name: z.ZodString;
        publicEligible: z.ZodBoolean;
        maxSensitivity: z.ZodDefault<z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>>;
    }, "strip", z.ZodTypeAny, {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity: "public" | "team_scoped" | "restricted" | "confidential";
    }, {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
    }>, "many">;
    newlyAssociatedFactIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    inputTokenBudget: z.ZodDefault<z.ZodNumber>;
    knowledgeSkeleton: z.ZodOptional<z.ZodObject<{
        node: z.ZodObject<{
            themeId: z.ZodString;
            tags: z.ZodArray<z.ZodString, "many">;
        }, "strip", z.ZodTypeAny, {
            tags: string[];
            themeId: string;
        }, {
            tags: string[];
            themeId: string;
        }>;
        neighbors: z.ZodArray<z.ZodObject<{
            themeId: z.ZodString;
            tags: z.ZodArray<z.ZodString, "many">;
            edge: z.ZodEnum<["RELATED_TO", "PARENT", "CHILD"]>;
            weight: z.ZodNumber;
            hops: z.ZodNumber;
        }, "strip", z.ZodTypeAny, {
            tags: string[];
            themeId: string;
            weight: number;
            edge: "RELATED_TO" | "PARENT" | "CHILD";
            hops: number;
        }, {
            tags: string[];
            themeId: string;
            weight: number;
            edge: "RELATED_TO" | "PARENT" | "CHILD";
            hops: number;
        }>, "many">;
        entities: z.ZodArray<z.ZodObject<{
            entityId: z.ZodString;
            kind: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            kind: string;
            entityId: string;
        }, {
            kind: string;
            entityId: string;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        node: {
            tags: string[];
            themeId: string;
        };
        neighbors: {
            tags: string[];
            themeId: string;
            weight: number;
            edge: "RELATED_TO" | "PARENT" | "CHILD";
            hops: number;
        }[];
        entities: {
            kind: string;
            entityId: string;
        }[];
    }, {
        node: {
            tags: string[];
            themeId: string;
        };
        neighbors: {
            tags: string[];
            themeId: string;
            weight: number;
            edge: "RELATED_TO" | "PARENT" | "CHILD";
            hops: number;
        }[];
        entities: {
            kind: string;
            entityId: string;
        }[];
    }>>;
}, "strip", z.ZodTypeAny, {
    type: "wiki_synthesis";
    themeId: string;
    orgId: string;
    requestId: string;
    themeName: string;
    themeType: string;
    parentThemeCount: number;
    factRefs: {
        kind: string;
        factId: string;
        occurredAt: string;
        sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
        score: number;
        s3Key: string;
        sourceKind?: string | undefined;
    }[];
    relatedThemes: {
        name: string;
        themeId: string;
        similarity: number;
    }[];
    contributorCount: number;
    audiences: {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity: "public" | "team_scoped" | "restricted" | "confidential";
    }[];
    newlyAssociatedFactIds: string[];
    inputTokenBudget: number;
    knowledgeSkeleton?: {
        node: {
            tags: string[];
            themeId: string;
        };
        neighbors: {
            tags: string[];
            themeId: string;
            weight: number;
            edge: "RELATED_TO" | "PARENT" | "CHILD";
            hops: number;
        }[];
        entities: {
            kind: string;
            entityId: string;
        }[];
    } | undefined;
}, {
    type: "wiki_synthesis";
    themeId: string;
    orgId: string;
    requestId: string;
    themeName: string;
    themeType: string;
    parentThemeCount: number;
    factRefs: {
        kind: string;
        factId: string;
        occurredAt: string;
        score: number;
        s3Key: string;
        sourceKind?: string | undefined;
        sensitivityLevel?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
    }[];
    relatedThemes: {
        name: string;
        themeId: string;
        similarity: number;
    }[];
    contributorCount: number;
    audiences: {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
    }[];
    newlyAssociatedFactIds?: string[] | undefined;
    inputTokenBudget?: number | undefined;
    knowledgeSkeleton?: {
        node: {
            tags: string[];
            themeId: string;
        };
        neighbors: {
            tags: string[];
            themeId: string;
            weight: number;
            edge: "RELATED_TO" | "PARENT" | "CHILD";
            hops: number;
        }[];
        entities: {
            kind: string;
            entityId: string;
        }[];
    } | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"theme_synthesis">;
    requestId: z.ZodString;
    orgId: z.ZodString;
    containers: z.ZodArray<z.ZodObject<{
        containerId: z.ZodString;
        label: z.ZodString;
        team: z.ZodString;
        factRefs: z.ZodArray<z.ZodObject<{
            factId: z.ZodString;
            s3Key: z.ZodString;
            occurredAt: z.ZodString;
            entities: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strip", z.ZodTypeAny, {
            factId: string;
            occurredAt: string;
            s3Key: string;
            entities: string[];
        }, {
            factId: string;
            occurredAt: string;
            s3Key: string;
            entities?: string[] | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        label: string;
        team: string;
        factRefs: {
            factId: string;
            occurredAt: string;
            s3Key: string;
            entities: string[];
        }[];
        containerId: string;
    }, {
        label: string;
        team: string;
        factRefs: {
            factId: string;
            occurredAt: string;
            s3Key: string;
            entities?: string[] | undefined;
        }[];
        containerId: string;
    }>, "many">;
}, "strip", z.ZodTypeAny, {
    type: "theme_synthesis";
    orgId: string;
    requestId: string;
    containers: {
        label: string;
        team: string;
        factRefs: {
            factId: string;
            occurredAt: string;
            s3Key: string;
            entities: string[];
        }[];
        containerId: string;
    }[];
}, {
    type: "theme_synthesis";
    orgId: string;
    requestId: string;
    containers: {
        label: string;
        team: string;
        factRefs: {
            factId: string;
            occurredAt: string;
            s3Key: string;
            entities?: string[] | undefined;
        }[];
        containerId: string;
    }[];
}>, z.ZodObject<{
    type: z.ZodLiteral<"team_onboarding_synthesis">;
    requestId: z.ZodString;
    orgId: z.ZodString;
    teamId: z.ZodString;
    teamName: z.ZodString;
    themes: z.ZodArray<z.ZodObject<{
        themeId: z.ZodString;
        name: z.ZodString;
        themeType: z.ZodString;
        factRefs: z.ZodArray<z.ZodObject<{
            factId: z.ZodString;
            s3Key: z.ZodString;
            occurredAt: z.ZodString;
            kind: z.ZodString;
            score: z.ZodNumber;
            sourceKind: z.ZodOptional<z.ZodString>;
            sensitivityLevel: z.ZodDefault<z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>>;
        }, "strip", z.ZodTypeAny, {
            kind: string;
            factId: string;
            occurredAt: string;
            sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
            score: number;
            s3Key: string;
            sourceKind?: string | undefined;
        }, {
            kind: string;
            factId: string;
            occurredAt: string;
            score: number;
            s3Key: string;
            sourceKind?: string | undefined;
            sensitivityLevel?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
        }>, "many">;
    }, "strip", z.ZodTypeAny, {
        name: string;
        themeId: string;
        themeType: string;
        factRefs: {
            kind: string;
            factId: string;
            occurredAt: string;
            sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
            score: number;
            s3Key: string;
            sourceKind?: string | undefined;
        }[];
    }, {
        name: string;
        themeId: string;
        themeType: string;
        factRefs: {
            kind: string;
            factId: string;
            occurredAt: string;
            score: number;
            s3Key: string;
            sourceKind?: string | undefined;
            sensitivityLevel?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
        }[];
    }>, "many">;
    audiences: z.ZodArray<z.ZodObject<{
        id: z.ZodNullable<z.ZodString>;
        name: z.ZodString;
        publicEligible: z.ZodBoolean;
        maxSensitivity: z.ZodDefault<z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>>;
    }, "strip", z.ZodTypeAny, {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity: "public" | "team_scoped" | "restricted" | "confidential";
    }, {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
    }>, "many">;
    newlyAssociatedFactIds: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    inputTokenBudget: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: "team_onboarding_synthesis";
    orgId: string;
    requestId: string;
    themes: {
        name: string;
        themeId: string;
        themeType: string;
        factRefs: {
            kind: string;
            factId: string;
            occurredAt: string;
            sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
            score: number;
            s3Key: string;
            sourceKind?: string | undefined;
        }[];
    }[];
    audiences: {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity: "public" | "team_scoped" | "restricted" | "confidential";
    }[];
    newlyAssociatedFactIds: string[];
    inputTokenBudget: number;
    teamId: string;
    teamName: string;
}, {
    type: "team_onboarding_synthesis";
    orgId: string;
    requestId: string;
    themes: {
        name: string;
        themeId: string;
        themeType: string;
        factRefs: {
            kind: string;
            factId: string;
            occurredAt: string;
            score: number;
            s3Key: string;
            sourceKind?: string | undefined;
            sensitivityLevel?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
        }[];
    }[];
    audiences: {
        id: string | null;
        name: string;
        publicEligible: boolean;
        maxSensitivity?: "public" | "team_scoped" | "restricted" | "confidential" | undefined;
    }[];
    teamId: string;
    teamName: string;
    newlyAssociatedFactIds?: string[] | undefined;
    inputTokenBudget?: number | undefined;
}>]>;
export type SynthesisQueueRequest = z.infer<typeof synthesisQueueRequestSchema>;
export declare const teamOnboardingSynthesisResultSchema: z.ZodObject<{
    type: z.ZodLiteral<"team_onboarding_synthesis">;
    requestId: z.ZodString;
    orgId: z.ZodString;
    teamId: z.ZodString;
    teamName: z.ZodString;
    articles: z.ZodArray<z.ZodObject<{
        audienceId: z.ZodNullable<z.ZodString>;
        content: z.ZodString;
        contentFormat: z.ZodEnum<["esdk-v1", "plaintext"]>;
        factCount: z.ZodNumber;
    }, "strip", z.ZodTypeAny, {
        content: string;
        factCount: number;
        audienceId: string | null;
        contentFormat: "esdk-v1" | "plaintext";
    }, {
        content: string;
        factCount: number;
        audienceId: string | null;
        contentFormat: "esdk-v1" | "plaintext";
    }>, "many">;
    blocks: z.ZodArray<z.ZodObject<{
        type: z.ZodString;
        sensitivityLevel: z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>;
        audienceId: z.ZodNullable<z.ZodString>;
        factIds: z.ZodArray<z.ZodString, "many">;
        body: z.ZodObject<{
            format: z.ZodLiteral<"esdk-v1">;
            ciphertext: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            format: "esdk-v1";
            ciphertext: string;
        }, {
            format: "esdk-v1";
            ciphertext: string;
        }>;
    }, "strip", z.ZodTypeAny, {
        type: string;
        factIds: string[];
        body: {
            format: "esdk-v1";
            ciphertext: string;
        };
        sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
        audienceId: string | null;
    }, {
        type: string;
        factIds: string[];
        body: {
            format: "esdk-v1";
            ciphertext: string;
        };
        sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
        audienceId: string | null;
    }>, "many">;
    citedFactIds: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    type: "team_onboarding_synthesis";
    blocks: {
        type: string;
        factIds: string[];
        body: {
            format: "esdk-v1";
            ciphertext: string;
        };
        sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
        audienceId: string | null;
    }[];
    orgId: string;
    requestId: string;
    articles: {
        content: string;
        factCount: number;
        audienceId: string | null;
        contentFormat: "esdk-v1" | "plaintext";
    }[];
    citedFactIds: string[];
    teamId: string;
    teamName: string;
}, {
    type: "team_onboarding_synthesis";
    blocks: {
        type: string;
        factIds: string[];
        body: {
            format: "esdk-v1";
            ciphertext: string;
        };
        sensitivityLevel: "public" | "team_scoped" | "restricted" | "confidential";
        audienceId: string | null;
    }[];
    orgId: string;
    requestId: string;
    articles: {
        content: string;
        factCount: number;
        audienceId: string | null;
        contentFormat: "esdk-v1" | "plaintext";
    }[];
    citedFactIds: string[];
    teamId: string;
    teamName: string;
}>;
export type TeamOnboardingSynthesisResult = z.infer<typeof teamOnboardingSynthesisResultSchema>;
export declare const pullCompleteSignalSchema: z.ZodObject<{
    type: z.ZodLiteral<"pull-complete">;
    orgId: z.ZodString;
    sourceKind: z.ZodString;
    sourceId: z.ZodString;
    completedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    type: "pull-complete";
    orgId: string;
    sourceKind: string;
    sourceId: string;
    completedAt: string;
}, {
    type: "pull-complete";
    orgId: string;
    sourceKind: string;
    sourceId: string;
    completedAt: string;
}>;
export type PullCompleteSignal = z.infer<typeof pullCompleteSignalSchema>;
export declare const pullDueMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"pull-due">;
    tenant_id: z.ZodString;
    sourceId: z.ZodString;
    kind: z.ZodString;
    backfill: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    type: "pull-due";
    kind: string;
    sourceId: string;
    tenant_id: string;
    backfill: boolean;
}, {
    type: "pull-due";
    kind: string;
    sourceId: string;
    tenant_id: string;
    backfill?: boolean | undefined;
}>;
export type PullDueMessage = z.infer<typeof pullDueMessageSchema>;
export declare const exportDueMessageSchema: z.ZodObject<{
    type: z.ZodLiteral<"export-due">;
    tenant_id: z.ZodString;
    themeId: z.ZodString;
    targetId: z.ZodString;
    kind: z.ZodEnum<["notion", "clickup"]>;
}, "strict", z.ZodTypeAny, {
    type: "export-due";
    kind: "notion" | "clickup";
    themeId: string;
    tenant_id: string;
    targetId: string;
}, {
    type: "export-due";
    kind: "notion" | "clickup";
    themeId: string;
    tenant_id: string;
    targetId: string;
}>;
export type ExportDueMessage = z.infer<typeof exportDueMessageSchema>;
export declare const exportCompleteSignalSchema: z.ZodObject<{
    type: z.ZodLiteral<"export-complete">;
    orgId: z.ZodString;
    targetId: z.ZodString;
    externalWorkspaceRef: z.ZodString;
    externalPageRef: z.ZodString;
    contentHash: z.ZodString;
    exportedAt: z.ZodString;
}, "strict", z.ZodTypeAny, {
    type: "export-complete";
    orgId: string;
    targetId: string;
    externalWorkspaceRef: string;
    externalPageRef: string;
    contentHash: string;
    exportedAt: string;
}, {
    type: "export-complete";
    orgId: string;
    targetId: string;
    externalWorkspaceRef: string;
    externalPageRef: string;
    contentHash: string;
    exportedAt: string;
}>;
export type ExportCompleteSignal = z.infer<typeof exportCompleteSignalSchema>;
export declare const encryptedInstallationTokenSchema: z.ZodObject<{
    encryptedToken: z.ZodString;
    expiresAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    encryptedToken: string;
    expiresAt: string;
}, {
    encryptedToken: string;
    expiresAt: string;
}>;
export type EncryptedInstallationToken = z.infer<typeof encryptedInstallationTokenSchema>;
//# sourceMappingURL=enclave.d.ts.map