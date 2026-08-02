// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const IntercomAuthorSchema = z.object({
  type: z.enum(['user', 'admin', 'bot']),
  id: z.string(),
  name: z.string().optional(),
  email: z.string().optional(),
});

export const IntercomConversationMessageSchema = z.object({
  type: z.literal('conversation_message'),
  body: z.string(),
  author: IntercomAuthorSchema,
  created_at: z.number(),
});

export const IntercomConversationPartSchema = z.object({
  type: z.literal('conversation_part'),
  id: z.string().optional(),
  part_type: z.string(),
  body: z.string(),
  redacted: z.boolean().optional(),
  author: IntercomAuthorSchema,
  created_at: z.number(),
});

export const IntercomConversationSchema = z.object({
  type: z.literal('conversation'),
  id: z.string(),
  created_at: z.number(),
  updated_at: z.number(),
  conversation_message: IntercomConversationMessageSchema.optional(),
  conversation_parts: z
    .object({ conversation_parts: z.array(IntercomConversationPartSchema) })
    .optional(),
});

export const IntercomNotificationEventSchema = z.object({
  type: z.literal('notification_event'),
  topic: z.enum([
    'conversation.user.created',
    'conversation.user.replied',
    'conversation.admin.replied',
    'conversation.admin.closed',
    'conversation.admin.assigned',
  ]),
  data: z.object({ item: IntercomConversationSchema }),
  created_at: z.number(),
});

export type IntercomWebhookAuthor = z.infer<typeof IntercomAuthorSchema>;
export type IntercomWebhookConversationPart = z.infer<typeof IntercomConversationPartSchema>;
export type IntercomWebhookConversation = z.infer<typeof IntercomConversationSchema>;
export type IntercomWebhookNotificationEvent = z.infer<typeof IntercomNotificationEventSchema>;
