// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
// Content-free external-notification wire event (ADL #12/#18/#57). The trust invariant: what
// leaves toward the sender — and onward to the email/Slack sub-processors — carries ONLY ids, an
// enum, the cleartext page-title routing label (ADL #57), and a timestamp. NEVER the comment body,
// the mention text, or any snippet. Mention detection reads decrypted comment text where it already
// lives (apps/api, before sealing); only this content-free event crosses any boundary.
export const notificationTypeSchema = z.enum(['mention', 'comment', 'reply']);
// Email delivery cadence (migration 0045). `digest_periodic` (a-few-times-a-day) is the safe default
// so a new user is never fire-hosed. `off` suppresses email entirely (Slack is governed separately by
// `slackEnabled`). The two digest values route accumulated outbox rows to the periodic/daily drain.
export const notificationCadenceSchema = z.enum([
    'immediate',
    'digest_periodic',
    'digest_daily',
    'off',
]);
const MAX_PAGE_TITLE_CHARS = 300;
export const notificationEventSchema = z
    .object({
    type: notificationTypeSchema,
    recipientUserId: z.string().uuid(),
    actorUserId: z.string().uuid(),
    pageId: z.string().uuid(),
    themeId: z.string().uuid(),
    // Cleartext routing label only (ADL #57) — a page title, never comment content.
    pageTitle: z.string().max(MAX_PAGE_TITLE_CHARS),
    occurredAt: z.string().datetime(),
})
    .strict();
// In-app feed item (T4.1): the same content-free event plus the row id, the resolved actor DISPLAY
// name (org-scoped metadata, never an email — ADL #18), and in-app read-state. The box templates the
// title from `type` + `actorName` and uses `pageTitle` as the routing sub-label; no body ever added.
export const notificationFeedItemSchema = notificationEventSchema
    .extend({
    id: z.string().uuid(),
    actorName: z.string(),
    read: z.boolean(),
})
    .strict();
export const notificationFeedSchema = z
    .object({ items: z.array(notificationFeedItemSchema) })
    .strict();
// Slack incoming webhooks are always issued under this host; anchoring the stored URL to it stops an
// arbitrary URL being persisted and POSTed to at send time (SSRF-adjacent). Fields are content-free.
const SLACK_WEBHOOK_PREFIX = 'https://hooks.slack.com/';
// Per-type email toggles (migration 0045). A disabled type produces no notification of that kind on
// any channel. Room is left for a future `ownership` type: the drain defaults an unknown type to on.
const perTypeToggleShape = {
    mentionsEnabled: z.boolean(),
    commentsEnabled: z.boolean(),
    repliesEnabled: z.boolean(),
};
// Per-user delivery preferences (migrations 0042/0045) — GET response shape. Defaults (email on,
// cadence digest_periodic, per-type on, Slack off) live in the migration and the read fallback.
export const notificationPreferencesSchema = z
    .object({
    emailEnabled: z.boolean(),
    cadence: notificationCadenceSchema,
    ...perTypeToggleShape,
    slackEnabled: z.boolean(),
    slackWebhookUrl: z.string().url().nullable(),
})
    .strict();
// PUT body: the webhook must be a real Slack incoming-webhook URL, and is required whenever Slack is
// enabled — otherwise Slack delivery could never fire.
export const updateNotificationPreferencesSchema = z
    .object({
    emailEnabled: z.boolean(),
    cadence: notificationCadenceSchema,
    ...perTypeToggleShape,
    slackEnabled: z.boolean(),
    slackWebhookUrl: z
        .string()
        .trim()
        .url()
        .startsWith(SLACK_WEBHOOK_PREFIX, 'Must be a Slack incoming-webhook URL')
        .nullable()
        .default(null),
})
    .strict()
    .refine((v) => !v.slackEnabled || v.slackWebhookUrl !== null, {
    message: 'A Slack incoming-webhook URL is required to enable Slack notifications.',
    path: ['slackWebhookUrl'],
});
//# sourceMappingURL=notifications.js.map