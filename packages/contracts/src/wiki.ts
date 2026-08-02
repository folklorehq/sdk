// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

// Rich wiki content blocks. Shared, frozen shape: synthesis (@folklore/wiki
// + enclave) emits these and the box renders them from this single definition — never a
// re-declared mirror. A block's outer `type` is `${kind}:${id}` so a page may hold many
// of one kind; the body carries `kind` again for renderer dispatch on the read side.
export const richBlockKindSchema = z.enum(['diagram', 'graph', 'chart', 'code', 'embed', 'canvas']);
export type RichBlockKind = z.infer<typeof richBlockKindSchema>;
export const RICH_BLOCK_KINDS = richBlockKindSchema.options;

export const diagramBlockSchema = z
  .object({
    kind: z.literal('diagram'),
    id: z.string(),
    mermaid: z.string(),
    caption: z.string().optional(),
  })
  .strict();
export type DiagramBlock = z.infer<typeof diagramBlockSchema>;

// Structured graph — the in-house representation for authored/whiteboard
// diagrams and synthesis-emitted flows: nodes/edges are the source of truth (rendered by us,
// positions persist), so there is no Mermaid text round-trip. The superset enums + optional fields
// let one block hold flow, sequence, class, ER, or state diagrams; `diagramType` defaults to 'flow'
// on the read side so a legacy flowchart body parses byte-identically (additive, no migration).
// Mermaid generation is retired — the `diagram` block stays only as a read-only fallback.
export const graphDiagramTypeSchema = z.enum(['flow', 'sequence', 'class', 'er', 'state']);
export type GraphDiagramType = z.infer<typeof graphDiagramTypeSchema>;

export const graphNodeShapeSchema = z.enum([
  'step',
  'decision',
  'terminal',
  'actor',
  'participant',
  'class',
  'entity',
  'state',
  'initial',
  'final',
  'composite',
]);
export type GraphNodeShape = z.infer<typeof graphNodeShapeSchema>;

// Bounds so an over-large or adversarial graph drops on safeParse rather than reaching the box.
const MAX_GRAPH_NODES = 200;
const MAX_GRAPH_EDGES = 400;
const MAX_GRAPH_LABEL_CHARS = 400;
const MAX_GRAPH_NODE_MEMBERS = 30;
const MAX_GRAPH_MEMBER_CHARS = 120;

// A class attribute/method or ER column; `text` is customer/LLM-derived content, redacted on the
// same footing as node/edge labels.
export const graphMemberSchema = z
  .object({
    text: z.string().max(MAX_GRAPH_MEMBER_CHARS),
    kind: z.enum(['attribute', 'method']).optional(),
    key: z.enum(['primary', 'foreign']).optional(),
  })
  .strict();
export type GraphMember = z.infer<typeof graphMemberSchema>;

// Coordinates are optional: synthesis emits structure only, the editor lays out on read, and a
// human drag persists explicit x/y. `members`/`parent` carry class/ER rows and state nesting.
export const graphNodeSchema = z
  .object({
    id: z.string().min(1),
    shape: graphNodeShapeSchema,
    label: z.string().max(MAX_GRAPH_LABEL_CHARS),
    members: z.array(graphMemberSchema).max(MAX_GRAPH_NODE_MEMBERS).optional(),
    parent: z.string().min(1).optional(),
    x: z.number().finite().optional(),
    y: z.number().finite().optional(),
  })
  .strict();
export type GraphNode = z.infer<typeof graphNodeSchema>;

export const graphEdgeRelationSchema = z.enum([
  'flow',
  'inheritance',
  'realization',
  'composition',
  'aggregation',
  'association',
  'dependency',
  'identifying',
  'nonIdentifying',
  'sync',
  'async',
  'reply',
  'transition',
]);
export type GraphEdgeRelation = z.infer<typeof graphEdgeRelationSchema>;

