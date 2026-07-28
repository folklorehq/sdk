// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
// Enclave↔egress-proxy wire contract. The enclave holds the customer URL
// (it lives inside the encrypted embed block) and asks the parent-EC2 egress proxy to
// fetch and parse it; the proxy returns only these bounded, non-executable preview fields.
const MAX_TITLE_CHARS = 300;
const MAX_DESCRIPTION_CHARS = 1000;
export const previewRequestSchema = z
    .object({
    url: z.string().url(),
})
    .strict();
export const linkPreviewSchema = z
    .object({
    title: z.string().max(MAX_TITLE_CHARS).optional(),
    description: z.string().max(MAX_DESCRIPTION_CHARS).optional(),
    imageUrl: z.string().url().optional(),
    faviconUrl: z.string().url().optional(),
})
    .strict();
// `preview: null` = fetched but nothing usable, or the target was refused (SSRF-blocked,
// bad scheme, oversize, timeout). The enclave treats null as "leave the card bare".
export const previewResponseSchema = z
    .object({
    preview: linkPreviewSchema.nullable(),
})
    .strict();
export const PREVIEW_TITLE_MAX = MAX_TITLE_CHARS;
export const PREVIEW_DESCRIPTION_MAX = MAX_DESCRIPTION_CHARS;
//# sourceMappingURL=preview.js.map