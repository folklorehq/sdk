// SPDX-License-Identifier: Apache-2.0
import { extractExplicitLinks } from '../github/normalize.js';
const EMPTY = { containers: [], facts: [] };
export function slackThreadId(channelId, threadTs) {
    return `slack:${channelId}:${threadTs}`;
}
function tsToDate(ts) {
    return new Date(parseFloat(ts) * 1000);
}
function normalizeEdit(event) {
    const edited = event.message;
    if (!edited?.user || !edited.ts)
        return EMPTY;
    const threadTs = edited.thread_ts ?? edited.ts;
    const threadId = slackThreadId(event.channel, threadTs);
    const editTs = edited.edited?.ts ?? event.ts;
    const body = edited.text ?? '';
    const fact = {
        sourceFactId: `slack:msg:edited:${edited.ts}:${editTs}`,
        kind: 'content',
        occurredAt: tsToDate(editTs),
        resourceExternalId: event.channel,
        authors: [{ sourceUserId: edited.user, role: 'author' }],
        containerRefs: [threadId],
        sourceThreadId: threadId,
        entities: [event.channel, threadId],
        content: { body, explicitLinks: extractExplicitLinks(body) },
        raw: event,
    };
    return { containers: [], facts: [fact] };
}
function normalizeDeletion(event) {
    const deletedTs = event.deleted_ts ?? event.previous_message?.ts;
    if (!deletedTs)
        return EMPTY;
    const previous = event.previous_message;
    const threadTs = previous?.thread_ts ?? deletedTs;
    const threadId = slackThreadId(event.channel, threadTs);
    const fact = {
        sourceFactId: `slack:msg:deleted:${deletedTs}`,
        kind: 'transition',
        occurredAt: tsToDate(event.ts),
        resourceExternalId: event.channel,
        authors: previous?.user ? [{ sourceUserId: previous.user, role: 'author' }] : [],
        containerRefs: [threadId],
        sourceThreadId: threadId,
        entities: [event.channel, threadId],
        transition: { transitionType: 'deleted', detail: { field: 'message' } },
        raw: event,
    };
    return { containers: [], facts: [fact] };
}
// A reaction is a single actor at a single moment (ADL #1) → a Fact. The emoji name is left in the
// encrypted `raw` only; `detail` stays content-free so nothing labels shared-Postgres metadata.
export function normalizeSlackReaction(event) {
    if (!event.user || !event.item?.channel || !event.item.ts)
        return EMPTY;
    const messageRef = slackThreadId(event.item.channel, event.item.ts);
    const fact = {
        sourceFactId: `slack:${event.type}:${event.item.ts}:${event.user}:${event.reaction}:${event.event_ts}`,
        kind: 'transition',
        occurredAt: tsToDate(event.event_ts),
        resourceExternalId: event.item.channel,
        authors: [{ sourceUserId: event.user, role: 'author' }],
        containerRefs: [messageRef],
        sourceThreadId: messageRef,
        entities: [event.item.channel, messageRef],
        transition: { transitionType: event.type, detail: { field: 'reaction' } },
        raw: event,
    };
    return { containers: [], facts: [fact] };
}
// Slack edits/deletes arrive as `message` subtypes; an edit is a new content Fact (its new text is
// embedded + encrypted, like Jira), a delete is its own `deleted` transition (ADL #1). Never mutate
// the original.
export function normalizeSlackMessage(msg) {
    if (msg.subtype === 'message_changed')
        return normalizeEdit(msg);
    if (msg.subtype === 'message_deleted')
        return normalizeDeletion(msg);
    if (msg.subtype && msg.subtype !== 'bot_message')
        return EMPTY;
    if (!msg.ts || !msg.channel || !msg.user)
        return EMPTY;
    const threadTs = msg.thread_ts ?? msg.ts;
    const threadId = slackThreadId(msg.channel, threadTs);
    const isParent = !msg.thread_ts || msg.thread_ts === msg.ts;
    const body = msg.text ?? '';
    const fact = {
        sourceFactId: `slack:msg:${msg.ts}`,
        kind: 'content',
        occurredAt: tsToDate(msg.ts),
        resourceExternalId: msg.channel,
        authors: [{ sourceUserId: msg.user, role: 'author' }],
        containerRefs: [threadId],
        sourceThreadId: threadId,
        entities: [msg.channel, threadId],
        content: { body, explicitLinks: extractExplicitLinks(body) },
        raw: msg,
    };
    return {
        containers: isParent
            ? [
                {
                    sourceContainerId: threadId,
                    shape: 'flat',
                    label: 'slack_thread',
                    resourceExternalId: msg.channel,
                },
            ]
            : [],
        facts: [fact],
    };
}
//# sourceMappingURL=normalize.js.map