export const graphCardinalitySchema = z.enum(['1', '0..1', '1..*', '0..*', '*', 'N', 'M']);
export type GraphCardinality = z.infer<typeof graphCardinalitySchema>;

// `order` sequences sequence-diagram messages; cardinalities annotate class/ER associations.
export const graphEdgeSchema = z
  .object({
    id: z.string().min(1),
    from: z.string().min(1),
    to: z.string().min(1),
    label: z.string().max(MAX_GRAPH_LABEL_CHARS).optional(),
    relation: graphEdgeRelationSchema.optional(),
    fromCardinality: graphCardinalitySchema.optional(),
    toCardinality: graphCardinalitySchema.optional(),
    order: z.number().int().nonnegative().optional(),
  })
  .strict();
export type GraphEdge = z.infer<typeof graphEdgeSchema>;

// `diagramType` is soft-optional and defaults to 'flow' on the read side so legacy flowchart bodies
// (no diagramType) parse unchanged.
export const graphBlockSchema = z
  .object({
    kind: z.literal('graph'),
    id: z.string(),
    diagramType: graphDiagramTypeSchema.optional(),
    nodes: z.array(graphNodeSchema).max(MAX_GRAPH_NODES),
    edges: z.array(graphEdgeSchema).max(MAX_GRAPH_EDGES),
    caption: z.string().optional(),
  })
  .strict();
export type GraphBlock = z.infer<typeof graphBlockSchema>;

export const chartTypeSchema = z.enum(['line', 'bar', 'area', 'pie', 'scatter']);
export type ChartType = z.infer<typeof chartTypeSchema>;

// Pure data only — an x/y pair, never an expression, URL, or script. This bounds the
// downstream chart to a plain-data render with no code-execution or data-loading surface.
export const chartPointSchema = z
  .object({
    x: z.union([z.number(), z.string()]),
    y: z.number().finite(),
  })
  .strict();
export type ChartPoint = z.infer<typeof chartPointSchema>;

// Bound the render payload so an over-large (or adversarial) chart drops cleanly on safeParse
// rather than reaching the box; a daily series across two years is 731 points.
const MAX_CHART_SERIES = 24;
const MAX_CHART_POINTS = 731;

export const chartSeriesSchema = z
  .object({
    name: z.string(),
    points: z.array(chartPointSchema).max(MAX_CHART_POINTS),
  })
  .strict();
export type ChartSeries = z.infer<typeof chartSeriesSchema>;

export const chartBlockSchema = z
  .object({
    kind: z.literal('chart'),
    id: z.string(),
    chartType: chartTypeSchema,
    series: z.array(chartSeriesSchema).max(MAX_CHART_SERIES),
    xLabel: z.string().optional(),
    yLabel: z.string().optional(),
    caption: z.string().optional(),
  })
  .strict();
export type ChartBlock = z.infer<typeof chartBlockSchema>;

export const codeBlockSchema = z
  .object({
    kind: z.literal('code'),
    id: z.string(),
    language: z.string(),
    code: z.string(),
    caption: z.string().optional(),
  })
  .strict();
export type CodeBlock = z.infer<typeof codeBlockSchema>;

// A link-preview card. Only `url` is required — the preview fields are populated by a
// separate post-synthesis fetch step, so a bare `{ url }` must validate.
export const embedBlockSchema = z
  .object({
    kind: z.literal('embed'),
    id: z.string(),
    url: z.string().url(),
    provider: z.string().optional(),
    title: z.string().optional(),
    description: z.string().optional(),
    imageUrl: z.string().url().optional(),
    faviconUrl: z.string().url().optional(),
  })
  .strict();
export type EmbedBlock = z.infer<typeof embedBlockSchema>;

