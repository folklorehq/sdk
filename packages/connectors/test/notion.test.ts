// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PinoLogger } from '@folklore/logger';
import {
  NotionConnector,
  normalizeNotionCommentEvent,
  normalizeNotionPageEvent,
  notionPageContainerId,
} from '../src/notion/index.js';
import type {
  NotionApiClient,
  NotionCommentEvent,
  NotionPage,
  NotionPageEvent,
} from '../src/notion/index.js';

const PAGE_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

function makePage(overrides: Partial<NotionPage> = {}): NotionPage {
  return {
    object: 'page',
    id: PAGE_UUID,
    created_time: '2026-01-01T00:00:00Z',
    last_edited_time: '2026-01-02T00:00:00Z',
    created_by: { id: 'user-1', object: 'user' },
    last_edited_by: { id: 'user-2', object: 'user' },
    parent: { type: 'workspace', workspace: true },
    properties: {
      title: { title: [{ plain_text: 'My Page Title' }] },
    },
    url: `https://notion.so/${PAGE_UUID}`,
    archived: false,
    ...overrides,
  };
}

function makePageEvent(type: 'page.created' | 'page.updated' = 'page.created'): NotionPageEvent {
  return {
    type,
    page: makePage(),
    workspace_id: 'ws-1',
  };
}

function makeCommentEvent(): NotionCommentEvent {
  return {
    type: 'comment.created',
    workspace_id: 'ws-1',
    comment: {
      object: 'comment',
      id: 'comment-uuid',
      parent: { type: 'page_id', page_id: PAGE_UUID },
      discussion_id: 'disc-1',
      created_time: '2026-01-03T00:00:00Z',
      created_by: { id: 'user-3', object: 'user' },
      rich_text: [{ plain_text: 'Great page!' }],
    },
  };
}

describe('notionPageContainerId', () => {
  it('formats as notion:page:{uuid}', () => {
    expect(notionPageContainerId(PAGE_UUID)).toBe(`notion:page:${PAGE_UUID}`);
  });
});

