import { z } from 'zod';
import { type WikiExportTargetKind } from './enclave.js';
export declare const exportCeilingSchema: z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>;
export type ExportCeiling = z.infer<typeof exportCeilingSchema>;
export declare const DEFAULT_EXPORT_CEILING: ExportCeiling;
export declare const portableMarkdownBlockSchema: z.ZodObject<{
    kind: z.ZodLiteral<"markdown">;
    markdown: z.ZodString;
}, "strip", z.ZodTypeAny, {
    kind: "markdown";
    markdown: string;
}, {
    kind: "markdown";
    markdown: string;
}>;
export declare const portableCodeBlockSchema: z.ZodObject<{
    kind: z.ZodLiteral<"code">;
    language: z.ZodString;
    code: z.ZodString;
    caption: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code: string;
    kind: "code";
    language: string;
    caption?: string | undefined;
}, {
    code: string;
    kind: "code";
    language: string;
    caption?: string | undefined;
}>;
export declare const portableMermaidBlockSchema: z.ZodObject<{
    kind: z.ZodLiteral<"mermaid">;
    mermaid: z.ZodString;
    caption: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "mermaid";
    mermaid: string;
    caption?: string | undefined;
}, {
    kind: "mermaid";
    mermaid: string;
    caption?: string | undefined;
}>;
export declare const portableBookmarkBlockSchema: z.ZodObject<{
    kind: z.ZodLiteral<"bookmark">;
    url: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "bookmark";
    url: string;
    title?: string | undefined;
    description?: string | undefined;
}, {
    kind: "bookmark";
    url: string;
    title?: string | undefined;
    description?: string | undefined;
}>;
export declare const portableTableBlockSchema: z.ZodObject<{
    kind: z.ZodLiteral<"table">;
    columns: z.ZodArray<z.ZodString, "many">;
    rows: z.ZodArray<z.ZodArray<z.ZodString, "many">, "many">;
    caption: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "table";
    columns: string[];
    rows: string[][];
    caption?: string | undefined;
}, {
    kind: "table";
    columns: string[];
    rows: string[][];
    caption?: string | undefined;
}>;
export declare const portableBlockSchema: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    kind: z.ZodLiteral<"markdown">;
    markdown: z.ZodString;
}, "strip", z.ZodTypeAny, {
    kind: "markdown";
    markdown: string;
}, {
    kind: "markdown";
    markdown: string;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"code">;
    language: z.ZodString;
    code: z.ZodString;
    caption: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    code: string;
    kind: "code";
    language: string;
    caption?: string | undefined;
}, {
    code: string;
    kind: "code";
    language: string;
    caption?: string | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"mermaid">;
    mermaid: z.ZodString;
    caption: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "mermaid";
    mermaid: string;
    caption?: string | undefined;
}, {
    kind: "mermaid";
    mermaid: string;
    caption?: string | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"bookmark">;
    url: z.ZodString;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "bookmark";
    url: string;
    title?: string | undefined;
    description?: string | undefined;
}, {
    kind: "bookmark";
    url: string;
    title?: string | undefined;
    description?: string | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"table">;
    columns: z.ZodArray<z.ZodString, "many">;
    rows: z.ZodArray<z.ZodArray<z.ZodString, "many">, "many">;
    caption: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    kind: "table";
    columns: string[];
    rows: string[][];
    caption?: string | undefined;
}, {
    kind: "table";
    columns: string[];
    rows: string[][];
    caption?: string | undefined;
}>]>;
export type PortableBlock = z.infer<typeof portableBlockSchema>;
export declare const projectedPageSchema: z.ZodObject<{
    themeId: z.ZodString;
    title: z.ZodString;
    ceiling: z.ZodEnum<["public", "team_scoped", "restricted", "confidential"]>;
    acknowledgedAbovePublic: z.ZodBoolean;
    blocks: z.ZodArray<z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
        kind: z.ZodLiteral<"markdown">;
        markdown: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        kind: "markdown";
        markdown: string;
    }, {
        kind: "markdown";
        markdown: string;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"code">;
        language: z.ZodString;
        code: z.ZodString;
        caption: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        code: string;
        kind: "code";
        language: string;
        caption?: string | undefined;
    }, {
        code: string;
        kind: "code";
        language: string;
        caption?: string | undefined;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"mermaid">;
        mermaid: z.ZodString;
        caption: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: "mermaid";
        mermaid: string;
        caption?: string | undefined;
    }, {
        kind: "mermaid";
        mermaid: string;
        caption?: string | undefined;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"bookmark">;
        url: z.ZodString;
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: "bookmark";
        url: string;
        title?: string | undefined;
        description?: string | undefined;
    }, {
        kind: "bookmark";
        url: string;
        title?: string | undefined;
        description?: string | undefined;
    }>, z.ZodObject<{
        kind: z.ZodLiteral<"table">;
        columns: z.ZodArray<z.ZodString, "many">;
        rows: z.ZodArray<z.ZodArray<z.ZodString, "many">, "many">;
        caption: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        kind: "table";
        columns: string[];
        rows: string[][];
        caption?: string | undefined;
    }, {
        kind: "table";
        columns: string[];
        rows: string[][];
        caption?: string | undefined;
    }>]>, "many">;
    contentHash: z.ZodString;
}, "strip", z.ZodTypeAny, {
    title: string;
    themeId: string;
    blocks: ({
        kind: "markdown";
        markdown: string;
    } | {
        code: string;
        kind: "code";
        language: string;
        caption?: string | undefined;
    } | {
        kind: "mermaid";
        mermaid: string;
        caption?: string | undefined;
    } | {
        kind: "bookmark";
        url: string;
        title?: string | undefined;
        description?: string | undefined;
    } | {
        kind: "table";
        columns: string[];
        rows: string[][];
        caption?: string | undefined;
    })[];
    contentHash: string;
    ceiling: "public" | "team_scoped" | "restricted" | "confidential";
    acknowledgedAbovePublic: boolean;
}, {
    title: string;
    themeId: string;
    blocks: ({
        kind: "markdown";
        markdown: string;
    } | {
        code: string;
        kind: "code";
        language: string;
        caption?: string | undefined;
    } | {
        kind: "mermaid";
        mermaid: string;
        caption?: string | undefined;
    } | {
        kind: "bookmark";
        url: string;
        title?: string | undefined;
        description?: string | undefined;
    } | {
        kind: "table";
        columns: string[];
        rows: string[][];
        caption?: string | undefined;
    })[];
    contentHash: string;
    ceiling: "public" | "team_scoped" | "restricted" | "confidential";
    acknowledgedAbovePublic: boolean;
}>;
export type ProjectedPage = z.infer<typeof projectedPageSchema>;
export declare const exportDestinationSchema: z.ZodObject<{
    workspaceRef: z.ZodString;
    pageRef: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    workspaceRef: string;
    pageRef: string | null;
}, {
    workspaceRef: string;
    pageRef: string | null;
}>;
export type ExportDestination = z.infer<typeof exportDestinationSchema>;
export declare const externalPageRefSchema: z.ZodObject<{
    workspaceRef: z.ZodString;
    pageRef: z.ZodString;
}, "strip", z.ZodTypeAny, {
    workspaceRef: string;
    pageRef: string;
}, {
    workspaceRef: string;
    pageRef: string;
}>;
export type ExternalPageRef = z.infer<typeof externalPageRefSchema>;
export interface WikiExportTarget {
    readonly kind: WikiExportTargetKind;
    upsertPage(page: ProjectedPage, destination: ExportDestination): Promise<ExternalPageRef>;
}
//# sourceMappingURL=wiki-export.d.ts.map