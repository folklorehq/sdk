// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

// Update-notice wire contract between an open app tab and the control plane. Content-free: an org id,
// a random per-tab id and one boolean in; a closed-set phase and at most one timestamp out.
export const BOX_ROLL_NOTICE_PATH = '/v1/box/roll-notice';
export const BOX_ROLL_NOTICE_POLL_MS = 30_000;
export const BOX_ROLL_NOTICE_SCHEDULED_POLL_MS = 10_000;
export const BOX_ROLL_PHASES = ['none', 'scheduled', 'in_progress'] as const;

export const boxRollNoticeRequestSchema = z.union([
  z
    .object({
      orgId: z.string().uuid(),
      tabId: z.string().uuid(),
      pendingSave: z.boolean().optional(),
    })
    .strict(),
  z
    .object({ orgId: z.string().uuid(), tabId: z.string().uuid(), leaving: z.literal(true) })
    .strict(),
]);

export const boxRollNoticeResponseSchema = z.discriminatedUnion('phase', [
  z.object({ phase: z.literal('none') }).strict(),
  z.object({ phase: z.literal('scheduled'), startsBy: z.string().datetime() }).strict(),
  z.object({ phase: z.literal('in_progress'), startedAt: z.string().datetime() }).strict(),
]);

export type BoxRollNoticeRequest = z.infer<typeof boxRollNoticeRequestSchema>;
export type BoxRollNotice = z.infer<typeof boxRollNoticeResponseSchema>;
