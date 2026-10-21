// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it, vi } from 'vitest';
import { PinoLogger } from '@folklore/logger';
import type { WebhookEvent } from '../src/connector.js';
import {
  NotionClient,
  NotionConnector,
  normalizeNotionPageEvent,
  notionPageContainerId,
  parseNotionCursor,
  serializeNotionCursor,
} from '../src/notion/index.js';
import type { NotionPage } from '../src/notion/index.js';
import { createPullConnector } from '../src/index.js';
import { FakeNotionApiClient } from './doubles/notion/FakeNotionApiClient.js';
import { PAGE_UUID, makePage, makePageEvent } from './fixtures/notion.js';

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

const MINUTE_MS = 60_000;
const BASE_MS = Date.parse('2026-03-01T00:00:00.000Z');
const LATER_MS = Date.parse('2026-09-01T00:00:00.000Z');

const isoAt = (ms: number) => new Date(ms).toISOString();
const uid = (n: number) => `00000000-0000-4000-8000-${n.toString(16).padStart(12, '0')}`;
const [ID_A, ID_B, ID_C, ID_OLD, ID_NEW, ID_HOT, ID_GONE, ID_TIE_A, ID_TIE_B] = [
  uid(0xa),
  uid(0xb),
  uid(0xc),
  uid(0x01d),
  uid(0x4e3),
  uid(0x407),
  uid(0x60e),
  uid(0x7a),
  uid(0x7b),
];
const pageAt = (id: string, ms: number, overrides: Partial<NotionPage> = {}) =>
  makePage({
    id,
    created_time: isoAt(BASE_MS - 1000 * MINUTE_MS),
    last_edited_time: isoAt(ms),
    ...overrides,
  });
const numbered = (count: number, startMs: number, stepMs = MINUTE_MS) =>
  Array.from({ length: count }, (_, i) => pageAt(uid(0x1000 + i), startMs + i * stepMs));
const sourceIds = (result: { facts: Array<{ sourceFactId: string }> }) =>
  result.facts.map((fact) => fact.sourceFactId);
const PAGE_ID_SEGMENT = 3;
const pageIds = (result: { facts: Array<{ sourceFactId: string }> }) =>
  sourceIds(result).map((id) => id.split(':')[PAGE_ID_SEGMENT]);
const updatedId = (page: NotionPage) => `notion:page:updated:${page.id}:${page.last_edited_time}`;

function connectorFor(
  pages: NotionPage[],
  options: { now?: number; listingCallsPerPull?: number; client?: FakeNotionApiClient } = {},
) {
  const client = options.client ?? new FakeNotionApiClient(pages);
  const connector = new NotionConnector({ logger: new PinoLogger({ level: 'silent' }) }, client, {
    now: () => options.now ?? LATER_MS,
    ...(options.listingCallsPerPull === undefined
      ? {}
      : { listingCallsPerPull: options.listingCallsPerPull }),
  });
  return { client, connector };
}

