import { z } from 'zod';
export declare const richBlockKindSchema: z.ZodEnum<["diagram", "graph", "chart", "code", "embed", "canvas"]>;
export type RichBlockKind = z.infer<typeof richBlockKindSchema>;
export declare const RICH_BLOCK_KINDS: ["diagram", "graph", "chart", "code", "embed", "canvas"];
export declare const diagramBlockSchema: z.ZodObject<{
    kind: z.ZodLiteral<"diagram">;
    id: z.ZodString;
    mermaid: z.ZodString;
    caption: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id: string;
    kind: "diagram";
    mermaid: string;
    caption?: string | undefined;
}, {
    id: string;
    kind: "diagram";
    mermaid: string;
    caption?: string | undefined;
}>;
export type DiagramBlock = z.infer<typeof diagramBlockSchema>;
export declare const graphDiagramTypeSchema: z.ZodEnum<["flow", "sequence", "class", "er", "state"]>;
export type GraphDiagramType = z.infer<typeof graphDiagramTypeSchema>;
export declare const graphNodeShapeSchema: z.ZodEnum<["step", "decision", "terminal", "actor", "participant", "class", "entity", "state", "initial", "final", "composite"]>;
export type GraphNodeShape = z.infer<typeof graphNodeShapeSchema>;
export declare const graphMemberSchema: z.ZodObject<{
    text: z.ZodString;
    kind: z.ZodOptional<z.ZodEnum<["attribute", "method"]>>;
    key: z.ZodOptional<z.ZodEnum<["primary", "foreign"]>>;
}, "strict", z.ZodTypeAny, {
    text: string;
    key?: "primary" | "foreign" | undefined;
    kind?: "attribute" | "method" | undefined;
}, {
    text: string;
    key?: "primary" | "foreign" | undefined;
    kind?: "attribute" | "method" | undefined;
}>;
export type GraphMember = z.infer<typeof graphMemberSchema>;
export declare const graphNodeSchema: z.ZodObject<{
    id: z.ZodString;
    shape: z.ZodEnum<["step", "decision", "terminal", "actor", "participant", "class", "entity", "state", "initial", "final", "composite"]>;
    label: z.ZodString;
    members: z.ZodOptional<z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        kind: z.ZodOptional<z.ZodEnum<["attribute", "method"]>>;
        key: z.ZodOptional<z.ZodEnum<["primary", "foreign"]>>;
    }, "strict", z.ZodTypeAny, {
        text: string;
        key?: "primary" | "foreign" | undefined;
        kind?: "attribute" | "method" | undefined;
    }, {
        text: string;
        key?: "primary" | "foreign" | undefined;
        kind?: "attribute" | "method" | undefined;
    }>, "many">>;
    parent: z.ZodOptional<z.ZodString>;
    x: z.ZodOptional<z.ZodNumber>;
    y: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    id: string;
    shape: "class" | "state" | "step" | "decision" | "terminal" | "actor" | "participant" | "entity" | "initial" | "final" | "composite";
    label: string;
    members?: {
        text: string;
        key?: "primary" | "foreign" | undefined;
        kind?: "attribute" | "method" | undefined;
    }[] | undefined;
    parent?: string | undefined;
    x?: number | undefined;
    y?: number | undefined;
}, {
    id: string;
    shape: "class" | "state" | "step" | "decision" | "terminal" | "actor" | "participant" | "entity" | "initial" | "final" | "composite";
    label: string;
    members?: {
        text: string;
        key?: "primary" | "foreign" | undefined;
        kind?: "attribute" | "method" | undefined;
    }[] | undefined;
    parent?: string | undefined;
    x?: number | undefined;
    y?: number | undefined;
}>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export declare const graphEdgeRelationSchema: z.ZodEnum<["flow", "inheritance", "realization", "composition", "aggregation", "association", "dependency", "identifying", "nonIdentifying", "sync", "async", "reply", "transition"]>;
export type GraphEdgeRelation = z.infer<typeof graphEdgeRelationSchema>;
export declare const graphCardinalitySchema: z.ZodEnum<["1", "0..1", "1..*", "0..*", "*", "N", "M"]>;
export type GraphCardinality = z.infer<typeof graphCardinalitySchema>;
export declare const graphEdgeSchema: z.ZodObject<{
    id: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
    relation: z.ZodOptional<z.ZodEnum<["flow", "inheritance", "realization", "composition", "aggregation", "association", "dependency", "identifying", "nonIdentifying", "sync", "async", "reply", "transition"]>>;
    fromCardinality: z.ZodOptional<z.ZodEnum<["1", "0..1", "1..*", "0..*", "*", "N", "M"]>>;
    toCardinality: z.ZodOptional<z.ZodEnum<["1", "0..1", "1..*", "0..*", "*", "N", "M"]>>;
    order: z.ZodOptional<z.ZodNumber>;
}, "strict", z.ZodTypeAny, {
    id: string;
    from: string;
    to: string;
    label?: string | undefined;
    relation?: "flow" | "inheritance" | "realization" | "composition" | "aggregation" | "association" | "dependency" | "identifying" | "nonIdentifying" | "sync" | "async" | "reply" | "transition" | undefined;
    fromCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
    toCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
    order?: number | undefined;
}, {
    id: string;
    from: string;
    to: string;
    label?: string | undefined;
    relation?: "flow" | "inheritance" | "realization" | "composition" | "aggregation" | "association" | "dependency" | "identifying" | "nonIdentifying" | "sync" | "async" | "reply" | "transition" | undefined;
    fromCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
    toCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
    order?: number | undefined;
}>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
export declare const graphBlockSchema: z.ZodObject<{
    kind: z.ZodLiteral<"graph">;
    id: z.ZodString;
    diagramType: z.ZodOptional<z.ZodEnum<["flow", "sequence", "class", "er", "state"]>>;
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        shape: z.ZodEnum<["step", "decision", "terminal", "actor", "participant", "class", "entity", "state", "initial", "final", "composite"]>;
        label: z.ZodString;
        members: z.ZodOptional<z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            kind: z.ZodOptional<z.ZodEnum<["attribute", "method"]>>;
            key: z.ZodOptional<z.ZodEnum<["primary", "foreign"]>>;
        }, "strict", z.ZodTypeAny, {
            text: string;
            key?: "primary" | "foreign" | undefined;
            kind?: "attribute" | "method" | undefined;
        }, {
            text: string;
            key?: "primary" | "foreign" | undefined;
            kind?: "attribute" | "method" | undefined;
        }>, "many">>;
        parent: z.ZodOptional<z.ZodString>;
        x: z.ZodOptional<z.ZodNumber>;
        y: z.ZodOptional<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        id: string;
        shape: "class" | "state" | "step" | "decision" | "terminal" | "actor" | "participant" | "entity" | "initial" | "final" | "composite";
        label: string;
        members?: {
            text: string;
            key?: "primary" | "foreign" | undefined;
            kind?: "attribute" | "method" | undefined;
        }[] | undefined;
        parent?: string | undefined;
        x?: number | undefined;
        y?: number | undefined;
    }, {
        id: string;
        shape: "class" | "state" | "step" | "decision" | "terminal" | "actor" | "participant" | "entity" | "initial" | "final" | "composite";
        label: string;
        members?: {
            text: string;
            key?: "primary" | "foreign" | undefined;
            kind?: "attribute" | "method" | undefined;
        }[] | undefined;
        parent?: string | undefined;
        x?: number | undefined;
        y?: number | undefined;
    }>, "many">;
    edges: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
        relation: z.ZodOptional<z.ZodEnum<["flow", "inheritance", "realization", "composition", "aggregation", "association", "dependency", "identifying", "nonIdentifying", "sync", "async", "reply", "transition"]>>;
        fromCardinality: z.ZodOptional<z.ZodEnum<["1", "0..1", "1..*", "0..*", "*", "N", "M"]>>;
        toCardinality: z.ZodOptional<z.ZodEnum<["1", "0..1", "1..*", "0..*", "*", "N", "M"]>>;
        order: z.ZodOptional<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
        relation?: "flow" | "inheritance" | "realization" | "composition" | "aggregation" | "association" | "dependency" | "identifying" | "nonIdentifying" | "sync" | "async" | "reply" | "transition" | undefined;
        fromCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        toCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        order?: number | undefined;
    }, {
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
        relation?: "flow" | "inheritance" | "realization" | "composition" | "aggregation" | "association" | "dependency" | "identifying" | "nonIdentifying" | "sync" | "async" | "reply" | "transition" | undefined;
        fromCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        toCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        order?: number | undefined;
    }>, "many">;
    caption: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id: string;
    kind: "graph";
    nodes: {
        id: string;
        shape: "class" | "state" | "step" | "decision" | "terminal" | "actor" | "participant" | "entity" | "initial" | "final" | "composite";
        label: string;
        members?: {
            text: string;
            key?: "primary" | "foreign" | undefined;
            kind?: "attribute" | "method" | undefined;
        }[] | undefined;
        parent?: string | undefined;
        x?: number | undefined;
        y?: number | undefined;
    }[];
    edges: {
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
        relation?: "flow" | "inheritance" | "realization" | "composition" | "aggregation" | "association" | "dependency" | "identifying" | "nonIdentifying" | "sync" | "async" | "reply" | "transition" | undefined;
        fromCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        toCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        order?: number | undefined;
    }[];
    caption?: string | undefined;
    diagramType?: "flow" | "sequence" | "class" | "er" | "state" | undefined;
}, {
    id: string;
    kind: "graph";
    nodes: {
        id: string;
        shape: "class" | "state" | "step" | "decision" | "terminal" | "actor" | "participant" | "entity" | "initial" | "final" | "composite";
        label: string;
        members?: {
            text: string;
            key?: "primary" | "foreign" | undefined;
            kind?: "attribute" | "method" | undefined;
        }[] | undefined;
        parent?: string | undefined;
        x?: number | undefined;
        y?: number | undefined;
    }[];
    edges: {
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
        relation?: "flow" | "inheritance" | "realization" | "composition" | "aggregation" | "association" | "dependency" | "identifying" | "nonIdentifying" | "sync" | "async" | "reply" | "transition" | undefined;
        fromCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        toCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        order?: number | undefined;
    }[];
    caption?: string | undefined;
    diagramType?: "flow" | "sequence" | "class" | "er" | "state" | undefined;
}>;
export type GraphBlock = z.infer<typeof graphBlockSchema>;
export declare const chartTypeSchema: z.ZodEnum<["line", "bar", "area", "pie", "scatter"]>;
export type ChartType = z.infer<typeof chartTypeSchema>;
export declare const chartPointSchema: z.ZodObject<{
    x: z.ZodUnion<[z.ZodNumber, z.ZodString]>;
    y: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    x: string | number;
    y: number;
}, {
    x: string | number;
    y: number;
}>;
export type ChartPoint = z.infer<typeof chartPointSchema>;
export declare const chartSeriesSchema: z.ZodObject<{
    name: z.ZodString;
    points: z.ZodArray<z.ZodObject<{
        x: z.ZodUnion<[z.ZodNumber, z.ZodString]>;
        y: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        x: string | number;
        y: number;
    }, {
        x: string | number;
        y: number;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    name: string;
    points: {
        x: string | number;
        y: number;
    }[];
}, {
    name: string;
    points: {
        x: string | number;
        y: number;
    }[];
}>;
export type ChartSeries = z.infer<typeof chartSeriesSchema>;
export declare const chartBlockSchema: z.ZodObject<{
    kind: z.ZodLiteral<"chart">;
    id: z.ZodString;
    chartType: z.ZodEnum<["line", "bar", "area", "pie", "scatter"]>;
    series: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        points: z.ZodArray<z.ZodObject<{
            x: z.ZodUnion<[z.ZodNumber, z.ZodString]>;
            y: z.ZodNumber;
        }, "strict", z.ZodTypeAny, {
            x: string | number;
            y: number;
        }, {
            x: string | number;
            y: number;
        }>, "many">;
    }, "strict", z.ZodTypeAny, {
        name: string;
        points: {
            x: string | number;
            y: number;
        }[];
    }, {
        name: string;
        points: {
            x: string | number;
            y: number;
        }[];
    }>, "many">;
    xLabel: z.ZodOptional<z.ZodString>;
    yLabel: z.ZodOptional<z.ZodString>;
    caption: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id: string;
    kind: "chart";
    chartType: "line" | "bar" | "area" | "pie" | "scatter";
    series: {
        name: string;
        points: {
            x: string | number;
            y: number;
        }[];
    }[];
    caption?: string | undefined;
    xLabel?: string | undefined;
    yLabel?: string | undefined;
}, {
    id: string;
    kind: "chart";
    chartType: "line" | "bar" | "area" | "pie" | "scatter";
    series: {
        name: string;
        points: {
            x: string | number;
            y: number;
        }[];
    }[];
    caption?: string | undefined;
    xLabel?: string | undefined;
    yLabel?: string | undefined;
}>;
export type ChartBlock = z.infer<typeof chartBlockSchema>;
export declare const codeBlockSchema: z.ZodObject<{
    kind: z.ZodLiteral<"code">;
    id: z.ZodString;
    language: z.ZodString;
    code: z.ZodString;
    caption: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    code: string;
    id: string;
    kind: "code";
    language: string;
    caption?: string | undefined;
}, {
    code: string;
    id: string;
    kind: "code";
    language: string;
    caption?: string | undefined;
}>;
export type CodeBlock = z.infer<typeof codeBlockSchema>;
export declare const embedBlockSchema: z.ZodObject<{
    kind: z.ZodLiteral<"embed">;
    id: z.ZodString;
    url: z.ZodString;
    provider: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    imageUrl: z.ZodOptional<z.ZodString>;
    faviconUrl: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id: string;
    kind: "embed";
    url: string;
    provider?: string | undefined;
    title?: string | undefined;
    description?: string | undefined;
    imageUrl?: string | undefined;
    faviconUrl?: string | undefined;
}, {
    id: string;
    kind: "embed";
    url: string;
    provider?: string | undefined;
    title?: string | undefined;
    description?: string | undefined;
    imageUrl?: string | undefined;
    faviconUrl?: string | undefined;
}>;
export type EmbedBlock = z.infer<typeof embedBlockSchema>;
export declare const canvasStickyColorSchema: z.ZodEnum<["butter", "mint", "blush", "lilac", "sky", "clay", "periwinkle"]>;
export type CanvasStickyColor = z.infer<typeof canvasStickyColorSchema>;
export declare const canvasTextSizeSchema: z.ZodEnum<["sm", "md", "lg"]>;
export type CanvasTextSize = z.infer<typeof canvasTextSizeSchema>;
export declare const canvasStickerEmojiSchema: z.ZodEnum<["👍", "👎", "💜", "🎉", "🔥", "🚨", "❓", "✅", "❌", "👀", "🚀", "💡"]>;
export type CanvasStickerEmoji = z.infer<typeof canvasStickerEmojiSchema>;
export declare const MAX_CANVAS_OBJECTS = 300;
export declare const canvasStickySchema: z.ZodObject<{
    w: z.ZodOptional<z.ZodNumber>;
    h: z.ZodOptional<z.ZodNumber>;
    text: z.ZodString;
    color: z.ZodEnum<["butter", "mint", "blush", "lilac", "sky", "clay", "periwinkle"]>;
    factIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    frameId: z.ZodOptional<z.ZodString>;
    x: z.ZodOptional<z.ZodNumber>;
    y: z.ZodOptional<z.ZodNumber>;
    type: z.ZodLiteral<"sticky">;
    id: z.ZodString;
}, "strict", z.ZodTypeAny, {
    type: "sticky";
    color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
    id: string;
    text: string;
    x?: number | undefined;
    y?: number | undefined;
    w?: number | undefined;
    h?: number | undefined;
    factIds?: string[] | undefined;
    frameId?: string | undefined;
}, {
    type: "sticky";
    color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
    id: string;
    text: string;
    x?: number | undefined;
    y?: number | undefined;
    w?: number | undefined;
    h?: number | undefined;
    factIds?: string[] | undefined;
    frameId?: string | undefined;
}>;
export type CanvasSticky = z.infer<typeof canvasStickySchema>;
export declare const canvasTextSchema: z.ZodObject<{
    w: z.ZodOptional<z.ZodNumber>;
    text: z.ZodString;
    size: z.ZodEnum<["sm", "md", "lg"]>;
    frameId: z.ZodOptional<z.ZodString>;
    x: z.ZodOptional<z.ZodNumber>;
    y: z.ZodOptional<z.ZodNumber>;
    type: z.ZodLiteral<"text">;
    id: z.ZodString;
}, "strict", z.ZodTypeAny, {
    type: "text";
    id: string;
    text: string;
    size: "sm" | "md" | "lg";
    x?: number | undefined;
    y?: number | undefined;
    w?: number | undefined;
    frameId?: string | undefined;
}, {
    type: "text";
    id: string;
    text: string;
    size: "sm" | "md" | "lg";
    x?: number | undefined;
    y?: number | undefined;
    w?: number | undefined;
    frameId?: string | undefined;
}>;
export type CanvasTextObject = z.infer<typeof canvasTextSchema>;
export declare const canvasStickerSchema: z.ZodObject<{
    emoji: z.ZodEnum<["👍", "👎", "💜", "🎉", "🔥", "🚨", "❓", "✅", "❌", "👀", "🚀", "💡"]>;
    frameId: z.ZodOptional<z.ZodString>;
    x: z.ZodOptional<z.ZodNumber>;
    y: z.ZodOptional<z.ZodNumber>;
    type: z.ZodLiteral<"sticker">;
    id: z.ZodString;
}, "strict", z.ZodTypeAny, {
    type: "sticker";
    id: string;
    emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
    x?: number | undefined;
    y?: number | undefined;
    frameId?: string | undefined;
}, {
    type: "sticker";
    id: string;
    emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
    x?: number | undefined;
    y?: number | undefined;
    frameId?: string | undefined;
}>;
export type CanvasSticker = z.infer<typeof canvasStickerSchema>;
export declare const canvasFrameSchema: z.ZodObject<{
    w: z.ZodOptional<z.ZodNumber>;
    h: z.ZodOptional<z.ZodNumber>;
    label: z.ZodString;
    x: z.ZodOptional<z.ZodNumber>;
    y: z.ZodOptional<z.ZodNumber>;
    type: z.ZodLiteral<"frame">;
    id: z.ZodString;
}, "strict", z.ZodTypeAny, {
    type: "frame";
    id: string;
    label: string;
    x?: number | undefined;
    y?: number | undefined;
    w?: number | undefined;
    h?: number | undefined;
}, {
    type: "frame";
    id: string;
    label: string;
    x?: number | undefined;
    y?: number | undefined;
    w?: number | undefined;
    h?: number | undefined;
}>;
export type CanvasFrame = z.infer<typeof canvasFrameSchema>;
export declare const canvasConnectorSchema: z.ZodObject<{
    type: z.ZodLiteral<"connector">;
    id: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    type: "connector";
    id: string;
    from: string;
    to: string;
    label?: string | undefined;
}, {
    type: "connector";
    id: string;
    from: string;
    to: string;
    label?: string | undefined;
}>;
export type CanvasConnector = z.infer<typeof canvasConnectorSchema>;
export declare const canvasObjectSchema: z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
    w: z.ZodOptional<z.ZodNumber>;
    h: z.ZodOptional<z.ZodNumber>;
    text: z.ZodString;
    color: z.ZodEnum<["butter", "mint", "blush", "lilac", "sky", "clay", "periwinkle"]>;
    factIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    frameId: z.ZodOptional<z.ZodString>;
    x: z.ZodOptional<z.ZodNumber>;
    y: z.ZodOptional<z.ZodNumber>;
    type: z.ZodLiteral<"sticky">;
    id: z.ZodString;
}, "strict", z.ZodTypeAny, {
    type: "sticky";
    color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
    id: string;
    text: string;
    x?: number | undefined;
    y?: number | undefined;
    w?: number | undefined;
    h?: number | undefined;
    factIds?: string[] | undefined;
    frameId?: string | undefined;
}, {
    type: "sticky";
    color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
    id: string;
    text: string;
    x?: number | undefined;
    y?: number | undefined;
    w?: number | undefined;
    h?: number | undefined;
    factIds?: string[] | undefined;
    frameId?: string | undefined;
}>, z.ZodObject<{
    w: z.ZodOptional<z.ZodNumber>;
    text: z.ZodString;
    size: z.ZodEnum<["sm", "md", "lg"]>;
    frameId: z.ZodOptional<z.ZodString>;
    x: z.ZodOptional<z.ZodNumber>;
    y: z.ZodOptional<z.ZodNumber>;
    type: z.ZodLiteral<"text">;
    id: z.ZodString;
}, "strict", z.ZodTypeAny, {
    type: "text";
    id: string;
    text: string;
    size: "sm" | "md" | "lg";
    x?: number | undefined;
    y?: number | undefined;
    w?: number | undefined;
    frameId?: string | undefined;
}, {
    type: "text";
    id: string;
    text: string;
    size: "sm" | "md" | "lg";
    x?: number | undefined;
    y?: number | undefined;
    w?: number | undefined;
    frameId?: string | undefined;
}>, z.ZodObject<{
    emoji: z.ZodEnum<["👍", "👎", "💜", "🎉", "🔥", "🚨", "❓", "✅", "❌", "👀", "🚀", "💡"]>;
    frameId: z.ZodOptional<z.ZodString>;
    x: z.ZodOptional<z.ZodNumber>;
    y: z.ZodOptional<z.ZodNumber>;
    type: z.ZodLiteral<"sticker">;
    id: z.ZodString;
}, "strict", z.ZodTypeAny, {
    type: "sticker";
    id: string;
    emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
    x?: number | undefined;
    y?: number | undefined;
    frameId?: string | undefined;
}, {
    type: "sticker";
    id: string;
    emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
    x?: number | undefined;
    y?: number | undefined;
    frameId?: string | undefined;
}>, z.ZodObject<{
    w: z.ZodOptional<z.ZodNumber>;
    h: z.ZodOptional<z.ZodNumber>;
    label: z.ZodString;
    x: z.ZodOptional<z.ZodNumber>;
    y: z.ZodOptional<z.ZodNumber>;
    type: z.ZodLiteral<"frame">;
    id: z.ZodString;
}, "strict", z.ZodTypeAny, {
    type: "frame";
    id: string;
    label: string;
    x?: number | undefined;
    y?: number | undefined;
    w?: number | undefined;
    h?: number | undefined;
}, {
    type: "frame";
    id: string;
    label: string;
    x?: number | undefined;
    y?: number | undefined;
    w?: number | undefined;
    h?: number | undefined;
}>, z.ZodObject<{
    type: z.ZodLiteral<"connector">;
    id: z.ZodString;
    from: z.ZodString;
    to: z.ZodString;
    label: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    type: "connector";
    id: string;
    from: string;
    to: string;
    label?: string | undefined;
}, {
    type: "connector";
    id: string;
    from: string;
    to: string;
    label?: string | undefined;
}>]>;
export type CanvasObject = z.infer<typeof canvasObjectSchema>;
export declare const canvasBlockSchema: z.ZodObject<{
    kind: z.ZodLiteral<"canvas">;
    id: z.ZodString;
    objects: z.ZodEffects<z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        w: z.ZodOptional<z.ZodNumber>;
        h: z.ZodOptional<z.ZodNumber>;
        text: z.ZodString;
        color: z.ZodEnum<["butter", "mint", "blush", "lilac", "sky", "clay", "periwinkle"]>;
        factIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        frameId: z.ZodOptional<z.ZodString>;
        x: z.ZodOptional<z.ZodNumber>;
        y: z.ZodOptional<z.ZodNumber>;
        type: z.ZodLiteral<"sticky">;
        id: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        type: "sticky";
        color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
        id: string;
        text: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
        factIds?: string[] | undefined;
        frameId?: string | undefined;
    }, {
        type: "sticky";
        color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
        id: string;
        text: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
        factIds?: string[] | undefined;
        frameId?: string | undefined;
    }>, z.ZodObject<{
        w: z.ZodOptional<z.ZodNumber>;
        text: z.ZodString;
        size: z.ZodEnum<["sm", "md", "lg"]>;
        frameId: z.ZodOptional<z.ZodString>;
        x: z.ZodOptional<z.ZodNumber>;
        y: z.ZodOptional<z.ZodNumber>;
        type: z.ZodLiteral<"text">;
        id: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        type: "text";
        id: string;
        text: string;
        size: "sm" | "md" | "lg";
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        frameId?: string | undefined;
    }, {
        type: "text";
        id: string;
        text: string;
        size: "sm" | "md" | "lg";
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        frameId?: string | undefined;
    }>, z.ZodObject<{
        emoji: z.ZodEnum<["👍", "👎", "💜", "🎉", "🔥", "🚨", "❓", "✅", "❌", "👀", "🚀", "💡"]>;
        frameId: z.ZodOptional<z.ZodString>;
        x: z.ZodOptional<z.ZodNumber>;
        y: z.ZodOptional<z.ZodNumber>;
        type: z.ZodLiteral<"sticker">;
        id: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        type: "sticker";
        id: string;
        emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
        x?: number | undefined;
        y?: number | undefined;
        frameId?: string | undefined;
    }, {
        type: "sticker";
        id: string;
        emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
        x?: number | undefined;
        y?: number | undefined;
        frameId?: string | undefined;
    }>, z.ZodObject<{
        w: z.ZodOptional<z.ZodNumber>;
        h: z.ZodOptional<z.ZodNumber>;
        label: z.ZodString;
        x: z.ZodOptional<z.ZodNumber>;
        y: z.ZodOptional<z.ZodNumber>;
        type: z.ZodLiteral<"frame">;
        id: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        type: "frame";
        id: string;
        label: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
    }, {
        type: "frame";
        id: string;
        label: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"connector">;
        id: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        type: "connector";
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
    }, {
        type: "connector";
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
    }>]>, "many">, ({
        type: "sticky";
        color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
        id: string;
        text: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
        factIds?: string[] | undefined;
        frameId?: string | undefined;
    } | {
        type: "text";
        id: string;
        text: string;
        size: "sm" | "md" | "lg";
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "sticker";
        id: string;
        emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
        x?: number | undefined;
        y?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "frame";
        id: string;
        label: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
    } | {
        type: "connector";
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
    })[], ({
        type: "sticky";
        color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
        id: string;
        text: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
        factIds?: string[] | undefined;
        frameId?: string | undefined;
    } | {
        type: "text";
        id: string;
        text: string;
        size: "sm" | "md" | "lg";
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "sticker";
        id: string;
        emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
        x?: number | undefined;
        y?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "frame";
        id: string;
        label: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
    } | {
        type: "connector";
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
    })[]>;
    caption: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id: string;
    kind: "canvas";
    objects: ({
        type: "sticky";
        color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
        id: string;
        text: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
        factIds?: string[] | undefined;
        frameId?: string | undefined;
    } | {
        type: "text";
        id: string;
        text: string;
        size: "sm" | "md" | "lg";
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "sticker";
        id: string;
        emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
        x?: number | undefined;
        y?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "frame";
        id: string;
        label: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
    } | {
        type: "connector";
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
    })[];
    caption?: string | undefined;
}, {
    id: string;
    kind: "canvas";
    objects: ({
        type: "sticky";
        color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
        id: string;
        text: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
        factIds?: string[] | undefined;
        frameId?: string | undefined;
    } | {
        type: "text";
        id: string;
        text: string;
        size: "sm" | "md" | "lg";
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "sticker";
        id: string;
        emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
        x?: number | undefined;
        y?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "frame";
        id: string;
        label: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
    } | {
        type: "connector";
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
    })[];
    caption?: string | undefined;
}>;
export type CanvasBlock = z.infer<typeof canvasBlockSchema>;
export type CanvasFramedObject = CanvasSticky | CanvasTextObject | CanvasSticker;
export declare function canvasFrameOf(object: CanvasFramedObject, frames: CanvasFrame[]): CanvasFrame | undefined;
/** True when an object list exceeds the cap — checked before zod walks a pathological board. */
export declare function isOverCanvasObjectCap(objects: unknown): boolean;
export declare const richBlockBodySchema: z.ZodDiscriminatedUnion<"kind", [z.ZodObject<{
    kind: z.ZodLiteral<"diagram">;
    id: z.ZodString;
    mermaid: z.ZodString;
    caption: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id: string;
    kind: "diagram";
    mermaid: string;
    caption?: string | undefined;
}, {
    id: string;
    kind: "diagram";
    mermaid: string;
    caption?: string | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"graph">;
    id: z.ZodString;
    diagramType: z.ZodOptional<z.ZodEnum<["flow", "sequence", "class", "er", "state"]>>;
    nodes: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        shape: z.ZodEnum<["step", "decision", "terminal", "actor", "participant", "class", "entity", "state", "initial", "final", "composite"]>;
        label: z.ZodString;
        members: z.ZodOptional<z.ZodArray<z.ZodObject<{
            text: z.ZodString;
            kind: z.ZodOptional<z.ZodEnum<["attribute", "method"]>>;
            key: z.ZodOptional<z.ZodEnum<["primary", "foreign"]>>;
        }, "strict", z.ZodTypeAny, {
            text: string;
            key?: "primary" | "foreign" | undefined;
            kind?: "attribute" | "method" | undefined;
        }, {
            text: string;
            key?: "primary" | "foreign" | undefined;
            kind?: "attribute" | "method" | undefined;
        }>, "many">>;
        parent: z.ZodOptional<z.ZodString>;
        x: z.ZodOptional<z.ZodNumber>;
        y: z.ZodOptional<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        id: string;
        shape: "class" | "state" | "step" | "decision" | "terminal" | "actor" | "participant" | "entity" | "initial" | "final" | "composite";
        label: string;
        members?: {
            text: string;
            key?: "primary" | "foreign" | undefined;
            kind?: "attribute" | "method" | undefined;
        }[] | undefined;
        parent?: string | undefined;
        x?: number | undefined;
        y?: number | undefined;
    }, {
        id: string;
        shape: "class" | "state" | "step" | "decision" | "terminal" | "actor" | "participant" | "entity" | "initial" | "final" | "composite";
        label: string;
        members?: {
            text: string;
            key?: "primary" | "foreign" | undefined;
            kind?: "attribute" | "method" | undefined;
        }[] | undefined;
        parent?: string | undefined;
        x?: number | undefined;
        y?: number | undefined;
    }>, "many">;
    edges: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
        relation: z.ZodOptional<z.ZodEnum<["flow", "inheritance", "realization", "composition", "aggregation", "association", "dependency", "identifying", "nonIdentifying", "sync", "async", "reply", "transition"]>>;
        fromCardinality: z.ZodOptional<z.ZodEnum<["1", "0..1", "1..*", "0..*", "*", "N", "M"]>>;
        toCardinality: z.ZodOptional<z.ZodEnum<["1", "0..1", "1..*", "0..*", "*", "N", "M"]>>;
        order: z.ZodOptional<z.ZodNumber>;
    }, "strict", z.ZodTypeAny, {
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
        relation?: "flow" | "inheritance" | "realization" | "composition" | "aggregation" | "association" | "dependency" | "identifying" | "nonIdentifying" | "sync" | "async" | "reply" | "transition" | undefined;
        fromCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        toCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        order?: number | undefined;
    }, {
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
        relation?: "flow" | "inheritance" | "realization" | "composition" | "aggregation" | "association" | "dependency" | "identifying" | "nonIdentifying" | "sync" | "async" | "reply" | "transition" | undefined;
        fromCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        toCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        order?: number | undefined;
    }>, "many">;
    caption: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id: string;
    kind: "graph";
    nodes: {
        id: string;
        shape: "class" | "state" | "step" | "decision" | "terminal" | "actor" | "participant" | "entity" | "initial" | "final" | "composite";
        label: string;
        members?: {
            text: string;
            key?: "primary" | "foreign" | undefined;
            kind?: "attribute" | "method" | undefined;
        }[] | undefined;
        parent?: string | undefined;
        x?: number | undefined;
        y?: number | undefined;
    }[];
    edges: {
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
        relation?: "flow" | "inheritance" | "realization" | "composition" | "aggregation" | "association" | "dependency" | "identifying" | "nonIdentifying" | "sync" | "async" | "reply" | "transition" | undefined;
        fromCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        toCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        order?: number | undefined;
    }[];
    caption?: string | undefined;
    diagramType?: "flow" | "sequence" | "class" | "er" | "state" | undefined;
}, {
    id: string;
    kind: "graph";
    nodes: {
        id: string;
        shape: "class" | "state" | "step" | "decision" | "terminal" | "actor" | "participant" | "entity" | "initial" | "final" | "composite";
        label: string;
        members?: {
            text: string;
            key?: "primary" | "foreign" | undefined;
            kind?: "attribute" | "method" | undefined;
        }[] | undefined;
        parent?: string | undefined;
        x?: number | undefined;
        y?: number | undefined;
    }[];
    edges: {
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
        relation?: "flow" | "inheritance" | "realization" | "composition" | "aggregation" | "association" | "dependency" | "identifying" | "nonIdentifying" | "sync" | "async" | "reply" | "transition" | undefined;
        fromCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        toCardinality?: "1" | "0..1" | "1..*" | "0..*" | "*" | "N" | "M" | undefined;
        order?: number | undefined;
    }[];
    caption?: string | undefined;
    diagramType?: "flow" | "sequence" | "class" | "er" | "state" | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"chart">;
    id: z.ZodString;
    chartType: z.ZodEnum<["line", "bar", "area", "pie", "scatter"]>;
    series: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        points: z.ZodArray<z.ZodObject<{
            x: z.ZodUnion<[z.ZodNumber, z.ZodString]>;
            y: z.ZodNumber;
        }, "strict", z.ZodTypeAny, {
            x: string | number;
            y: number;
        }, {
            x: string | number;
            y: number;
        }>, "many">;
    }, "strict", z.ZodTypeAny, {
        name: string;
        points: {
            x: string | number;
            y: number;
        }[];
    }, {
        name: string;
        points: {
            x: string | number;
            y: number;
        }[];
    }>, "many">;
    xLabel: z.ZodOptional<z.ZodString>;
    yLabel: z.ZodOptional<z.ZodString>;
    caption: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id: string;
    kind: "chart";
    chartType: "line" | "bar" | "area" | "pie" | "scatter";
    series: {
        name: string;
        points: {
            x: string | number;
            y: number;
        }[];
    }[];
    caption?: string | undefined;
    xLabel?: string | undefined;
    yLabel?: string | undefined;
}, {
    id: string;
    kind: "chart";
    chartType: "line" | "bar" | "area" | "pie" | "scatter";
    series: {
        name: string;
        points: {
            x: string | number;
            y: number;
        }[];
    }[];
    caption?: string | undefined;
    xLabel?: string | undefined;
    yLabel?: string | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"code">;
    id: z.ZodString;
    language: z.ZodString;
    code: z.ZodString;
    caption: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    code: string;
    id: string;
    kind: "code";
    language: string;
    caption?: string | undefined;
}, {
    code: string;
    id: string;
    kind: "code";
    language: string;
    caption?: string | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"embed">;
    id: z.ZodString;
    url: z.ZodString;
    provider: z.ZodOptional<z.ZodString>;
    title: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodString>;
    imageUrl: z.ZodOptional<z.ZodString>;
    faviconUrl: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id: string;
    kind: "embed";
    url: string;
    provider?: string | undefined;
    title?: string | undefined;
    description?: string | undefined;
    imageUrl?: string | undefined;
    faviconUrl?: string | undefined;
}, {
    id: string;
    kind: "embed";
    url: string;
    provider?: string | undefined;
    title?: string | undefined;
    description?: string | undefined;
    imageUrl?: string | undefined;
    faviconUrl?: string | undefined;
}>, z.ZodObject<{
    kind: z.ZodLiteral<"canvas">;
    id: z.ZodString;
    objects: z.ZodEffects<z.ZodArray<z.ZodDiscriminatedUnion<"type", [z.ZodObject<{
        w: z.ZodOptional<z.ZodNumber>;
        h: z.ZodOptional<z.ZodNumber>;
        text: z.ZodString;
        color: z.ZodEnum<["butter", "mint", "blush", "lilac", "sky", "clay", "periwinkle"]>;
        factIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
        frameId: z.ZodOptional<z.ZodString>;
        x: z.ZodOptional<z.ZodNumber>;
        y: z.ZodOptional<z.ZodNumber>;
        type: z.ZodLiteral<"sticky">;
        id: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        type: "sticky";
        color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
        id: string;
        text: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
        factIds?: string[] | undefined;
        frameId?: string | undefined;
    }, {
        type: "sticky";
        color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
        id: string;
        text: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
        factIds?: string[] | undefined;
        frameId?: string | undefined;
    }>, z.ZodObject<{
        w: z.ZodOptional<z.ZodNumber>;
        text: z.ZodString;
        size: z.ZodEnum<["sm", "md", "lg"]>;
        frameId: z.ZodOptional<z.ZodString>;
        x: z.ZodOptional<z.ZodNumber>;
        y: z.ZodOptional<z.ZodNumber>;
        type: z.ZodLiteral<"text">;
        id: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        type: "text";
        id: string;
        text: string;
        size: "sm" | "md" | "lg";
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        frameId?: string | undefined;
    }, {
        type: "text";
        id: string;
        text: string;
        size: "sm" | "md" | "lg";
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        frameId?: string | undefined;
    }>, z.ZodObject<{
        emoji: z.ZodEnum<["👍", "👎", "💜", "🎉", "🔥", "🚨", "❓", "✅", "❌", "👀", "🚀", "💡"]>;
        frameId: z.ZodOptional<z.ZodString>;
        x: z.ZodOptional<z.ZodNumber>;
        y: z.ZodOptional<z.ZodNumber>;
        type: z.ZodLiteral<"sticker">;
        id: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        type: "sticker";
        id: string;
        emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
        x?: number | undefined;
        y?: number | undefined;
        frameId?: string | undefined;
    }, {
        type: "sticker";
        id: string;
        emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
        x?: number | undefined;
        y?: number | undefined;
        frameId?: string | undefined;
    }>, z.ZodObject<{
        w: z.ZodOptional<z.ZodNumber>;
        h: z.ZodOptional<z.ZodNumber>;
        label: z.ZodString;
        x: z.ZodOptional<z.ZodNumber>;
        y: z.ZodOptional<z.ZodNumber>;
        type: z.ZodLiteral<"frame">;
        id: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        type: "frame";
        id: string;
        label: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
    }, {
        type: "frame";
        id: string;
        label: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
    }>, z.ZodObject<{
        type: z.ZodLiteral<"connector">;
        id: z.ZodString;
        from: z.ZodString;
        to: z.ZodString;
        label: z.ZodOptional<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        type: "connector";
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
    }, {
        type: "connector";
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
    }>]>, "many">, ({
        type: "sticky";
        color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
        id: string;
        text: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
        factIds?: string[] | undefined;
        frameId?: string | undefined;
    } | {
        type: "text";
        id: string;
        text: string;
        size: "sm" | "md" | "lg";
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "sticker";
        id: string;
        emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
        x?: number | undefined;
        y?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "frame";
        id: string;
        label: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
    } | {
        type: "connector";
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
    })[], ({
        type: "sticky";
        color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
        id: string;
        text: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
        factIds?: string[] | undefined;
        frameId?: string | undefined;
    } | {
        type: "text";
        id: string;
        text: string;
        size: "sm" | "md" | "lg";
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "sticker";
        id: string;
        emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
        x?: number | undefined;
        y?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "frame";
        id: string;
        label: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
    } | {
        type: "connector";
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
    })[]>;
    caption: z.ZodOptional<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    id: string;
    kind: "canvas";
    objects: ({
        type: "sticky";
        color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
        id: string;
        text: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
        factIds?: string[] | undefined;
        frameId?: string | undefined;
    } | {
        type: "text";
        id: string;
        text: string;
        size: "sm" | "md" | "lg";
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "sticker";
        id: string;
        emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
        x?: number | undefined;
        y?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "frame";
        id: string;
        label: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
    } | {
        type: "connector";
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
    })[];
    caption?: string | undefined;
}, {
    id: string;
    kind: "canvas";
    objects: ({
        type: "sticky";
        color: "butter" | "mint" | "blush" | "lilac" | "sky" | "clay" | "periwinkle";
        id: string;
        text: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
        factIds?: string[] | undefined;
        frameId?: string | undefined;
    } | {
        type: "text";
        id: string;
        text: string;
        size: "sm" | "md" | "lg";
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "sticker";
        id: string;
        emoji: "👍" | "👎" | "💜" | "🎉" | "🔥" | "🚨" | "❓" | "✅" | "❌" | "👀" | "🚀" | "💡";
        x?: number | undefined;
        y?: number | undefined;
        frameId?: string | undefined;
    } | {
        type: "frame";
        id: string;
        label: string;
        x?: number | undefined;
        y?: number | undefined;
        w?: number | undefined;
        h?: number | undefined;
    } | {
        type: "connector";
        id: string;
        from: string;
        to: string;
        label?: string | undefined;
    })[];
    caption?: string | undefined;
}>]>;
export type RichBlockBody = z.infer<typeof richBlockBodySchema>;
export declare const wikiPageBlockSchema: z.ZodObject<{
    id: z.ZodString;
    type: z.ZodString;
    content: z.ZodString;
    lockedBy: z.ZodNullable<z.ZodString>;
    version: z.ZodNumber;
    generatedBy: z.ZodNullable<z.ZodString>;
    promptHash: z.ZodNullable<z.ZodString>;
    outputHash: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    type: string;
    id: string;
    content: string;
    lockedBy: string | null;
    version: number;
    generatedBy: string | null;
    promptHash: string | null;
    outputHash: string | null;
}, {
    type: string;
    id: string;
    content: string;
    lockedBy: string | null;
    version: number;
    generatedBy: string | null;
    promptHash: string | null;
    outputHash: string | null;
}>;
export type WikiPageBlock = z.infer<typeof wikiPageBlockSchema>;
export declare const wikiPageOwnerSchema: z.ZodObject<{
    name: z.ZodString;
    kind: z.ZodEnum<["user", "team"]>;
    isConfirmed: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    kind: "user" | "team";
    name: string;
    isConfirmed: boolean;
}, {
    kind: "user" | "team";
    name: string;
    isConfirmed: boolean;
}>;
export type WikiPageOwner = z.infer<typeof wikiPageOwnerSchema>;
export declare const wikiPageMetaSchema: z.ZodObject<{
    ownerName: z.ZodNullable<z.ZodString>;
    ownerKind: z.ZodNullable<z.ZodEnum<["user", "team"]>>;
    owners: z.ZodOptional<z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        kind: z.ZodEnum<["user", "team"]>;
        isConfirmed: z.ZodBoolean;
    }, "strict", z.ZodTypeAny, {
        kind: "user" | "team";
        name: string;
        isConfirmed: boolean;
    }, {
        kind: "user" | "team";
        name: string;
        isConfirmed: boolean;
    }>, "many">>;
    confidence: z.ZodNumber;
    tags: z.ZodArray<z.ZodString, "many">;
    sources: z.ZodArray<z.ZodString, "many">;
    factCount: z.ZodNumber;
    updatedAt: z.ZodString;
    isAggregate: z.ZodBoolean;
    related: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        name: z.ZodString;
    }, "strict", z.ZodTypeAny, {
        id: string;
        name: string;
    }, {
        id: string;
        name: string;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    ownerName: string | null;
    ownerKind: "user" | "team" | null;
    confidence: number;
    tags: string[];
    sources: string[];
    factCount: number;
    updatedAt: string;
    isAggregate: boolean;
    related: {
        id: string;
        name: string;
    }[];
    owners?: {
        kind: "user" | "team";
        name: string;
        isConfirmed: boolean;
    }[] | undefined;
}, {
    ownerName: string | null;
    ownerKind: "user" | "team" | null;
    confidence: number;
    tags: string[];
    sources: string[];
    factCount: number;
    updatedAt: string;
    isAggregate: boolean;
    related: {
        id: string;
        name: string;
    }[];
    owners?: {
        kind: "user" | "team";
        name: string;
        isConfirmed: boolean;
    }[] | undefined;
}>;
export type WikiPageMeta = z.infer<typeof wikiPageMetaSchema>;
export declare const wikiPageResponseSchema: z.ZodObject<{
    themeId: z.ZodString;
    pageId: z.ZodString;
    title: z.ZodString;
    blocks: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        type: z.ZodString;
        content: z.ZodString;
        lockedBy: z.ZodNullable<z.ZodString>;
        version: z.ZodNumber;
        generatedBy: z.ZodNullable<z.ZodString>;
        promptHash: z.ZodNullable<z.ZodString>;
        outputHash: z.ZodNullable<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        type: string;
        id: string;
        content: string;
        lockedBy: string | null;
        version: number;
        generatedBy: string | null;
        promptHash: string | null;
        outputHash: string | null;
    }, {
        type: string;
        id: string;
        content: string;
        lockedBy: string | null;
        version: number;
        generatedBy: string | null;
        promptHash: string | null;
        outputHash: string | null;
    }>, "many">;
    meta: z.ZodNullable<z.ZodObject<{
        ownerName: z.ZodNullable<z.ZodString>;
        ownerKind: z.ZodNullable<z.ZodEnum<["user", "team"]>>;
        owners: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            kind: z.ZodEnum<["user", "team"]>;
            isConfirmed: z.ZodBoolean;
        }, "strict", z.ZodTypeAny, {
            kind: "user" | "team";
            name: string;
            isConfirmed: boolean;
        }, {
            kind: "user" | "team";
            name: string;
            isConfirmed: boolean;
        }>, "many">>;
        confidence: z.ZodNumber;
        tags: z.ZodArray<z.ZodString, "many">;
        sources: z.ZodArray<z.ZodString, "many">;
        factCount: z.ZodNumber;
        updatedAt: z.ZodString;
        isAggregate: z.ZodBoolean;
        related: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            name: z.ZodString;
        }, "strict", z.ZodTypeAny, {
            id: string;
            name: string;
        }, {
            id: string;
            name: string;
        }>, "many">;
    }, "strict", z.ZodTypeAny, {
        ownerName: string | null;
        ownerKind: "user" | "team" | null;
        confidence: number;
        tags: string[];
        sources: string[];
        factCount: number;
        updatedAt: string;
        isAggregate: boolean;
        related: {
            id: string;
            name: string;
        }[];
        owners?: {
            kind: "user" | "team";
            name: string;
            isConfirmed: boolean;
        }[] | undefined;
    }, {
        ownerName: string | null;
        ownerKind: "user" | "team" | null;
        confidence: number;
        tags: string[];
        sources: string[];
        factCount: number;
        updatedAt: string;
        isAggregate: boolean;
        related: {
            id: string;
            name: string;
        }[];
        owners?: {
            kind: "user" | "team";
            name: string;
            isConfirmed: boolean;
        }[] | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    title: string;
    themeId: string;
    pageId: string;
    blocks: {
        type: string;
        id: string;
        content: string;
        lockedBy: string | null;
        version: number;
        generatedBy: string | null;
        promptHash: string | null;
        outputHash: string | null;
    }[];
    meta: {
        ownerName: string | null;
        ownerKind: "user" | "team" | null;
        confidence: number;
        tags: string[];
        sources: string[];
        factCount: number;
        updatedAt: string;
        isAggregate: boolean;
        related: {
            id: string;
            name: string;
        }[];
        owners?: {
            kind: "user" | "team";
            name: string;
            isConfirmed: boolean;
        }[] | undefined;
    } | null;
}, {
    title: string;
    themeId: string;
    pageId: string;
    blocks: {
        type: string;
        id: string;
        content: string;
        lockedBy: string | null;
        version: number;
        generatedBy: string | null;
        promptHash: string | null;
        outputHash: string | null;
    }[];
    meta: {
        ownerName: string | null;
        ownerKind: "user" | "team" | null;
        confidence: number;
        tags: string[];
        sources: string[];
        factCount: number;
        updatedAt: string;
        isAggregate: boolean;
        related: {
            id: string;
            name: string;
        }[];
        owners?: {
            kind: "user" | "team";
            name: string;
            isConfirmed: boolean;
        }[] | undefined;
    } | null;
}>;
export type WikiPageResponse = z.infer<typeof wikiPageResponseSchema>;
export declare const wikiQualityBlockSchema: z.ZodObject<{
    blockId: z.ZodString;
    themeId: z.ZodNullable<z.ZodString>;
    promptHash: z.ZodString;
    outputHash: z.ZodString;
    helpful: z.ZodNumber;
    notHelpful: z.ZodNumber;
}, "strict", z.ZodTypeAny, {
    promptHash: string;
    outputHash: string;
    themeId: string | null;
    blockId: string;
    helpful: number;
    notHelpful: number;
}, {
    promptHash: string;
    outputHash: string;
    themeId: string | null;
    blockId: string;
    helpful: number;
    notHelpful: number;
}>;
export type WikiQualityBlock = z.infer<typeof wikiQualityBlockSchema>;
export declare const wikiQualityResponseSchema: z.ZodObject<{
    blocks: z.ZodArray<z.ZodObject<{
        blockId: z.ZodString;
        themeId: z.ZodNullable<z.ZodString>;
        promptHash: z.ZodString;
        outputHash: z.ZodString;
        helpful: z.ZodNumber;
        notHelpful: z.ZodNumber;
    }, "strict", z.ZodTypeAny, {
        promptHash: string;
        outputHash: string;
        themeId: string | null;
        blockId: string;
        helpful: number;
        notHelpful: number;
    }, {
        promptHash: string;
        outputHash: string;
        themeId: string | null;
        blockId: string;
        helpful: number;
        notHelpful: number;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    blocks: {
        promptHash: string;
        outputHash: string;
        themeId: string | null;
        blockId: string;
        helpful: number;
        notHelpful: number;
    }[];
}, {
    blocks: {
        promptHash: string;
        outputHash: string;
        themeId: string | null;
        blockId: string;
        helpful: number;
        notHelpful: number;
    }[];
}>;
export type WikiQualityResponse = z.infer<typeof wikiQualityResponseSchema>;
export declare const wikiEditKindSchema: z.ZodEnum<["touch_up", "trim", "expand", "rewrite", "blank"]>;
export type WikiEditKind = z.infer<typeof wikiEditKindSchema>;
export declare const wikiCommentFieldSchema: z.ZodEnum<["anchor", "reply"]>;
export type WikiCommentField = z.infer<typeof wikiCommentFieldSchema>;
export declare const wikiCommentThreadSchema: z.ZodObject<{
    id: z.ZodString;
    pageId: z.ZodString;
    blockId: z.ZodNullable<z.ZodString>;
    anchorText: z.ZodNullable<z.ZodString>;
    resolved: z.ZodBoolean;
    createdBy: z.ZodString;
    createdAt: z.ZodString;
}, "strict", z.ZodTypeAny, {
    id: string;
    pageId: string;
    blockId: string | null;
    anchorText: string | null;
    resolved: boolean;
    createdBy: string;
    createdAt: string;
}, {
    id: string;
    pageId: string;
    blockId: string | null;
    anchorText: string | null;
    resolved: boolean;
    createdBy: string;
    createdAt: string;
}>;
export type WikiCommentThread = z.infer<typeof wikiCommentThreadSchema>;
export declare const wikiCommentReplySchema: z.ZodObject<{
    id: z.ZodString;
    threadId: z.ZodString;
    body: z.ZodString;
    createdBy: z.ZodString;
    authorName: z.ZodString;
    createdAt: z.ZodString;
}, "strict", z.ZodTypeAny, {
    id: string;
    createdBy: string;
    createdAt: string;
    threadId: string;
    body: string;
    authorName: string;
}, {
    id: string;
    createdBy: string;
    createdAt: string;
    threadId: string;
    body: string;
    authorName: string;
}>;
export type WikiCommentReply = z.infer<typeof wikiCommentReplySchema>;
export declare const wikiEditSignalSchema: z.ZodObject<{
    blockType: z.ZodString;
    editKind: z.ZodEnum<["touch_up", "trim", "expand", "rewrite", "blank"]>;
    changeFraction: z.ZodNumber;
    sentencesAdded: z.ZodNumber;
    sentencesRemoved: z.ZodNumber;
    sentencesKept: z.ZodNumber;
    citationsAdded: z.ZodNumber;
    citationsRemoved: z.ZodNumber;
    lengthDeltaChars: z.ZodNumber;
    promptHash: z.ZodNullable<z.ZodString>;
}, "strict", z.ZodTypeAny, {
    promptHash: string | null;
    blockType: string;
    editKind: "touch_up" | "trim" | "expand" | "rewrite" | "blank";
    changeFraction: number;
    sentencesAdded: number;
    sentencesRemoved: number;
    sentencesKept: number;
    citationsAdded: number;
    citationsRemoved: number;
    lengthDeltaChars: number;
}, {
    promptHash: string | null;
    blockType: string;
    editKind: "touch_up" | "trim" | "expand" | "rewrite" | "blank";
    changeFraction: number;
    sentencesAdded: number;
    sentencesRemoved: number;
    sentencesKept: number;
    citationsAdded: number;
    citationsRemoved: number;
    lengthDeltaChars: number;
}>;
export type WikiEditSignal = z.infer<typeof wikiEditSignalSchema>;
//# sourceMappingURL=wiki.d.ts.map