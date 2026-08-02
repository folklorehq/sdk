// SPDX-License-Identifier: Apache-2.0
import {
  legacyNotificationFeedSchema,
  legacyNotificationPreferencesSchema,
  legacyUpdateNotificationPreferencesSchema,
  notificationFeedItemSchema,
  notificationPreferencesSchema,
  notificationRoutingEventSchema,
  updateNotificationPreferencesSchema,
} from '@folklore/contracts';
import { describe, expect, it } from 'vitest';

const IDS = {
  notification: '00000000-0000-4000-8000-000000000001',
  recipient: '00000000-0000-4000-8000-000000000002',
  actor: '00000000-0000-4000-8000-000000000003',
  page: '00000000-0000-4000-8000-000000000004',
  theme: '00000000-0000-4000-8000-000000000005',
} as const;

const PREFERENCES = {
  emailEnabled: true,
  cadence: 'digest_periodic',
  mentionsEnabled: true,
  commentsEnabled: true,
  repliesEnabled: true,
  slackEnabled: false,
  slackWebhookUrl: null,
} as const;

describe('notification routing contract', () => {
  it('accepts exactly the three routing keys for every supported type', () => {
    for (const type of ['mention', 'comment', 'reply', 'wiki_published'] as const) {
      expect(
        notificationRoutingEventSchema.parse({
          type,
          recipientUserId: IDS.recipient,
          pageId: IDS.page,
        }),
      ).toEqual({ type, recipientUserId: IDS.recipient, pageId: IDS.page });
    }
  });

  it('rejects every presentation, content, and provider field', () => {
    const event = { type: 'wiki_published', recipientUserId: IDS.recipient, pageId: IDS.page };
    for (const forbidden of [
      'actorUserId',
      'actorName',
      'pageTitle',
      'themeId',
      'occurredAt',
      'body',
      'excerpt',
      'label',
      'providerResponse',
    ]) {
      expect(
        notificationRoutingEventSchema.safeParse({ ...event, [forbidden]: 'secret' }).success,
      ).toBe(false);
    }
  });
});

describe('notification feed contracts', () => {
  it('accepts the option-b feed item with its server-authorized relative href', () => {
    expect(
      notificationFeedItemSchema.parse({
        id: IDS.notification,
        type: 'wiki_published',
        actorUserId: IDS.actor,
        actorName: 'Ada Lovelace',
        pageId: IDS.page,
        pageTitle: 'Release notes',
        href: `/wiki/${IDS.theme}?audience=${IDS.page}`,
        occurredAt: '2026-08-01T00:00:00.000Z',
        read: false,
      }),
    ).toMatchObject({ type: 'wiki_published' });
  });

  it('keeps the legacy feed shape strict and separate from option-b', () => {
    const legacy = {
      id: IDS.notification,
      type: 'comment',
      recipientUserId: IDS.recipient,
      actorUserId: IDS.actor,
      actorName: 'Ada Lovelace',
      pageId: IDS.page,
      themeId: IDS.theme,
      pageTitle: 'Release notes',
      occurredAt: '2026-08-01T00:00:00.000Z',
      read: false,
    };

    expect(legacyNotificationFeedSchema.safeParse({ items: [legacy] }).success).toBe(true);
    expect(
      legacyNotificationFeedSchema.safeParse({ items: [{ ...legacy, href: '/wiki/x' }] }).success,
    ).toBe(false);
    expect(notificationFeedItemSchema.safeParse({ ...legacy, href: '/wiki/x' }).success).toBe(
      false,
    );
  });
});

describe('notification preference contracts', () => {
  it('requires the wiki-published toggle in option-b reads and updates', () => {
    const optionB = { ...PREFERENCES, wikiPublishedEnabled: true };
    expect(notificationPreferencesSchema.safeParse(optionB).success).toBe(true);
    expect(updateNotificationPreferencesSchema.safeParse(optionB).success).toBe(true);
    expect(notificationPreferencesSchema.safeParse(PREFERENCES).success).toBe(false);
    expect(updateNotificationPreferencesSchema.safeParse(PREFERENCES).success).toBe(false);
  });

  it('keeps legacy read and update compatibility bodies strict', () => {
    expect(legacyNotificationPreferencesSchema.safeParse(PREFERENCES).success).toBe(true);
    expect(legacyUpdateNotificationPreferencesSchema.safeParse(PREFERENCES).success).toBe(true);
    expect(
      legacyUpdateNotificationPreferencesSchema.safeParse({
        ...PREFERENCES,
        wikiPublishedEnabled: true,
      }).success,
    ).toBe(false);
  });
});