// Deliberately not a `graph` variant: `graph`'s shape/relation/cardinality vocabulary is a semantic
// model the synthesis prompt and the Mermaid export read. Freehand ink is absent by design — it is
// un-redactable, so it needs the fail-closed public projection decided separately.
export const canvasStickyColorSchema = z.enum([
  'butter',
  'mint',
  'blush',
  'lilac',
  'sky',
  'clay',
  'periwinkle',
]);
export type CanvasStickyColor = z.infer<typeof canvasStickyColorSchema>;

export const canvasTextSizeSchema = z.enum(['sm', 'md', 'lg']);
export type CanvasTextSize = z.infer<typeof canvasTextSizeSchema>;

// A curated allowlist, not the unicode table, so a sticker cannot smuggle text. Every token is a
// single emoji-presentation code point — a variation-selector form (`❤️`) fails exact-match
// validation for any client that normalizes it away, dropping the whole board.
export const canvasStickerEmojiSchema = z.enum([
  '👍',
  '👎',
  '💜',
  '🎉',
  '🔥',
  '🚨',
  '❓',
  '✅',
  '❌',
  '👀',
  '🚀',
  '💡',
]);
export type CanvasStickerEmoji = z.infer<typeof canvasStickerEmojiSchema>;

// Bounds so an over-large or adversarial board drops on safeParse rather than reaching the box —
// a block body is an ESDK-encrypted jsonb row and rides the snapshot-sealed collaborative document.
// Only the object cap is exported: decoders check it before zod walks a pathological board.
export const MAX_CANVAS_OBJECTS = 300;
const MAX_CANVAS_STICKY_CHARS = 500;
const MAX_CANVAS_LABEL_CHARS = 400;
const MAX_CANVAS_STICKY_FACT_IDS = 8;
const MAX_CANVAS_ID_CHARS = 128;
// A fact id is a uuid or a sha256 hex digest, never longer.
const MAX_FACT_ID_CHARS = 64;
// A board big enough for any real session; past this the coordinates are a hallucination or an
// attack, and downstream hit-testing and viewBox maths stop being meaningful.
const MAX_CANVAS_COORD = 1_000_000;

const canvasObjectIdSchema = z.string().min(1).max(MAX_CANVAS_ID_CHARS);
const canvasExtentSchema = z.number().finite().positive().max(MAX_CANVAS_COORD).optional();

// Coordinates are optional for the same reason `graphNodeSchema`'s are: synthesis emits structure
// only and the editor lays out on read, while a human drag persists explicit geometry.
const canvasPlacement = {
  x: z.number().finite().min(-MAX_CANVAS_COORD).max(MAX_CANVAS_COORD).optional(),
  y: z.number().finite().min(-MAX_CANVAS_COORD).max(MAX_CANVAS_COORD).optional(),
};

// `frameId` is the authoritative grouping — geometry is only a fallback — so a coordinate-free
// synthesized board still says which column each object belongs to.
// WRITER INVARIANT: whatever moves an object into or out of a frame must write both, in one update
// — geometry alone will not re-group an object that already carries a `frameId`. Frames themselves
// cannot nest by id (no `frameId` on `canvasFrameSchema`); nesting is geometric only. Reconciling a
// concurrent move against a concurrent retarget needs a real rule before multiplayer drag ships.
const canvasFramed = {
  ...canvasPlacement,
  frameId: canvasObjectIdSchema.optional(),
};

// `factIds` is what makes a synthesized sticky citable through the existing `[n]` path.
export const canvasStickySchema = z
  .object({
    type: z.literal('sticky'),
    id: canvasObjectIdSchema,
    ...canvasFramed,
    w: canvasExtentSchema,
    h: canvasExtentSchema,
    text: z.string().max(MAX_CANVAS_STICKY_CHARS),
    color: canvasStickyColorSchema,
    factIds: z
      .array(z.string().min(1).max(MAX_FACT_ID_CHARS))
      .max(MAX_CANVAS_STICKY_FACT_IDS)
      .optional(),
  })
  .strict();
export type CanvasSticky = z.infer<typeof canvasStickySchema>;

