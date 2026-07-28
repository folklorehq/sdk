// SPDX-License-Identifier: Apache-2.0
import { extractExplicitLinks } from '../github/normalize.js';
export function notionPageContainerId(pageId) {
    return `notion:page:${pageId}`;
}
/** Structural ids Notion guarantees: the page id plus its parent database/page id. */
function notionPageEntities(page) {
    const entities = [page.id];
    const parentId = page.parent.database_id ?? page.parent.page_id;
    if (parentId)
        entities.push(parentId);
    return entities;
}
function notionCommentEntities(comment) {
    return [comment.parent.page_id, comment.discussion_id];
}
function pageTitle(page) {
    return (page.properties.title?.title.map((t) => t.plain_text).join('') ||
        page.properties.Name?.title.map((t) => t.plain_text).join('') ||
        'Untitled');
}
export function normalizeNotionPageEvent(event) {
    const { page, type, body } = event;
    const containerId = notionPageContainerId(page.id);
    const title = pageTitle(page);
    if (type === 'page.created') {
        return {
            containers: [
                {
                    sourceContainerId: containerId,
                    shape: 'hierarchical',
                    label: 'notion_page',
                    resourceExternalId: page.id,
                },
            ],
            facts: [
                {
                    sourceFactId: `notion:page:created:${page.id}`,
                    kind: 'content',
                    occurredAt: new Date(page.created_time),
                    resourceExternalId: page.id,
                    authors: [{ sourceUserId: page.created_by.id, role: 'author' }],
                    containerRefs: [containerId],
                    sourceThreadId: containerId,
                    entities: notionPageEntities(page),
                    content: { body: title, explicitLinks: extractExplicitLinks(title) },
                    raw: page,
                },
            ],
        };
    }
    // page.updated
    const updateBody = body ?? title;
    return {
        containers: [],
        facts: [
            {
                sourceFactId: `notion:page:updated:${page.id}:${page.last_edited_time}`,
                kind: 'content',
                occurredAt: new Date(page.last_edited_time),
                resourceExternalId: page.id,
                authors: [{ sourceUserId: page.last_edited_by.id, role: 'author' }],
                containerRefs: [containerId],
                sourceThreadId: containerId,
                entities: notionPageEntities(page),
                content: { body: updateBody, explicitLinks: extractExplicitLinks(updateBody) },
                raw: page,
            },
        ],
    };
}
export function normalizeNotionCommentEvent(event) {
    const { comment } = event;
    const pageId = comment.parent.page_id;
    const containerId = notionPageContainerId(pageId);
    const body = comment.rich_text.map((t) => t.plain_text).join('');
    const fact = {
        sourceFactId: `notion:comment:${comment.id}`,
        kind: 'content',
        occurredAt: new Date(comment.created_time),
        resourceExternalId: pageId,
        authors: [{ sourceUserId: comment.created_by.id, role: 'author' }],
        containerRefs: [containerId],
        sourceThreadId: containerId,
        entities: notionCommentEntities(comment),
        content: { body, explicitLinks: [] },
        raw: comment,
    };
    return { containers: [], facts: [fact] };
}
//# sourceMappingURL=normalize.js.map