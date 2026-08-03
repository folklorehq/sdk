// SPDX-License-Identifier: Apache-2.0
import { extractExplicitLinks } from '../github/normalize.js';
import type { NormalizedRecords } from '../normalized.js';
import type { NotionPage, NotionPageEvent } from './types.js';

export function notionPageContainerId(pageId: string): string {
  return `notion:page:${pageId}`;
}

// Ids-only webhook seed (E7/1c): metadata-only by construction (no content field, so raw drives the
// embedding); distinct sourceFactId keeps the pull's content-bearing create from being deduped away.
export function normalizeNotionPageSeed(pageId: string): NormalizedRecords {
  const containerId = notionPageContainerId(pageId);
  return {
    containers: [
      {
        sourceContainerId: containerId,
        shape: 'hierarchical',
        label: 'notion_page',
        resourceExternalId: pageId,
      },
    ],
    facts: [
      {
        sourceFactId: `notion:page:seed:${pageId}`,
        kind: 'content',
        occurredAt: new Date(),
        resourceExternalId: pageId,
        authors: [],
        containerRefs: [containerId],
        sourceThreadId: containerId,
        entities: [pageId],
        raw: { pageId },
      },
    ],
  };
}

/** Structural ids Notion guarantees: the page id plus its parent database/page id. */
function notionPageEntities(page: NotionPage): string[] {
  const entities = [page.id];
  const parentId = page.parent.database_id ?? page.parent.page_id;
  if (parentId) entities.push(parentId);
  return entities;
}

function pageTitle(page: NotionPage): string {
  return (
    page.properties.title?.title.map((t) => t.plain_text).join('') ||
    page.properties.Name?.title.map((t) => t.plain_text).join('') ||
    'Untitled'
  );
}

export function normalizeNotionPageEvent(event: NotionPageEvent): NormalizedRecords {
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