export const canvasTextSchema = z
  .object({
    type: z.literal('text'),
    id: canvasObjectIdSchema,
    ...canvasFramed,
    w: canvasExtentSchema,
    text: z.string().max(MAX_CANVAS_LABEL_CHARS),
    size: canvasTextSizeSchema,
  })
  .strict();
export type CanvasTextObject = z.infer<typeof canvasTextSchema>;

export const canvasStickerSchema = z
  .object({
    type: z.literal('sticker'),
    id: canvasObjectIdSchema,
    ...canvasFramed,
    emoji: canvasStickerEmojiSchema,
  })
  .strict();
export type CanvasSticker = z.infer<typeof canvasStickerSchema>;

// The grouping primitive — retro columns, kanban lanes, board sections — and what the export
// degradation groups bullets under.
export const canvasFrameSchema = z
  .object({
    type: z.literal('frame'),
    id: canvasObjectIdSchema,
    ...canvasPlacement,
    w: canvasExtentSchema,
    h: canvasExtentSchema,
    label: z.string().max(MAX_CANVAS_LABEL_CHARS),
  })
  .strict();
export type CanvasFrame = z.infer<typeof canvasFrameSchema>;

// A plain arrow: no `relation`, no cardinality, no `order`. Those semantics belong to `graph` and
// must not leak here, or the graph export has to guess what a canvas connector meant.
export const canvasConnectorSchema = z
  .object({
    type: z.literal('connector'),
    id: canvasObjectIdSchema,
    from: canvasObjectIdSchema,
    to: canvasObjectIdSchema,
    label: z.string().max(MAX_CANVAS_LABEL_CHARS).optional(),
  })
  .strict();
export type CanvasConnector = z.infer<typeof canvasConnectorSchema>;

export const canvasObjectSchema = z.discriminatedUnion('type', [
  canvasStickySchema,
  canvasTextSchema,
  canvasStickerSchema,
  canvasFrameSchema,
  canvasConnectorSchema,
]);
export type CanvasObject = z.infer<typeof canvasObjectSchema>;

// Ids address objects in the renderer, in comment anchors, and in the collaborative document, so a
// duplicate is a wrong-object write, not a cosmetic clash — reject the board instead.
const canvasObjectsSchema = z
  .array(canvasObjectSchema)
  .max(MAX_CANVAS_OBJECTS)
  .refine((objects) => new Set(objects.map((o) => o.id)).size === objects.length, {
    message: 'canvas object ids must be unique',
  });

export const canvasBlockSchema = z
  .object({
    kind: z.literal('canvas'),
    id: z.string(),
    objects: canvasObjectsSchema,
    caption: z.string().max(MAX_CANVAS_LABEL_CHARS).optional(),
  })
  .strict();
export type CanvasBlock = z.infer<typeof canvasBlockSchema>;

export type CanvasFramedObject = CanvasSticky | CanvasTextObject | CanvasSticker;

// The one resolver for "which frame holds this object" — every reader (export, editor, comment
// anchoring) must agree, so it lives beside the schema rather than in any one consumer.
export function canvasFrameOf(
  object: CanvasFramedObject,
  frames: CanvasFrame[],
): CanvasFrame | undefined {
  if (object.frameId !== undefined) return frames.find((frame) => frame.id === object.frameId);
  return frames.filter((frame) => canvasFrameContains(frame, object)).sort(bySmallestArea)[0];
}

/** True when an object list exceeds the cap — checked before zod walks a pathological board. */
export function isOverCanvasObjectCap(objects: unknown): boolean {
  return Array.isArray(objects) && objects.length > MAX_CANVAS_OBJECTS;
}

const CANVAS_ORIGIN = 0;

function bySmallestArea(a: CanvasFrame, b: CanvasFrame): number {
  return areaOf(a) - areaOf(b);
}

function areaOf(frame: CanvasFrame): number {
  return (frame.w ?? CANVAS_ORIGIN) * (frame.h ?? CANVAS_ORIGIN);
}

