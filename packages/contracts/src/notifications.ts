// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const notificationTypeSchema = z.enum(['mention', 'comment', 'reply', 'wiki_published']);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

export const legacyNotificationTypeSchema = z.enum(['mention', 'comment', 'reply']);
export type LegacyNotificationType = z.infer<typeof legacyNotificationTypeSchema>;

export const notificationCadenceSchema = z.enum([
  'immediate',
  'digest_periodic',
  'digest_daily',
  'off',
]);
export type NotificationCadence = z.infer<typeof notificationCadenceSchema>;
export type DigestCadence = Extract<NotificationCadence, 'digest_periodic' | 'digest_daily'>;

const MAX_PAGE_TITLE_CHARS = 300;
const SLACK_WEBHOOK_PREFIX = 'https://hooks.slack.com/';

export const notificationRoutingEventSchema = z
  .object({
    type: notificationTypeSchema,
    recipientUserId: z.string().uuid(),
    pageId: z.string().uuid(),
  })
  .strict();
export type NotificationRoutingEvent = z.infer<typeof notificationRoutingEventSchema>;

export const notificationFeedItemSchema = z
  .object({
    id: z.string().uuid(),
    type: notificationTypeSchema,
    actorUserId: z.string().uuid(),
    actorName: z.string(),
    pageId: z.string().uuid(),
    pageTitle: z.string().max(MAX_PAGE_TITLE_CHARS),
    href: z.string().startsWith('/'),
    occurredAt: z.string().datetime(),
    read: z.boolean(),
  })
  .strict();
export type NotificationFeedItem = z.infer<typeof notificationFeedItemSchema>;

export const notificationFeedSchema = z
  .object({ items: z.array(notificationFeedItemSchema) })
  .strict();
export type NotificationFeed = z.infer<typeof notificationFeedSchema>;

export const legacyNotificationFeedItemSchema = z
  .object({
    id: z.string().uuid(),
    type: legacyNotificationTypeSchema,
    recipientUserId: z.string().uuid(),
    actorUserId: z.string().uuid(),
    actorName: z.string(),
    pageId: z.string().uuid(),
    themeId: z.string().uuid(),
    pageTitle: z.string().max(MAX_PAGE_TITLE_CHARS),
    occurredAt: z.string().datetime(),
    read: z.boolean(),
  })
  .strict();
export type LegacyNotificationFeedItem = z.infer<typeof legacyNotificationFeedItemSchema>;

export const legacyNotificationFeedSchema = z
  .object({ items: z.array(legacyNotificationFeedItemSchema) })
  .strict();
export type LegacyNotificationFeed = z.infer<typeof legacyNotificationFeedSchema>;

const perTypeToggleShape = {
  mentionsEnabled: z.boolean(),
  commentsEnabled: z.boolean(),
  repliesEnabled: z.boolean(),
};

const legacyPreferencesShape = {
  emailEnabled: z.boolean(),
  cadence: notificationCadenceSchema,
  ...perTypeToggleShape,
  slackEnabled: z.boolean(),
  slackWebhookUrl: z.string().url().nullable(),
};

export const legacyNotificationPreferencesSchema = z.object(legacyPreferencesShape).strict();
export type LegacyNotificationPreferences = z.infer<typeof legacyNotificationPreferencesSchema>;

export const notificationPreferencesSchema = z
  .object({
    ...legacyPreferencesShape,
    wikiPublishedEnabled: z.boolean(),
  })
  .strict();
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

const legacyUpdatePreferencesShape = {
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
};

const enabledSlackWebhook = (value: { slackEnabled: boolean; slackWebhookUrl: string | null }) =>
  !value.slackEnabled || value.slackWebhookUrl !== null;

export const legacyUpdateNotificationPreferencesSchema = z
  .object(legacyUpdatePreferencesShape)
  .strict()
  .refine(enabledSlackWebhook, {
    message: 'A Slack incoming-webhook URL is required to enable Slack notifications.',
    path: ['slackWebhookUrl'],
  });
export type LegacyUpdateNotificationPreferences = z.infer<
  typeof legacyUpdateNotificationPreferencesSchema
>;

export const updateNotificationPreferencesSchema = z
  .object({
    ...legacyUpdatePreferencesShape,
    wikiPublishedEnabled: z.boolean(),
  })
  .strict()
  .refine(enabledSlackWebhook, {
    message: 'A Slack incoming-webhook URL is required to enable Slack notifications.',
    path: ['slackWebhookUrl'],
  });
export type UpdateNotificationPreferences = z.infer<typeof updateNotificationPreferencesSchema>;