describe('NotionConnector.pull', () => {
  it('seeds a container + content body for a page created inside the enclave 12-month window', async () => {
    // Regression: the enclave ALWAYS sets options.since, so the old `since ? 'page.updated' : ...`
    // dropped the container for every backfilled page. An in-window page is a create.
    const { connector } = connectorFor([makePage()]);

    const result = await connector.pull(
      { value: null },
      { since: new Date('2025-06-01T00:00:00Z') },
    );

    expect(result.containers).toHaveLength(1);
    expect(result.containers[0]!.label).toBe('notion_page');
    const seed = result.facts.find((f) => f.sourceFactId.startsWith('notion:page:created:'));
    expect(seed?.kind).toBe('content');
    expect(seed?.content?.body).toBe('My Page Title');
    expect(seed?.occurredAt.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('treats a page only edited within the window as a content edit with no container', async () => {
    const { connector } = connectorFor([makePage()]);

    const result = await connector.pull({ value: '2026-01-01T12:00:00.000Z' });

    expect(result.containers).toHaveLength(0);
    expect(result.facts).toHaveLength(1);
    expect(result.facts[0]!.sourceFactId).toContain('notion:page:updated:');
  });

  it('lists oldest first from the start of the window on a first pull', async () => {
    const { client, connector } = connectorFor(numbered(3, BASE_MS));

    await connector.pull({ value: null }, { since: new Date(BASE_MS - MINUTE_MS) });

    expect(client.inputs[0]).toMatchObject({ direction: 'ascending', startCursor: null });
  });

  it('drops pages edited before the window and counts them', async () => {
    const pages = [pageAt(ID_OLD, BASE_MS - 10 * MINUTE_MS), pageAt(ID_NEW, BASE_MS)];
    const { connector } = connectorFor(pages);

    const result = await connector.pull({ value: null }, { since: new Date(BASE_MS - MINUTE_MS) });

    expect(sourceIds(result)).toEqual([expect.stringContaining(ID_NEW)]);
    expect(result.stats?.skipped).toEqual({ out_of_window: 1 });
  });

  describe('completeness', () => {
    it('emits a page that ties the cursor timestamp but sorts after the cursor page', async () => {
      const pages = [pageAt(ID_A, BASE_MS), pageAt(ID_B, BASE_MS)];
      const { connector } = connectorFor(pages);

      const result = await connector.pull({ value: `${isoAt(BASE_MS)}|${ID_A}` });

      expect(sourceIds(result)).toEqual([updatedId(pages[1]!)]);
    });

    it('re-reads a page edited inside the settle window on the next pull', async () => {
      const editedAt = LATER_MS - 30_000;
      const pages = [pageAt(ID_HOT, editedAt)];
      const before = isoAt(LATER_MS - 60 * MINUTE_MS);
      const first = await connectorFor(pages, { now: LATER_MS }).connector.pull({ value: before });

      expect(sourceIds(first)).toEqual([updatedId(pages[0]!)]);
      expect(first.cursor.value).toBe(before);

      const second = await connectorFor(pages, { now: LATER_MS + 10 * MINUTE_MS }).connector.pull(
        first.cursor,
      );

      expect(sourceIds(second)).toEqual([updatedId(pages[0]!)]);
      expect(second.cursor.value).toBe(`${isoAt(editedAt)}|${ID_HOT}`);
    });

    it('takes the oldest pages within the budget and continues from them', async () => {
      const pages = numbered(5, BASE_MS);
      const { connector } = connectorFor(pages);
      const since = { since: new Date(BASE_MS - MINUTE_MS) };

      const first = await connector.pull({ value: null }, { ...since, maxFacts: 2 });
      const second = await connector.pull(first.cursor, { ...since, maxFacts: 2 });
      const third = await connector.pull(second.cursor, { ...since, maxFacts: 2 });

      expect(pageIds(first)).toEqual([uid(0x1000), uid(0x1001)]);
      expect(first.hasMore).toBe(true);
      expect(pageIds(second)).toEqual([uid(0x1002), uid(0x1003)]);
      expect(second.hasMore).toBe(true);
      expect(pageIds(third)).toEqual([uid(0x1004)]);
      expect(third.hasMore).toBe(false);
    });

    it('stops inside one timestamp at the budget and resumes at the next id', async () => {
      const pages = [ID_A, ID_B, ID_C].map((id) => pageAt(id, BASE_MS));
      const { connector } = connectorFor(pages);
      const since = { since: new Date(BASE_MS - MINUTE_MS) };

      const first = await connector.pull({ value: null }, { ...since, maxFacts: 2 });
      const second = await connector.pull(first.cursor, { ...since, maxFacts: 2 });

      expect(first.facts).toHaveLength(2);
      expect(first.hasMore).toBe(true);
      expect(second.facts).toHaveLength(1);
      expect(second.hasMore).toBe(false);
    });

    it('costs one listing call in the steady state however large the workspace is', async () => {
      const pages = numbered(10_000, BASE_MS);
      const position = pages[9_998]!;
      const { client, connector } = connectorFor(pages);

      const result = await connector.pull({ value: `${position.last_edited_time}|${position.id}` });

      expect(client.searchCalls).toBe(1);
      expect(client.inputs[0]!.direction).toBe('descending');
      expect(result.facts).toHaveLength(1);
      expect(result.stats?.apiCalls).toBe(1);
    });

    it('switches to an ascending listing when the descending scan spends its call cap', async () => {
      const pages = numbered(15_000, BASE_MS);
      const { client, connector } = connectorFor(pages);
      const start = isoAt(BASE_MS - 24 * 60 * MINUTE_MS);

      const first = await connector.pull({ value: start }, { maxFacts: 250 });

      expect(client.inputs.map((i) => i.direction)).toContain('ascending');
      expect(client.inputs[0]!.direction).toBe('descending');
      expect(pageIds(first)).toEqual(pages.slice(0, 250).map((p) => p.id));
      expect(first.hasMore).toBe(true);
      expect(first.cursor.value).toContain('"listing"');
    });

    it('drops the listing once ascending reaches the end and then lists descending with one call', async () => {
      const pages = numbered(15_000, BASE_MS);
      const { client, connector } = connectorFor(pages);
      let cursor = { value: isoAt(BASE_MS - 24 * 60 * MINUTE_MS) };
      let emitted = 0;
      let hasMore = true;

      while (hasMore) {
        const result = await connector.pull(cursor, { maxFacts: 250 });
        emitted += result.facts.length;
        cursor = result.cursor as { value: string };
        hasMore = result.hasMore;
      }

      expect(emitted).toBe(15_000);
      expect(cursor.value).not.toContain('"listing"');
      const callsBefore = client.searchCalls;
      const next = await connector.pull(cursor, { maxFacts: 250 });
      expect(client.searchCalls - callsBefore).toBe(1);
      expect(next.facts).toHaveLength(0);
    });

    it('persists the search cursor when the listing cap is spent before the listing ends', async () => {
      const pages = numbered(150, BASE_MS);
      const { connector } = connectorFor(pages, { listingCallsPerPull: 1 });
      const since = { since: new Date(BASE_MS - MINUTE_MS) };

      const first = await connector.pull({ value: null }, since);
      const second = await connector.pull(first.cursor, since);

      expect(first.facts).toHaveLength(100);
      expect(first.hasMore).toBe(true);
      expect(first.cursor.value).toContain('"searchCursor"');
      expect(second.facts).toHaveLength(50);
      expect(second.hasMore).toBe(false);
    });

    it('does not lose a page that shares a timestamp across a listing batch boundary', async () => {
      const pages = [
        ...numbered(99, BASE_MS),
        pageAt(ID_TIE_B, BASE_MS + 99 * MINUTE_MS),
        pageAt(ID_TIE_A, BASE_MS + 99 * MINUTE_MS),
      ];
      const { connector } = connectorFor(pages, { listingCallsPerPull: 1 });
      const since = { since: new Date(BASE_MS - MINUTE_MS) };

      const first = await connector.pull({ value: null }, since);
      const second = await connector.pull(first.cursor, since);

      const emitted = new Set([...pageIds(first), ...pageIds(second)]);
      expect(emitted.has(ID_TIE_A) && emitted.has(ID_TIE_B)).toBe(true);
    });

    it('makes progress on the cursor when the cap is spent before any unprocessed page', async () => {
      const pages = numbered(300, BASE_MS);
      const position = pages[250]!;
      const { connector } = connectorFor(pages, { listingCallsPerPull: 1 });
      const cursor = {
        value: JSON.stringify({
          position: `${position.last_edited_time}|${position.id}`,
          listing: { mode: 'ascending', searchCursor: null },
        }),
      };

      const result = await connector.pull(cursor);

      expect(result.facts).toHaveLength(0);
      expect(result.cursor.value).not.toBe(cursor.value);
      expect(result.hasMore).toBe(true);
    });

    it('restarts a listing whose search cursor Notion rejects and counts the restart', async () => {
      const pages = numbered(150, BASE_MS);
      const client = new FakeNotionApiClient(pages, { rejectOnce: ['c:100'] });
      const { connector } = connectorFor(pages, { client });
      const cursor = {
        value: JSON.stringify({
          position: null,
          listing: { mode: 'ascending', searchCursor: 'c:100' },
        }),
      };

      const result = await connector.pull(cursor, { since: new Date(BASE_MS - MINUTE_MS) });

      expect(result.stats?.listingRestarts).toBe(1);
      expect(result.facts).toHaveLength(150);
    });

    it('returns an early return with listing_incomplete after three restarts', async () => {
      const pages = numbered(500, BASE_MS);
      const client = new FakeNotionApiClient(pages, { rejectAllCursors: true, pageSize: 10 });
      const { connector } = connectorFor(pages, { client });

      const result = await connector.pull(
        { value: null },
        { since: new Date(BASE_MS - MINUTE_MS) },
      );

      expect(result.earlyReturn).toBe(true);
      expect(result.facts).toHaveLength(0);
      expect(result.cursor.value).toBeNull();
      expect(result.stats?.listingRestarts).toBe(3);
      expect(result.stats?.skipped.listing_incomplete).toBe(1);
    });

    it('re-emits every page at a legacy cursor timestamp', async () => {
      const pages = [pageAt(ID_A, BASE_MS), pageAt(ID_B, BASE_MS)];
      const { connector } = connectorFor(pages);

      const result = await connector.pull({ value: isoAt(BASE_MS) });

      expect(result.facts).toHaveLength(2);
    });

    it('skips an archived page, counts it and advances past it', async () => {
      const pages = [pageAt(ID_GONE, BASE_MS, { archived: true })];
      const { connector } = connectorFor(pages);

      const result = await connector.pull({ value: isoAt(BASE_MS - 10 * MINUTE_MS) });

      expect(result.facts).toHaveLength(0);
      expect(result.stats?.skipped.archived).toBe(1);
      expect(result.cursor.value).toBe(`${isoAt(BASE_MS)}|${ID_GONE}`);
    });

    it('falls back to the window start for a malformed cursor and never throws', async () => {
      const pages = numbered(2, BASE_MS);
      const { client, connector } = connectorFor(pages);

      const result = await connector.pull(
        { value: '{not json' },
        { since: new Date(BASE_MS - MINUTE_MS) },
      );

      expect(result.facts).toHaveLength(2);
      expect(client.inputs[0]!.direction).toBe('ascending');
    });

    it('classifies chunked backfill pages against the backfill floor, not the chunk position', async () => {
      const pages = numbered(5, BASE_MS).map((page) => ({
        ...page,
        created_time: isoAt(BASE_MS),
      }));
      const { connector } = connectorFor(pages);
      const since = { since: new Date(BASE_MS - MINUTE_MS) };

      const first = await connector.pull({ value: null }, { ...since, maxFacts: 2 });
      const second = await connector.pull(first.cursor, { ...since, maxFacts: 2 });
      const third = await connector.pull(second.cursor, { ...since, maxFacts: 2 });

      for (const result of [first, second, third]) {
        expect(result.facts.every((f) => f.sourceFactId.startsWith('notion:page:created:'))).toBe(
          true,
        );
        expect(result.containers).toHaveLength(result.facts.length);
      }
    });

    it('keeps classifying against the position once a backfill has finished', async () => {
      const page = { ...pageAt(ID_A, BASE_MS), created_time: isoAt(BASE_MS - 10 * MINUTE_MS) };
      const { connector } = connectorFor([page]);

      const result = await connector.pull({ value: isoAt(BASE_MS - MINUTE_MS) });

      expect(result.facts[0]!.sourceFactId).toContain('notion:page:updated:');
    });

    it('marks every chunk of a backfill, not only the first', async () => {
      const { connector } = connectorFor(numbered(5, BASE_MS));
      const since = { since: new Date(BASE_MS - MINUTE_MS) };

      const first = await connector.pull(
        { value: null },
        { ...since, maxFacts: 2, backfill: true },
      );
      const second = await connector.pull(first.cursor, { maxFacts: 2 });
      const last = await connector.pull(second.cursor, { maxFacts: 2 });
      const steady = await connector.pull(last.cursor, { maxFacts: 2 });

      expect([first, second, last].map((r) => r.stats?.backfillChunk)).toEqual([true, true, true]);
      expect(steady.stats?.backfillChunk).toBeFalsy();
    });

    it('does not call a scheduled first pull on a never-advanced source a backfill', async () => {
      const { connector } = connectorFor(numbered(5, BASE_MS));
      const since = { since: new Date(BASE_MS - MINUTE_MS) };

      const first = await connector.pull({ value: null }, { ...since, maxFacts: 2 });
      const second = await connector.pull(first.cursor, { maxFacts: 2 });

      expect(first.stats?.backfillChunk).toBeUndefined();
      expect(second.stats?.backfillChunk).toBeUndefined();
      expect(first.cursor.value).not.toContain('"backfill"');
    });

    it('treats a rejected descending listing as incomplete, not as an empty success', async () => {
      const client = new FakeNotionApiClient(numbered(3, BASE_MS), { rejectDescending: true });
      const { connector } = connectorFor([], { client });

      const result = await connector.pull({ value: isoAt(BASE_MS - MINUTE_MS) });

      expect(result.earlyReturn).toBe(true);
      expect(result.stats?.skipped.listing_incomplete).toBe(1);
    });

    it('keeps titles and ids out of the counts', async () => {
      const page = pageAt(ID_A, BASE_MS, {
        properties: { title: { title: [{ plain_text: 'SECRET-TITLE' }] } },
      });
      const { connector } = connectorFor([page]);

      const result = await connector.pull({ value: isoAt(BASE_MS - MINUTE_MS) });

      const counts = JSON.stringify(result.stats);
      expect(counts).not.toContain('SECRET-TITLE');
      expect(counts).not.toContain(ID_A);
      expect(counts).not.toContain(page.url);
    });

    it('reports the listing calls the client made', async () => {
      const { client, connector } = connectorFor(numbered(250, BASE_MS));

      const result = await connector.pull(
        { value: null },
        { since: new Date(BASE_MS - MINUTE_MS) },
      );

      expect(result.stats?.apiCalls).toBe(client.searchCalls);
      expect(result.stats?.listed).toBe(250);
      expect(result.stats?.emitted).toBe(250);
    });
  });
});

describe('notion cursor', () => {
  it('round-trips a position', () => {
    const cursor = { position: { editedAt: '2026-03-01T00:00:00.000Z', pageId: 'p-1' } };

    expect(parseNotionCursor(serializeNotionCursor(cursor))).toEqual(cursor);
  });

  it('round-trips a position with a listing', () => {
    const cursor = {
      position: { editedAt: '2026-03-01T00:00:00.000Z', pageId: null },
      listing: { mode: 'ascending' as const, searchCursor: 'abc' },
    };

    expect(parseNotionCursor(serializeNotionCursor(cursor))).toEqual(cursor);
  });

  it('reads a legacy ISO cursor as a position with no page id', () => {
    expect(parseNotionCursor('2026-03-01T00:00:00.000Z')).toEqual({
      position: { editedAt: '2026-03-01T00:00:00.000Z', pageId: null },
    });
  });

  it('reads null and garbage as an empty cursor', () => {
    expect(parseNotionCursor(null)).toEqual({ position: null });
    expect(parseNotionCursor('not a date')).toEqual({ position: null });
    expect(parseNotionCursor('{broken')).toEqual({ position: null });
  });

  it('keeps the legacy compare correct for an older build reading the new format', () => {
    const cursor = serializeNotionCursor({
      position: { editedAt: '2026-03-01T00:00:00.000Z', pageId: 'p-1' },
    });
    const stopsAt = (editedAt: string) => editedAt <= cursor;

    expect(stopsAt('2026-02-28T23:59:59.000Z')).toBe(true);
    expect(stopsAt('2026-03-01T00:00:00.000Z')).toBe(true);
    expect(stopsAt('2026-03-01T00:00:01.000Z')).toBe(false);
  });
});

describe('NotionClient', () => {
  it('never lets the SDK log a failing response body', async () => {
    const consoleSpies = (['log', 'info', 'warn', 'error', 'debug'] as const).map((method) =>
      vi.spyOn(console, method).mockImplementation(() => undefined),
    );
    const failing = async () =>
      new Response(
        JSON.stringify({ object: 'error', code: 'validation_error', message: 'SECRET-BODY' }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      );
    const client = new NotionClient('token', failing as typeof globalThis.fetch);

    await expect(
      client.listPages({ direction: 'ascending', startCursor: null, maxCalls: 1 }),
    ).rejects.toBeDefined();

    for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('reports a rejected start cursor instead of throwing', async () => {
    const failing = async () =>
      new Response(
        JSON.stringify({
          object: 'error',
          status: 400,
          code: 'validation_error',
          message: 'bad cursor',
        }),
        {
          status: 400,
          headers: { 'content-type': 'application/json' },
        },
      );
    const client = new NotionClient('token', failing as typeof globalThis.fetch);

    const listing = await client.listPages({
      direction: 'ascending',
      startCursor: 'stale',
      maxCalls: 1,
    });

    expect(listing).toEqual({ pages: [], nextCursor: null, calls: 1, cursorRejected: true });
  });
});

describe('NotionConnector.pull — exported page identity drop', () => {
  const PAGE_B_UUID = 'b1b2c3d4-e5f6-7890-abcd-ef1234567891';
  const pull = (pages: NotionPage[], exportedPageIds?: ReadonlySet<string>) => {
    const connector = new NotionConnector(
      { logger: new PinoLogger({ level: 'silent' }) },
      new FakeNotionApiClient(pages),
      exportedPageIds === undefined ? undefined : { exportedPageIds },
    );
    return connector.pull({ value: null }, { since: new Date('2025-06-01T00:00:00Z') });
  };

  it('emits only the page that Folklore did not export and counts the drop', async () => {
    const result = await pull([makePage(), makePage({ id: PAGE_B_UUID })], new Set([PAGE_B_UUID]));

    expect(result.facts.every((f) => f.resourceExternalId === PAGE_UUID)).toBe(true);
    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.containers.map((c) => c.sourceContainerId)).toEqual([`notion:page:${PAGE_UUID}`]);
    expect(result.stats?.skipped).toEqual({ exported: 1 });
  });

  it('matches an exported id that differs by hyphenation or case', async () => {
    const compact = PAGE_B_UUID.replaceAll('-', '').toUpperCase();
    const result = await pull([makePage({ id: PAGE_B_UUID })], new Set([compact]));

    expect(result.facts).toHaveLength(0);
    expect(result.containers).toHaveLength(0);
    expect(result.stats?.skipped).toEqual({ exported: 1 });
  });

  it('still advances the cursor past a dropped page', async () => {
    const result = await pull(
      [makePage({ id: PAGE_B_UUID, last_edited_time: '2026-03-01T00:00:00Z' })],
      new Set([PAGE_B_UUID]),
    );

    expect(result.cursor.value).toBe(`2026-03-01T00:00:00Z|${PAGE_B_UUID}`);
  });

  it('counts an archived page that is also exported as exported, and emits neither', async () => {
    const result = await pull(
      [makePage({ id: PAGE_B_UUID, archived: true })],
      new Set([PAGE_B_UUID]),
    );

    expect(result.facts).toHaveLength(0);
    expect(result.stats?.skipped).toEqual({ exported: 1 });
  });

  it('drops an exported page in the steady-state listing and keeps it out of the emitted count', async () => {
    const editedAt = BASE_MS + 5 * MINUTE_MS;
    const pages = [pageAt(ID_A, editedAt), pageAt(ID_B, editedAt + MINUTE_MS)];
    const client = new FakeNotionApiClient(pages);
    const connector = new NotionConnector({ logger: new PinoLogger({ level: 'silent' }) }, client, {
      exportedPageIds: new Set([ID_B]),
      now: () => LATER_MS,
    });

    const result = await connector.pull({ value: isoAt(BASE_MS) });

    expect(client.inputs[0]!.direction).toBe('descending');
    expect(pageIds(result)).toEqual([ID_A]);
    expect(result.stats).toMatchObject({ emitted: 1, skipped: { exported: 1 } });
  });

  it('does not spend the fact budget on exported pages in a capped backfill chunk', async () => {
    const pages = numbered(5, BASE_MS);
    const exportedIds = new Set([pages[0]!.id, pages[2]!.id]);
    const connector = new NotionConnector(
      { logger: new PinoLogger({ level: 'silent' }) },
      new FakeNotionApiClient(pages),
      { exportedPageIds: exportedIds, now: () => LATER_MS },
    );

    const result = await connector.pull(
      { value: null },
      { since: new Date(BASE_MS - MINUTE_MS), maxFacts: 2, backfill: true },
    );

    expect(pageIds(result)).toEqual([pages[1]!.id, pages[3]!.id]);
    expect(result.stats).toMatchObject({ emitted: 2, skipped: { exported: 2 } });
    expect(result.hasMore).toBe(true);
  });

  it('ignores an id that is not a Notion page id instead of matching everything', async () => {
    const result = await pull([makePage()], new Set(['not-a-page-id']));

    expect(result.facts.length).toBeGreaterThan(0);
    expect(result.stats?.skipped).toEqual({});
  });

  it('changes nothing for an empty set or no set', async () => {
    const baseline = await pull([makePage(), makePage({ id: PAGE_B_UUID })]);
    const empty = await pull([makePage(), makePage({ id: PAGE_B_UUID })], new Set());

    expect(empty).toEqual(baseline);
    expect(baseline.stats?.skipped).toEqual({});
  });
});

describe('notion pull connector registration', () => {
  it('hands the exported page ids from the pull deps to the connector', () => {
    const connector = createPullConnector('notion', {
      logger: new PinoLogger({ level: 'silent' }),
      token: 'token',
      exportedPageIds: new Set([PAGE_UUID]),
    });

    expect(connector).toBeInstanceOf(NotionConnector);
    expect(
      (connector as unknown as { exportedPageKeys: ReadonlySet<string> }).exportedPageKeys,
    ).toEqual(new Set([`notion:page:${PAGE_UUID}`]));
  });
});

describe('NotionConnector.normalizeWebhook — real payload routing', () => {
  function connector() {
    const client = new FakeNotionApiClient([]);
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

describe('normalizeNotionPageEvent — sensitivity hints', () => {
  const legal = makePage({ properties: { title: { title: [{ plain_text: 'Legal hold' }] } } });

  it.each(['page.created', 'page.updated'] as const)(
    '%s hints the title and never the scope',
    (type) => {
      const fact = normalizeNotionPageEvent({ type, page: legal, workspace_id: 'ws-1' }).facts[0]!;
      expect(fact.sensitivityHints).toEqual({ names: ['Legal hold'], restrictedScope: false });
    },
  );
});