// An object belongs to the frame its centre falls in; a `text` or `sticker` has no height and
// anchors on its baseline. Neither can be placed without geometry on both sides.
function canvasFrameContains(frame: CanvasFrame, object: CanvasFramedObject): boolean {
  if (frame.x === undefined || frame.y === undefined) return false;
  if (frame.w === undefined || frame.h === undefined) return false;
  if (object.x === undefined || object.y === undefined) return false;
  const centreX = object.x + (widthOf(object) ?? CANVAS_ORIGIN) / 2;
  const centreY = object.type === 'sticky' ? object.y + (object.h ?? CANVAS_ORIGIN) / 2 : object.y;
  return (
    centreX >= frame.x &&
    centreX <= frame.x + frame.w &&
    centreY >= frame.y &&
    centreY <= frame.y + frame.h
  );
}

function widthOf(object: CanvasFramedObject): number | undefined {
  return object.type === 'sticker' ? undefined : object.w;
}

export const richBlockBodySchema = z.discriminatedUnion('kind', [
  diagramBlockSchema,
  graphBlockSchema,
  chartBlockSchema,
  codeBlockSchema,
  embedBlockSchema,
  canvasBlockSchema,
]);
export type RichBlockBody = z.infer<typeof richBlockBodySchema>;

// The wiki page-read contract (apps/api `GET /api/v1/wiki/:themeId`). `content` is rendered,
// permission-filtered GFM (render-on-read) — distinct from the structured
// synthesis block bodies above; `updatedAt` is the JSON-wire ISO string.
export const wikiPageBlockSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    content: z.string(),
    lockedBy: z.string().nullable(),
    version: z.number(),
    generatedBy: z.string().nullable(),
    // Content-free sha256 fingerprints: `promptHash` of the prompt that generated
    // the block, `outputHash` of its output. Null on human-authored blocks. Bind a quality-feedback
    // correction to the exact generated output it critiques; exposing hashes leaks nothing.
    promptHash: z.string().nullable(),
    outputHash: z.string().nullable(),
  })
  .strict();
export type WikiPageBlock = z.infer<typeof wikiPageBlockSchema>;

export const wikiPageOwnerSchema = z
  .object({
    name: z.string(),
    kind: z.enum(['user', 'team']),
    isConfirmed: z.boolean(),
  })
  .strict();
export type WikiPageOwner = z.infer<typeof wikiPageOwnerSchema>;

export const wikiPageMetaSchema = z
  .object({
    ownerName: z.string().nullable(),
    ownerKind: z.enum(['user', 'team']).nullable(),
    owners: z.array(wikiPageOwnerSchema).optional(),
    confidence: z.number(),
    tags: z.array(z.string()),
    sources: z.array(z.string()),
    factCount: z.number(),
    updatedAt: z.string(),
    isAggregate: z.boolean(),
    related: z.array(z.object({ id: z.string(), name: z.string() }).strict()),
  })
  .strict();
export type WikiPageMeta = z.infer<typeof wikiPageMetaSchema>;

const canonicalBase64Schema = z
  .string()
  .min(4)
  .max(2_000_000)
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);

export const wikiPublishRequestSchema = z
  .object({
    requestId: z.string().uuid(),
    expectedRevisionId: z.string().uuid().nullable(),
    title: z.string().trim().min(1).max(240),
    markdown: z.string().max(500_000),
    yjsState: canonicalBase64Schema,
  })
  .strict();
export type WikiPublishRequest = z.infer<typeof wikiPublishRequestSchema>;

export const wikiPublishResponseSchema = z
  .object({
    publicationId: z.string().uuid(),
    revision: z.number().int().positive(),
    publishedAt: z.string().datetime(),
  })
  .strict();
export type WikiPublishResponse = z.infer<typeof wikiPublishResponseSchema>;

