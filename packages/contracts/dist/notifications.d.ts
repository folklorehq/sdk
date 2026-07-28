import { z } from 'zod';
export declare const notificationTypeSchema: z.ZodEnum<["mention", "comment", "reply"]>;
export type NotificationType = z.infer<typeof notificationTypeSchema>;
export declare const notificationCadenceSchema: z.ZodEnum<["immediate", "digest_periodic", "digest_daily", "off"]>;
export type NotificationCadence = z.infer<typeof notificationCadenceSchema>;
export type DigestCadence = Extract<NotificationCadence, 'digest_periodic' | 'digest_daily'>;
export declare const notificationEventSchema: z.ZodObject<{
    type: z.ZodEnum<["mention", "comment", "reply"]>;
    recipientUserId: z.ZodString;
    actorUserId: z.ZodString;
    pageId: z.ZodString;
    themeId: z.ZodString;
    pageTitle: z.ZodString;
    occurredAt: z.ZodString;
}, "strict", z.ZodTypeAny, {
    type: "reply" | "mention" | "comment";
    themeId: string;
    pageId: string;
    occurredAt: string;
    recipientUserId: string;
    actorUserId: string;
    pageTitle: string;
}, {
    type: "reply" | "mention" | "comment";
    themeId: string;
    pageId: string;
    occurredAt: string;
    recipientUserId: string;
    actorUserId: string;
    pageTitle: string;
}>;
export type NotificationEvent = z.infer<typeof notificationEventSchema>;
export declare const notificationFeedItemSchema: z.ZodObject<{
    type: z.ZodEnum<["mention", "comment", "reply"]>;
    recipientUserId: z.ZodString;
    actorUserId: z.ZodString;
    pageId: z.ZodString;
    themeId: z.ZodString;
    pageTitle: z.ZodString;
    occurredAt: z.ZodString;
} & {
    id: z.ZodString;
    actorName: z.ZodString;
    read: z.ZodBoolean;
}, "strict", z.ZodTypeAny, {
    type: "reply" | "mention" | "comment";
    id: string;
    themeId: string;
    pageId: string;
    occurredAt: string;
    recipientUserId: string;
    actorUserId: string;
    pageTitle: string;
    actorName: string;
    read: boolean;
}, {
    type: "reply" | "mention" | "comment";
    id: string;
    themeId: string;
    pageId: string;
    occurredAt: string;
    recipientUserId: string;
    actorUserId: string;
    pageTitle: string;
    actorName: string;
    read: boolean;
}>;
export type NotificationFeedItem = z.infer<typeof notificationFeedItemSchema>;
export declare const notificationFeedSchema: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        type: z.ZodEnum<["mention", "comment", "reply"]>;
        recipientUserId: z.ZodString;
        actorUserId: z.ZodString;
        pageId: z.ZodString;
        themeId: z.ZodString;
        pageTitle: z.ZodString;
        occurredAt: z.ZodString;
    } & {
        id: z.ZodString;
        actorName: z.ZodString;
        read: z.ZodBoolean;
    }, "strict", z.ZodTypeAny, {
        type: "reply" | "mention" | "comment";
        id: string;
        themeId: string;
        pageId: string;
        occurredAt: string;
        recipientUserId: string;
        actorUserId: string;
        pageTitle: string;
        actorName: string;
        read: boolean;
    }, {
        type: "reply" | "mention" | "comment";
        id: string;
        themeId: string;
        pageId: string;
        occurredAt: string;
        recipientUserId: string;
        actorUserId: string;
        pageTitle: string;
        actorName: string;
        read: boolean;
    }>, "many">;
}, "strict", z.ZodTypeAny, {
    items: {
        type: "reply" | "mention" | "comment";
        id: string;
        themeId: string;
        pageId: string;
        occurredAt: string;
        recipientUserId: string;
        actorUserId: string;
        pageTitle: string;
        actorName: string;
        read: boolean;
    }[];
}, {
    items: {
        type: "reply" | "mention" | "comment";
        id: string;
        themeId: string;
        pageId: string;
        occurredAt: string;
        recipientUserId: string;
        actorUserId: string;
        pageTitle: string;
        actorName: string;
        read: boolean;
    }[];
}>;
export type NotificationFeed = z.infer<typeof notificationFeedSchema>;
export declare const notificationPreferencesSchema: z.ZodObject<{
    slackEnabled: z.ZodBoolean;
    slackWebhookUrl: z.ZodNullable<z.ZodString>;
    mentionsEnabled: z.ZodBoolean;
    commentsEnabled: z.ZodBoolean;
    repliesEnabled: z.ZodBoolean;
    emailEnabled: z.ZodBoolean;
    cadence: z.ZodEnum<["immediate", "digest_periodic", "digest_daily", "off"]>;
}, "strict", z.ZodTypeAny, {
    emailEnabled: boolean;
    cadence: "immediate" | "digest_periodic" | "digest_daily" | "off";
    slackEnabled: boolean;
    slackWebhookUrl: string | null;
    mentionsEnabled: boolean;
    commentsEnabled: boolean;
    repliesEnabled: boolean;
}, {
    emailEnabled: boolean;
    cadence: "immediate" | "digest_periodic" | "digest_daily" | "off";
    slackEnabled: boolean;
    slackWebhookUrl: string | null;
    mentionsEnabled: boolean;
    commentsEnabled: boolean;
    repliesEnabled: boolean;
}>;
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;
export declare const updateNotificationPreferencesSchema: z.ZodEffects<z.ZodObject<{
    slackEnabled: z.ZodBoolean;
    slackWebhookUrl: z.ZodDefault<z.ZodNullable<z.ZodString>>;
    mentionsEnabled: z.ZodBoolean;
    commentsEnabled: z.ZodBoolean;
    repliesEnabled: z.ZodBoolean;
    emailEnabled: z.ZodBoolean;
    cadence: z.ZodEnum<["immediate", "digest_periodic", "digest_daily", "off"]>;
}, "strict", z.ZodTypeAny, {
    emailEnabled: boolean;
    cadence: "immediate" | "digest_periodic" | "digest_daily" | "off";
    slackEnabled: boolean;
    slackWebhookUrl: string | null;
    mentionsEnabled: boolean;
    commentsEnabled: boolean;
    repliesEnabled: boolean;
}, {
    emailEnabled: boolean;
    cadence: "immediate" | "digest_periodic" | "digest_daily" | "off";
    slackEnabled: boolean;
    mentionsEnabled: boolean;
    commentsEnabled: boolean;
    repliesEnabled: boolean;
    slackWebhookUrl?: string | null | undefined;
}>, {
    emailEnabled: boolean;
    cadence: "immediate" | "digest_periodic" | "digest_daily" | "off";
    slackEnabled: boolean;
    slackWebhookUrl: string | null;
    mentionsEnabled: boolean;
    commentsEnabled: boolean;
    repliesEnabled: boolean;
}, {
    emailEnabled: boolean;
    cadence: "immediate" | "digest_periodic" | "digest_daily" | "off";
    slackEnabled: boolean;
    mentionsEnabled: boolean;
    commentsEnabled: boolean;
    repliesEnabled: boolean;
    slackWebhookUrl?: string | null | undefined;
}>;
export type UpdateNotificationPreferences = z.infer<typeof updateNotificationPreferencesSchema>;
//# sourceMappingURL=notifications.d.ts.map