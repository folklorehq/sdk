// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PinoLogger } from '@folklore/logger';
import type { WebhookEvent } from '../src/connector.js';
import {
  NotionConnector,
  normalizeNotionPageEvent,
  notionPageContainerId,
} from '../src/notion/index.js';
import type { NotionApiClient, NotionPage, NotionPageEvent } from '../src/notion/index.js';

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

describe('NotionConnector.normalizeWebhook — real payload routing', () => {
  function connector() {
    const client = new FakeNotionClient([]);
    return new NotionConnector({ logger: new PinoLogger({ level: 'silent' }) }, client);
  }

  // Documented modern shape (developers.notion.com/reference/webhooks): page id at entity.id,
  // ~10 top-level fields, data carries parent/updated_blocks but never the page id.
  function modernWebhook(type: string, overrides: Record<string, unknown> = {}): WebhookEvent {
    return {
      type,
      payload: {
        id: 'evt-uuid',
        timestamp: '2026-01-01T00:00:00.000Z',
        workspace_id: 'ws-1',
        workspace_name: 'Acme',
        subscription_id: 'sub-1',
        integration_id: 'int-1',
        type,
        authors: [{ id: 'user-1' }],
        attempt_number: 1,
        entity: { id: PAGE_UUID, type: 'page' },
        data: { parent: { id: 'db-99', type: 'database_id' } },
        ...overrides,
      },
    };
  }

  // Legacy 2023 shape: page id at data.page_id, no entity.
  function legacyWebhook(type: string, data: Record<string, unknown>): WebhookEvent {
    return {
      type,
      payload: { id: 'evt-uuid', timestamp: '2026-01-01T00:00:00.000Z', type, data },
    };
  }

  it('parses the documented modern page.created payload and seeds a container + metadata fact', () => {
    const result = connector().normalizeWebhook(modernWebhook('page.created'));
    expect(result.containers).toHaveLength(1);
    expect(result.containers[0]).toMatchObject({ label: 'notion_page', shape: 'hierarchical' });
    expect(result.containers[0]!.resourceExternalId).toBe(PAGE_UUID);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.kind).toBe('content');
    expect(result.facts[0]!.sourceFactId).toBe(`notion:page:seed:${PAGE_UUID}`);
    expect(result.facts[0]!.containerRefs).toContain(`notion:page:${PAGE_UUID}`);
    expect(result.facts[0]!.content).toBeUndefined();
  });

  it('prefers entity.id over data.page_id when both are present', () => {
    const result = connector().normalizeWebhook(
      modernWebhook('page.created', {
        entity: { id: PAGE_UUID, type: 'page' },
        data: { page_id: 'other-page' },
      }),
    );
    expect(result.facts[0]!.sourceFactId).toBe(`notion:page:seed:${PAGE_UUID}`);
  });

  it('parses the legacy shape (top-level timestamp, data.page_id) and seeds', () => {
    const result = connector().normalizeWebhook(
      legacyWebhook('page.created', { page_id: PAGE_UUID }),
    );
    expect(result.containers).toHaveLength(1);
    expect(result.facts[0]!.sourceFactId).toBe(`notion:page:seed:${PAGE_UUID}`);
    expect(result.facts[0]!.content).toBeUndefined();
  });

  it('falls back to data.id when neither entity.id nor data.page_id is present', () => {
    const result = connector().normalizeWebhook(legacyWebhook('page.created', { id: PAGE_UUID }));
    expect(result.facts[0]!.sourceFactId).toBe(`notion:page:seed:${PAGE_UUID}`);
  });

  it('skips a database.* payload carrying only ids', () => {
    const result = connector().normalizeWebhook(
      modernWebhook('database.updated', {
        entity: { id: 'db-99', type: 'database' },
        data: { database_id: 'db-99' },
      }),
    );
    expect(result.facts).toHaveLength(0);
    expect(result.containers).toHaveLength(0);
  });

  it('skips page.content_updated ids-only without crashing', () => {
    const result = connector().normalizeWebhook(modernWebhook('page.content_updated'));
    expect(result.facts).toHaveLength(0);
    expect(result.containers).toHaveLength(0);
  });

  it('skips page.updated ids-only (no pull data to normalize)', () => {
    const result = connector().normalizeWebhook(modernWebhook('page.updated'));
    expect(result.facts).toHaveLength(0);
    expect(result.containers).toHaveLength(0);
  });

  it('skips an unknown-but-valid event name (page.deleted) without throwing', () => {
    const result = connector().normalizeWebhook(modernWebhook('page.deleted'));
    expect(result.facts).toHaveLength(0);
    expect(result.containers).toHaveLength(0);
  });

  it('skips comment.created ids-only without dereferencing a body', () => {
    const result = connector().normalizeWebhook(
      modernWebhook('comment.created', {
        entity: { id: 'comment-uuid', type: 'comment' },
        data: { page_id: PAGE_UUID, discussion_id: 'disc-1' },
      }),
    );
    expect(result.facts).toHaveLength(0);
    expect(result.containers).toHaveLength(0);
  });

  it('tolerates unexpected top-level keys (passthrough) and still seeds', () => {
    const result = connector().normalizeWebhook({
      type: 'page.created',
      payload: { type: 'page.created', data: { id: PAGE_UUID }, unexpected: true },
    });
    expect(result.facts[0]!.sourceFactId).toBe(`notion:page:seed:${PAGE_UUID}`);
  });

  it('skips a page.created with no resolvable page id without throwing', () => {
    const result = connector().normalizeWebhook({
      type: 'page.created',
      payload: { type: 'page.created', data: { parent: { id: 'db-99', type: 'database_id' } } },
    });
    expect(result.facts).toHaveLength(0);
    expect(result.containers).toHaveLength(0);
  });

  it('skips a payload with no type without throwing', () => {
    const result = connector().normalizeWebhook({
      type: 'page.created',
      payload: { data: { id: PAGE_UUID } },
    });
    expect(result.facts).toHaveLength(0);
    expect(result.containers).toHaveLength(0);
  });

  it('skips a non-object payload without throwing', () => {
    for (const payload of [null, 42, 'junk', [], { data: { id: PAGE_UUID } }]) {
      const result = connector().normalizeWebhook({ type: 'page.created', payload });
      expect(result.facts).toHaveLength(0);
      expect(result.containers).toHaveLength(0);
    }
  });
});