export const wikiPageResponseSchema = z
  .object({
    themeId: z.string(),
    pageId: z.string(),
    publicationId: z.string().uuid().nullable(),
    revision: z.number().int().positive().nullable(),
    title: z.string().max(240),
    blocks: z.array(wikiPageBlockSchema),
    meta: wikiPageMetaSchema.nullable(),
  })
  .strict()
  .superRefine((page, context) => {
    if ((page.publicationId === null) !== (page.revision === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'publicationId and revision must both be present or absent',
      });
    }
  });
export type WikiPageResponse = z.infer<typeof wikiPageResponseSchema>;

// The wiki quality-feedback aggregate (apps/api `GET /api/v1/wiki/quality` flywheel).
// COUNTS + content-free sha256 hashes ONLY — never the sealed correction ciphertext or any
// decrypted correction text. This is the re-synthesis signal, not a way to read corrections.
export const wikiQualityBlockSchema = z
  .object({
    blockId: z.string(),
    themeId: z.string().nullable(),
    promptHash: z.string(),
    outputHash: z.string(),
    helpful: z.number().int().nonnegative(),
    notHelpful: z.number().int().nonnegative(),
  })
  .strict();
export type WikiQualityBlock = z.infer<typeof wikiQualityBlockSchema>;

export const wikiQualityResponseSchema = z
  .object({ blocks: z.array(wikiQualityBlockSchema) })
  .strict();
export type WikiQualityResponse = z.infer<typeof wikiQualityResponseSchema>;

// The one shape of the wiki-edit-mining signal that MAY cross the trust boundary:
// content-free aggregates of a human's draft→edit delta. The delta is computed inside the enclave;
// the before/after prose stays sealed on-box, and only these counts/ratios are eligible to ride
// the check-in channel for fleet-level synthesis-quality monitoring. NO prose fields here, ever.
export const wikiEditKindSchema = z.enum(['touch_up', 'trim', 'expand', 'rewrite', 'blank']);
export type WikiEditKind = z.infer<typeof wikiEditKindSchema>;

// Which comment field a sealed body is: `anchor` = the anchored wiki excerpt, `reply` = a reply
// body. Bound into the seal AAD (api↔enclave) so one cannot be relocated as the other.
export const wikiCommentFieldSchema = z.enum(['anchor', 'reply']);
export type WikiCommentField = z.infer<typeof wikiCommentFieldSchema>;

// Wire DTOs for the wiki-comments read path (dates JSON-serialized to ISO). `authorName` is the
// content-free display name resolved from the RLS-gated users table so the box shows the
// real author, never a raw id or email — falls back to a neutral label when unresolvable.
export const wikiCommentThreadSchema = z
  .object({
    id: z.string(),
    pageId: z.string(),
    blockId: z.string().nullable(),
    anchorText: z.string().nullable(),
    resolved: z.boolean(),
    createdBy: z.string(),
    createdAt: z.string(),
  })
  .strict();
export type WikiCommentThread = z.infer<typeof wikiCommentThreadSchema>;

export const wikiCommentReplySchema = z
  .object({
    id: z.string(),
    threadId: z.string(),
    body: z.string(),
    createdBy: z.string(),
    authorName: z.string(),
    createdAt: z.string(),
  })
  .strict();
export type WikiCommentReply = z.infer<typeof wikiCommentReplySchema>;

export const wikiEditSignalSchema = z
  .object({
    blockType: z.string(),
    editKind: wikiEditKindSchema,
    changeFraction: z.number().min(0).max(1),
    sentencesAdded: z.number().int().min(0),
    sentencesRemoved: z.number().int().min(0),
    sentencesKept: z.number().int().min(0),
    citationsAdded: z.number().int().min(0),
    citationsRemoved: z.number().int().min(0),
    lengthDeltaChars: z.number().int(),
    promptHash: z.string().nullable(),
  })
  .strict();
export type WikiEditSignal = z.infer<typeof wikiEditSignalSchema>;
