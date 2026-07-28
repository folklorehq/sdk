export function intercomConversationId(conversationId) {
    return `intercom:conv:${conversationId}`;
}
export function normalizeIntercomEvent(event) {
    const convo = event.data.item;
    const containerId = intercomConversationId(convo.id);
    const occurredAt = new Date(event.created_at * 1000);
    if (event.topic === 'conversation.user.created') {
        const msg = convo.conversation_message;
        if (!msg)
            return { containers: [], facts: [] };
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
    // reply events
    const parts = convo.conversation_parts?.conversation_parts ?? [];
    if (parts.length === 0)
        return { containers: [], facts: [] };
    const part = parts[parts.length - 1];
    if (!part.body)
        return { containers: [], facts: [] };
    return {
        containers: [],
        facts: [
            {
                sourceFactId: `intercom:part:${convo.id}:${part.created_at}`,
                kind: 'content',
                occurredAt: new Date(part.created_at * 1000),
                resourceExternalId: convo.id,
                authors: [{ sourceUserId: part.author.id, role: 'author' }],
                containerRefs: [containerId],
                sourceThreadId: containerId,
                entities: [convo.id],
                content: { body: part.body, explicitLinks: [] },
                raw: event,
            },
        ],
    };
}
//# sourceMappingURL=normalize.js.map