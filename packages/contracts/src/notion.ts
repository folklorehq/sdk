// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

// Real Notion deliveries (developers.notion.com/reference/webhooks) are ids-only with the page id
// at top-level entity.id — never in data — so keep the shape permissive and only reject non-objects.
export const notionWebhookEventSchema = z
  .object({
    type: z.string(),
    entity: z.object({ id: z.string() }).passthrough().optional(),
    data: z.record(z.string(), z.unknown()).default({}),
    timestamp: z.string().optional(),
  })
  .passthrough();

export type NotionWebhookEvent = z.infer<typeof notionWebhookEventSchema>;
