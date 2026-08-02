// SPDX-License-Identifier: Apache-2.0
import type { NormalizedFact, NormalizedRecords } from '../normalized.js';
import type {
  IntercomConversation,
  IntercomConversationPart,
  IntercomNotificationEvent,
} from './types.js';

const CUSTOMER_FACING_PART_TYPES = new Set(['comment']);

export function intercomConversationId(conversationId: string): string {
  return `intercom:conv:${conversationId}`;
}

function isIngestableContent(part: IntercomConversationPart): boolean {
  return Boolean(part.body) && CUSTOMER_FACING_PART_TYPES.has(part.part_type) && !part.redacted;
}

function isIngestablePart(
  part: IntercomConversationPart,
): part is IntercomConversationPart & { id: string } {
  return Boolean(part.id) && isIngestableContent(part);
}

function partToFact(
  convo: IntercomConversation,
  part: IntercomConversationPart,
  raw: unknown,
  sourceFactId: string,
): NormalizedFact {
  const containerId = intercomConversationId(convo.id);
  return {
    sourceFactId,
    kind: 'content',
    occurredAt: new Date(part.created_at * 1000),
    resourceExternalId: convo.id,
    authors: [{ sourceUserId: part.author.id, role: 'author' }],
    containerRefs: [containerId],
    sourceThreadId: containerId,
    entities: [convo.id],
    content: { body: part.body, explicitLinks: [] },
    raw,
  };
}

export function normalizeIntercomConversationParts(
  convo: IntercomConversation,
  sinceEpoch?: number,
): NormalizedFact[] {
  const parts = convo.conversation_parts?.conversation_parts ?? [];
  const eligible =
    sinceEpoch === undefined ? parts : parts.filter((part) => part.created_at >= sinceEpoch);
  return eligible
    .filter(isIngestablePart)
    .map((part) => partToFact(convo, part, part, `intercom:part:${part.id}`));
}

export function normalizeIntercomEvent(event: IntercomNotificationEvent): NormalizedRecords {
  const convo: IntercomConversation = event.data.item;
  const containerId = intercomConversationId(convo.id);
  const occurredAt = new Date(event.created_at * 1000);

  if (event.topic === 'conversation.user.created') {
    const msg = convo.conversation_message;
    if (!msg) return { containers: [], facts: [] };
    return {
      containers: [
        {
          sourceContainerId: containerId,
          shape: 'flat',
          label: 'intercom_conversation',
          resourceExternalId: convo.id,
        },
      ],
      facts: [
        {
          sourceFactId: `intercom:conv:created:${convo.id}`,
          kind: 'content',
          occurredAt,
          resourceExternalId: convo.id,
          authors: [{ sourceUserId: msg.author.id, role: 'author' }],
          containerRefs: [containerId],
          sourceThreadId: containerId,
          entities: [convo.id],
          content: { body: msg.body, explicitLinks: [] },
          raw: event,
        },
      ],
    };
  }

  const parts = convo.conversation_parts?.conversation_parts ?? [];
  if (parts.length === 0) return { containers: [], facts: [] };

  const part = parts[parts.length - 1]!;
  if (!part.id || !isIngestableContent(part)) return { containers: [], facts: [] };

  return { containers: [], facts: [partToFact(convo, part, event, `intercom:part:${part.id}`)] };
}
