// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { sensitivityLevelSchema } from './enclave.js';
// The export ceiling is a one-way declassification decision (ADL #65): default `public`, and any
// higher tier must carry an explicit acknowledgement — the destination's own ACLs, not Folklore's
// audience model, govern access once a page leaves. Content-free label only (ADL #6/#18).
export const exportCeilingSchema = sensitivityLevelSchema;
export const DEFAULT_EXPORT_CEILING = 'public';
// Platform-neutral projected block model (ADL #65). The enclave projection renders stored wiki
// blocks to this shape once; each destination client maps it to its own native blocks. `chart`
// degrades to a `table`; `diagram`/`graph` to `mermaid`; `embed` to `bookmark` (already
// redaction-checked); `canvas` to `markdown` — the one rich block that exports as prose, so its
// text carries the internal-link strip and markdown neutralization the generic path applies.
export const portableMarkdownBlockSchema = z.object({
    kind: z.literal('markdown'),
    markdown: z.string(),
});
export const portableCodeBlockSchema = z.object({
    kind: z.literal('code'),
    language: z.string(),
    code: z.string(),
    caption: z.string().optional(),
});
export const portableMermaidBlockSchema = z.object({
    kind: z.literal('mermaid'),
    mermaid: z.string(),
    caption: z.string().optional(),
});
export const portableBookmarkBlockSchema = z.object({
    kind: z.literal('bookmark'),
    url: z.string(),
    title: z.string().optional(),
    description: z.string().optional(),
});
export const portableTableBlockSchema = z.object({
    kind: z.literal('table'),
    columns: z.array(z.string()),
    rows: z.array(z.array(z.string())),
    caption: z.string().optional(),
});
export const portableBlockSchema = z.discriminatedUnion('kind', [
    portableMarkdownBlockSchema,
    portableCodeBlockSchema,
    portableMermaidBlockSchema,
    portableBookmarkBlockSchema,
    portableTableBlockSchema,
]);
export const projectedPageSchema = z.object({
    themeId: z.string(),
    title: z.string(),
    ceiling: exportCeilingSchema,
    // True only when an admin declassified above `public` (option B, ADL #65); logged on the target.
    acknowledgedAbovePublic: z.boolean(),
    blocks: z.array(portableBlockSchema),
    // sha256 of the projected page — the re-export gate (skip a push when nothing changed).
    contentHash: z.string(),
});
// Where a page lands. `pageRef` is the existing external page id for update-in-place — a re-export
// updates the same destination page instead of duplicating (ADL #65 sync semantics).
export const exportDestinationSchema = z.object({
    workspaceRef: z.string(),
    pageRef: z.string().nullable(),
});
export const externalPageRefSchema = z.object({
    workspaceRef: z.string(),
    pageRef: z.string(),
});
//# sourceMappingURL=wiki-export.js.map