describe('normalizeNotionPageEvent — page.created', () => {
  it('produces one container and one content fact', () => {
    const result = normalizeNotionPageEvent(makePageEvent('page.created'));
    expect(result.containers).toHaveLength(1);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('content');
  });

  it('container has label notion_page and shape hierarchical', () => {
    const result = normalizeNotionPageEvent(makePageEvent('page.created'));
    expect(result.containers[0]).toMatchObject({
      label: 'notion_page',
      shape: 'hierarchical',
    });
  });

  it('container sourceContainerId is notion:page:{uuid}', () => {
    const result = normalizeNotionPageEvent(makePageEvent('page.created'));
    expect(result.containers[0]!.sourceContainerId).toBe(`notion:page:${PAGE_UUID}`);
  });

  it('fact body is the page title', () => {
    const result = normalizeNotionPageEvent(makePageEvent('page.created'));
    expect(result.facts[0]!.content?.body).toBe('My Page Title');
  });

  it('fact occurredAt is the page created_time', () => {
    const result = normalizeNotionPageEvent(makePageEvent('page.created'));
    expect(result.facts[0]!.occurredAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('falls back to Untitled when properties have no title', () => {
    const page = makePage({ properties: {} });
    const result = normalizeNotionPageEvent({ type: 'page.created', page, workspace_id: 'ws-1' });
    expect(result.facts[0]!.content?.body).toBe('Untitled');
  });

  it('emits only the page id when the parent is the workspace', () => {
    const result = normalizeNotionPageEvent(makePageEvent('page.created'));
    expect(result.facts[0]!.entities).toEqual([PAGE_UUID]);
  });

  it('adds the parent database id as a structural entity', () => {
    const page = makePage({ parent: { type: 'database_id', database_id: 'db-99' } });
    const result = normalizeNotionPageEvent({ type: 'page.created', page, workspace_id: 'ws-1' });
    expect(result.facts[0]!.entities).toEqual([PAGE_UUID, 'db-99']);
  });

  it('adds the parent page id when the page is nested under another page', () => {
    const page = makePage({ parent: { type: 'page_id', page_id: 'parent-page' } });
    const result = normalizeNotionPageEvent({ type: 'page.created', page, workspace_id: 'ws-1' });
    expect(result.facts[0]!.entities).toEqual([PAGE_UUID, 'parent-page']);
  });
});

describe('normalizeNotionPageEvent — page.updated', () => {
  it('produces no container and one content fact', () => {
    const result = normalizeNotionPageEvent(makePageEvent('page.updated'));
    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(1);
  });

  it('fact occurredAt is the page last_edited_time', () => {
    const result = normalizeNotionPageEvent(makePageEvent('page.updated'));
    expect(result.facts[0]!.occurredAt.toISOString()).toBe('2026-01-02T00:00:00.000Z');
  });

  it('fact references the page container', () => {
    const result = normalizeNotionPageEvent(makePageEvent('page.updated'));
    expect(result.facts[0]!.containerRefs).toContain(`notion:page:${PAGE_UUID}`);
  });

  it('sourceFactId carries last_edited_time so each edit is a distinct append-only fact', () => {
    const result = normalizeNotionPageEvent(makePageEvent('page.updated'));
    expect(result.facts[0]!.sourceFactId).toBe(
      `notion:page:updated:${PAGE_UUID}:2026-01-02T00:00:00Z`,
    );
  });

  it('prefers a supplied snapshot body over the page title for the edit body', () => {
    const result = normalizeNotionPageEvent({
      type: 'page.updated',
      page: makePage(),
      workspace_id: 'ws-1',
      body: 'Full edited page body',
    });
    expect(result.facts[0]!.content?.body).toBe('Full edited page body');
  });
});

class FakeNotionClient implements NotionApiClient {
  pageSinceArgs: Array<string | undefined> = [];

  constructor(private readonly pages: NotionPage[]) {}

  async listPages(updatedSince?: string) {
    this.pageSinceArgs.push(updatedSince);
    return this.pages;
  }
}

describe('NotionConnector.pull', () => {
  function connectorFor(pages: NotionPage[]) {
    const client = new FakeNotionClient(pages);
    const connector = new NotionConnector({ logger: new PinoLogger({ level: 'silent' }) }, client);
    return { client, connector };
  }

  it('seeds a container + content body for a page created inside the enclave 12-month window', async () => {
    // Regression: the enclave ALWAYS sets options.since, so the old `since ? 'page.updated' : ...`
    // dropped the container for every backfilled page. An in-window page is a create.
    const { client, connector } = connectorFor([makePage()]);

    const result = await connector.pull(
      { value: null },
      { since: new Date('2025-06-01T00:00:00Z') },
    );

    expect(client.pageSinceArgs[0]).toBe('2025-06-01T00:00:00.000Z');
    expect(result.containers).toHaveLength(1);
    expect(result.containers[0]!.label).toBe('notion_page');
    const seed = result.facts.find((f) => f.sourceFactId.startsWith('notion:page:created:'));
    expect(seed?.kind).toBe('content');
    expect(seed?.content?.body).toBe('My Page Title');
    expect(seed?.occurredAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('treats a page only edited within the window as a content edit with no container', async () => {
    const { connector } = connectorFor([makePage()]);

    const result = await connector.pull({ value: '2026-06-01T00:00:00.000Z' });

    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.sourceFactId).toContain('notion:page:updated:');
  });
});

describe('normalizeNotionCommentEvent', () => {
  it('produces no container and one content fact', () => {
    const result = normalizeNotionCommentEvent(makeCommentEvent());
    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(1);
  });

  it('fact body is the comment plain text', () => {
    const result = normalizeNotionCommentEvent(makeCommentEvent());
    expect(result.facts[0]!.content?.body).toBe('Great page!');
  });

  it('fact references the parent page container', () => {
    const result = normalizeNotionCommentEvent(makeCommentEvent());
    expect(result.facts[0]!.containerRefs).toContain(`notion:page:${PAGE_UUID}`);
    expect(result.facts[0]!.sourceThreadId).toBe(`notion:page:${PAGE_UUID}`);
  });

  it('fact sourceFactId contains comment id', () => {
    const result = normalizeNotionCommentEvent(makeCommentEvent());
    expect(result.facts[0]!.sourceFactId).toContain('comment-uuid');
  });

  it('emits the parent page id and discussion id as structural entities', () => {
    const result = normalizeNotionCommentEvent(makeCommentEvent());
    expect(result.facts[0]!.entities).toEqual([PAGE_UUID, 'disc-1']);
  });
});

describe('NotionConnector.normalizeWebhook — event-type routing', () => {
  function connector() {
    const client = new FakeNotionClient([]);
    return new NotionConnector({ logger: new PinoLogger({ level: 'silent' }) }, client);
  }

  it('routes page.created to a container-seeding content fact', () => {
    const result = connector().normalizeWebhook({ type: 'page.created', payload: makePageEvent() });
    expect(result.containers).toHaveLength(1);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.sourceFactId).toContain('notion:page:created:');
  });

  it('routes page.updated to a content fact with no container', () => {
    const result = connector().normalizeWebhook({
      type: 'page.updated',
      payload: makePageEvent('page.updated'),
    });
    expect(result.containers).toHaveLength(0);
    expect(result.facts[0]!.sourceFactId).toContain('notion:page:updated:');
  });

  it('routes comment.created to a comment content fact', () => {
    const result = connector().normalizeWebhook({
      type: 'comment.created',
      payload: makeCommentEvent(),
    });
    expect(result.facts[0]!.sourceFactId).toContain('comment-uuid');
  });

  it('ignores an unknown event type (no facts, no containers)', () => {
    const result = connector().normalizeWebhook({ type: 'page.deleted', payload: {} });
    expect(result.facts).toHaveLength(0);
    expect(result.containers).toHaveLength(0);
  });
});
