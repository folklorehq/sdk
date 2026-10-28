// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { PinoLogger } from '@folklore/logger';
import {
  ConnectorSpecError,
  ExternalServiceError,
  RateLimitError,
  TransportStatusError,
} from '@folklore/errors';
import type { ConnectorSpec, SpecStreamState } from '@folklore/contracts';
import type { ConnectorTransport } from '@folklore/core';
import type { NormalizedRecords } from '../../src/normalized.js';
import { GENERIC_SHAPE_ADAPTERS } from '../../src/definition/generic-shapes.js';
import type { ShapeAdapter, ShapeAdapters } from '../../src/definition/shape-adapters.js';
import { SpecConnector } from '../../src/definition/SpecConnector.js';
import { FixtureTransport, type FixtureReply } from '../doubles/definition/FixtureTransport.js';
import { FIXTURE_MANIFEST, spec, stream } from './fixtures/streams.js';

const NOW = new Date('2026-10-27T12:00:00.000Z');
const WINDOW_END = '2026-10-27T12:00:00.000Z';
const YEAR_BEFORE = '2025-10-27T12:00:00.000Z';
const MARKER = 'CANARY-7f3a';

const CURSOR_PAGER = { type: 'cursor', param: 'pageToken', in: 'query', nextPointer: '/next' };
const SYNC_TOKEN = {
  source: 'response_final',
  pointer: '/syncToken',
  param: 'syncToken',
  in: 'query',
  format: 'opaque',
  onGone: 'restart',
  dropsParams: ['from', 'to'],
};

function listing(change: Record<string, unknown> = {}) {
  return stream({
    request: { query: { from: '{window.start}', to: '{window.end}' } },
    paginator: CURSOR_PAGER,
    cursor: SYNC_TOKEN,
    ...change,
  });
}

function item(id: number | string, change: Record<string, unknown> = {}) {
  return {
    id: String(id),
    title: `Title ${id}`,
    author: 'u1',
    created: '2026-08-01T00:00:00.000Z',
    updated: '2026-08-01T00:00:00.000Z',
    ...change,
  };
}

function page(ids: Array<number | string>, change: Record<string, unknown> = {}): FixtureReply {
  return { body: { items: ids.map((id) => item(id)), ...change } };
}

function connector(
  connectorSpec: ConnectorSpec,
  transport: ConnectorTransport,
  options: { shapes?: ShapeAdapters; externalTenantId?: string } = {},
): SpecConnector {
  return new SpecConnector(
    { logger: new PinoLogger({ level: 'silent' }) },
    {
      spec: connectorSpec,
      manifest: FIXTURE_MANIFEST,
      transport,
      shapes: options.shapes ?? GENERIC_SHAPE_ADAPTERS,
      now: () => NOW,
      ...(options.externalTenantId ? { externalTenantId: options.externalTenantId } : {}),
    },
  );
}

async function rejection(promise: Promise<unknown>): Promise<Error> {
  try {
    await promise;
  } catch (error) {
    return error as Error;
  }
  throw new Error('expected a rejection');
}

function errorChain(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  while (current instanceof Error) {
    const withContext = current as Error & { context?: unknown };
    parts.push(
      current.message,
      String(current),
      JSON.stringify(withContext.context ?? null),
      current.stack ?? '',
    );
    current = current.cause;
  }
  return parts.join('\n');
}

function envelopeStates(value: string | null): Record<string, SpecStreamState> {
  const envelope = JSON.parse(value ?? 'null') as { streams: Record<string, string> };
  return Object.fromEntries(
    Object.entries(envelope.streams).map(([name, json]) => [name, JSON.parse(json)]),
  );
}

const urlOf = (transport: FixtureTransport, index: number) => transport.requests[index]!.url;

describe('SpecConnector pages and shapes', () => {
  it('fetches pages in order and maps every record through the item adapter', async () => {
    const transport = new FixtureTransport([
      page([1], { next: 'page-2' }),
      page([2], { next: 'page-3' }),
      page([3], { syncToken: 'sync-final' }),
    ]);
    const result = await connector(spec(listing()), transport).pull({ value: null });
    expect(transport.requests).toHaveLength(3);
    expect(urlOf(transport, 0).searchParams.get('pageToken')).toBeNull();
    expect(urlOf(transport, 1).searchParams.get('pageToken')).toBe('page-2');
    expect(urlOf(transport, 2).searchParams.get('pageToken')).toBe('page-3');
    expect(result.facts.map((f) => f.sourceFactId)).toEqual([
      'example:unknown:created:1',
      'example:unknown:created:2',
      'example:unknown:created:3',
    ]);
    expect(result.containers.map((c) => c.sourceContainerId)).toEqual([
      'example:unknown:1',
      'example:unknown:2',
      'example:unknown:3',
    ]);
    expect(result).toMatchObject({ cursor: { value: 'sync-final' }, hasMore: false });
  });

  it('reads the window from the options and the clock', async () => {
    const transport = new FixtureTransport([page([1])]);
    await connector(spec(listing()), transport).pull(
      { value: null },
      { since: new Date('2026-01-01T00:00:00.000Z') },
    );
    expect(urlOf(transport, 0).searchParams.get('from')).toBe('2026-01-01T00:00:00.000Z');
    expect(urlOf(transport, 0).searchParams.get('to')).toBe(WINDOW_END);
    const defaulted = new FixtureTransport([page([1])]);
    await connector(spec(listing()), defaulted).pull({ value: null });
    expect(urlOf(defaulted, 0).searchParams.get('from')).toBe(YEAR_BEFORE);
  });

  it('routes a calendar_event mapping to the namespaced adapter and gives it the since value', async () => {
    const seen: Array<{ since: string | undefined; label: unknown }> = [];
    const recorder: ShapeAdapter = {
      toRecords(record, _mapping, ctx): NormalizedRecords {
        seen.push({ since: ctx.since, label: ctx.parentContainerLabel });
        return {
          facts: [],
          containers: [
            {
              sourceContainerId: String((record as { id: string }).id),
              shape: 'event',
              label: 'calendar_event',
            },
          ],
        };
      },
    };
    const calendar = listing({ mapping: { shape: 'calendar_event', namespace: 'gcal' } });
    const transport = new FixtureTransport([page([1, 2])]);
    const result = await connector(spec(calendar), transport, {
      shapes: { 'calendar_event:gcal': recorder },
    }).pull({ value: null }, { since: new Date('2026-01-01T00:00:00.000Z') });
    expect(result.containers.map((c) => c.sourceContainerId)).toEqual(['1', '2']);
    expect(seen).toEqual([
      { since: '2026-01-01T00:00:00.000Z', label: null },
      { since: '2026-01-01T00:00:00.000Z', label: null },
    ]);
  });

  it('throws spec_shape_missing when a mapped shape has no adapter', () => {
    const calendar = listing({ mapping: { shape: 'calendar_event', namespace: 'gcal' } });
    expect(() => connector(spec(calendar), new FixtureTransport([]))).toThrow(
      expect.objectContaining({ code: 'spec_shape_missing' }),
    );
  });

  it('treats a missing or null record selector value as an empty page', async () => {
    for (const body of [{}, { items: null }]) {
      const transport = new FixtureTransport([{ body }]);
      const result = await connector(spec(listing()), transport).pull({ value: null });
      expect(result.facts).toEqual([]);
    }
  });

  it('fails a record selector that is not an array with spec_record_selector_invalid', async () => {
    const transport = new FixtureTransport([{ body: { items: { a: 1 } } }]);
    const error = await rejection(connector(spec(listing()), transport).pull({ value: null }));
    expect(error).toMatchObject({ code: 'spec_record_selector_invalid' });
  });

  it('fails a page over the record cap with spec_page_too_large', async () => {
    const ids = Array.from({ length: 1001 }, (_, index) => index);
    const transport = new FixtureTransport([page(ids)]);
    const error = await rejection(connector(spec(listing()), transport).pull({ value: null }));
    expect(error).toMatchObject({ code: 'spec_page_too_large' });
  });

  it('answers the rest of the Connector contract', async () => {
    const instance = connector(spec(listing()), new FixtureTransport([]));
    expect(instance.kind).toBe('example');
    expect(await instance.listResources()).toEqual([]);
    expect(instance.normalizeWebhook({ type: 'x', payload: {} })).toEqual({
      facts: [],
      containers: [],
    });
  });
});

describe('SpecConnector cursors', () => {
  const run = (replies: FixtureReply[], cursor: string | null) =>
    connector(spec(listing()), new FixtureTransport(replies)).pull({ value: cursor });

  it('response_final: the last non-nullish value wins', async () => {
    const result = await run(
      [
        page([1], { next: 'p2', syncToken: 'early' }),
        page([2], { next: 'p3', syncToken: 'late' }),
        page([3], { syncToken: null }),
      ],
      null,
    );
    expect(result.cursor.value).toBe('late');
  });

  it('response_final: the stored cursor is kept when no page carries one', async () => {
    expect((await run([page([1])], 'stored')).cursor.value).toBe('stored');
  });

  it('response_final: a null cursor stays null', async () => {
    expect((await run([page([1])], null)).cursor.value).toBeNull();
  });

  describe('record_max', () => {
    const maxOf = async (format: string, values: unknown[]) => {
      const pager = listing({
        paginator: { type: 'none' },
        cursor: {
          source: 'record_max',
          pointer: '/updated',
          param: 'since',
          in: 'query',
          format,
          onGone: 'fail',
          dropsParams: [],
        },
      });
      const body = { items: values.map((updated, index) => item(index, { updated })) };
      const result = await connector(spec(pager), new FixtureTransport([{ body }])).pull({
        value: null,
      });
      return result.cursor.value;
    };

    it('compares iso8601 values as instants and keeps the original text', async () => {
      expect(await maxOf('iso8601', ['2026-08-01T10:00:00+02:00', '2026-08-01T09:00:00Z'])).toBe(
        '2026-08-01T09:00:00Z',
      );
    });

    it('compares epoch_ms values as numbers', async () => {
      expect(await maxOf('epoch_ms', [9, 10, '2'])).toBe('10');
    });

    it('compares opaque values as strings', async () => {
      expect(await maxOf('opaque', ['a', 'c', 'b'])).toBe('c');
    });

    it('ignores records without a usable value and keeps the stored cursor when none have one', async () => {
      expect(await maxOf('iso8601', [undefined, 'not a date'])).toBeNull();
    });
  });

  describe('410', () => {
    it('discards the stream records and re-lists once without the cursor, restoring dropped params', async () => {
      const transport = new FixtureTransport([
        page([1], { next: 'p2' }),
        { status: 410 },
        page([9], { syncToken: 'fresh' }),
      ]);
      const result = await connector(spec(listing()), transport).pull({ value: 'stale' });
      expect([...urlOf(transport, 0).searchParams.keys()]).toEqual(['syncToken']);
      expect([...urlOf(transport, 2).searchParams.keys()]).toEqual(['from', 'to']);
      expect(urlOf(transport, 2).searchParams.get('pageToken')).toBeNull();
      expect(result.facts.map((f) => f.sourceFactId)).toEqual(['example:unknown:created:9']);
      expect(result.cursor.value).toBe('fresh');
    });

    it('rejects a 410 that carried no cursor', async () => {
      const transport = new FixtureTransport([{ status: 410 }]);
      const error = await rejection(connector(spec(listing()), transport).pull({ value: null }));
      expect(error).toBeInstanceOf(ExternalServiceError);
      expect((error.cause as TransportStatusError).status).toBe(410);
    });

    it('rejects a second 410', async () => {
      const transport = new FixtureTransport([{ status: 410 }, { status: 410 }]);
      const error = await rejection(connector(spec(listing()), transport).pull({ value: 'stale' }));
      expect((error.cause as TransportStatusError).status).toBe(410);
      expect(transport.requests).toHaveLength(2);
    });

    it('rejects a 410 when onGone is fail', async () => {
      const failing = listing({ cursor: { ...SYNC_TOKEN, onGone: 'fail' } });
      const transport = new FixtureTransport([{ status: 410 }]);
      const error = await rejection(connector(spec(failing), transport).pull({ value: 'stale' }));
      expect((error.cause as TransportStatusError).status).toBe(410);
      expect(transport.requests).toHaveLength(1);
    });
  });
});

describe('SpecConnector errors keep BaseConnector semantics', () => {
  const failWith = async (status: number) => {
    const transport = new FixtureTransport([{ status, body: { message: MARKER } }]);
    return rejection(connector(spec(listing()), transport).pull({ value: null }));
  };

  it('maps 401 to ExternalServiceError with a TransportStatusError cause', async () => {
    const error = await failWith(401);
    expect(error).toBeInstanceOf(ExternalServiceError);
    expect(error.cause).toBeInstanceOf(TransportStatusError);
    expect(error).toMatchObject({ cause: { status: 401 } });
  });

  it.each([429, 403])('maps %s to RateLimitError', async (status) => {
    const error = await failWith(status);
    expect(error).toBeInstanceOf(RateLimitError);
    expect(error).toMatchObject({ cause: { status } });
  });

  it('maps 500 to ExternalServiceError', async () => {
    expect(await failWith(500)).toBeInstanceOf(ExternalServiceError);
  });

  it('passes a ConnectorSpecError from the transport through unchanged', async () => {
    const transport: ConnectorTransport = {
      send: () => Promise.reject(new ConnectorSpecError('egress_request_failed')),
    };
    const error = await rejection(connector(spec(listing()), transport).pull({ value: null }));
    expect(error).toBeInstanceOf(ConnectorSpecError);
    expect(error).toMatchObject({ code: 'egress_request_failed' });
  });

  it('replaces any other transport failure with egress_request_failed and drops its text', async () => {
    const transport: ConnectorTransport = {
      send: () =>
        Promise.reject(new Error(`connect ECONNREFUSED https://api.example.test/${MARKER}`)),
    };
    const error = await rejection(connector(spec(listing()), transport).pull({ value: null }));
    expect(error).toMatchObject({ code: 'egress_request_failed' });
    expect(errorChain(error)).not.toContain(MARKER);
  });

  it('fails a body that is not JSON with spec_response_not_json and drops the body text', async () => {
    const transport = new FixtureTransport([{ rawBody: `${MARKER}{` }]);
    const error = await rejection(connector(spec(listing()), transport).pull({ value: null }));
    expect(error).toMatchObject({ code: 'spec_response_not_json' });
    expect(error.cause).toBeUndefined();
    expect(errorChain(error)).not.toContain(MARKER);
  });
});

describe('SpecConnector budget', () => {
  it('stops at a page boundary once the facts reach maxFacts and resumes from the envelope', async () => {
    const first = new FixtureTransport([
      page([1], { next: 'page-2' }),
      page([2], { next: 'page-3' }),
    ]);
    const stopped = await connector(spec(listing()), first).pull(
      { value: null },
      { maxFacts: 2, since: new Date('2026-01-01T00:00:00.000Z') },
    );
    expect(first.requests).toHaveLength(2);
    expect(stopped.hasMore).toBe(true);
    expect(stopped.facts).toHaveLength(2);
    const state = envelopeStates(stopped.cursor.value).items!;
    expect(state).toMatchObject({
      c: null,
      p: 'page-3',
      i: null,
      w: { s: '2026-01-01T00:00:00.000Z', e: WINDOW_END },
    });

    const later = new Date('2027-01-01T00:00:00.000Z');
    const second = new FixtureTransport([page([3], { syncToken: 'sync-done' })]);
    const finished = await new SpecConnector(
      { logger: new PinoLogger({ level: 'silent' }) },
      {
        spec: spec(listing()),
        manifest: FIXTURE_MANIFEST,
        transport: second,
        shapes: GENERIC_SHAPE_ADAPTERS,
        now: () => later,
      },
    ).pull({ value: stopped.cursor.value }, { maxFacts: 2, since: later });
    expect(urlOf(second, 0).searchParams.get('pageToken')).toBe('page-3');
    expect(urlOf(second, 0).searchParams.get('from')).toBe('2026-01-01T00:00:00.000Z');
    expect(urlOf(second, 0).searchParams.get('to')).toBe(WINDOW_END);
    expect(finished).toMatchObject({ hasMore: false, cursor: { value: 'sync-done' } });
    expect(finished.facts.map((f) => f.sourceFactId)).toEqual(['example:unknown:created:3']);
  });

  it('does not stop on the last page even when over budget', async () => {
    const transport = new FixtureTransport([page([1, 2, 3], { syncToken: 'done' })]);
    const result = await connector(spec(listing()), transport).pull(
      { value: null },
      { maxFacts: 1 },
    );
    expect(result).toMatchObject({ hasMore: false, cursor: { value: 'done' } });
    expect(result.facts).toHaveLength(3);
  });

  it('keeps an in-flight cursor when the stop page also carried a sync token', async () => {
    const transport = new FixtureTransport([page([1], { next: 'page-2', syncToken: 'early' })]);
    const stopped = await connector(spec(listing()), transport).pull(
      { value: null },
      { maxFacts: 1 },
    );
    expect(envelopeStates(stopped.cursor.value).items).toMatchObject({ m: 'early', c: null });
    const second = new FixtureTransport([page([2])]);
    const finished = await connector(spec(listing()), second).pull({ value: stopped.cursor.value });
    expect(finished.cursor.value).toBe('early');
  });
});

describe('SpecConnector paging limits', () => {
  it('throws spec_paginator_stalled when the next token repeats', async () => {
    const transport = new FixtureTransport([
      page([1], { next: 'same' }),
      page([2], { next: 'same' }),
    ]);
    const error = await rejection(connector(spec(listing()), transport).pull({ value: null }));
    expect(error).toMatchObject({ code: 'spec_paginator_stalled' });
  });

  it('stops gracefully with a checkpoint at 1000 pages and finishes on the next pull', async () => {
    const route = (request: { url: URL }) => {
      const token = request.url.searchParams.get('pageToken');
      const index = token === null ? 0 : Number(token.slice('token-'.length));
      return { body: { items: [], ...(index < 1500 ? { next: `token-${index + 1}` } : {}) } };
    };
    const first = new FixtureTransport(route);
    const stopped = await connector(spec(listing()), first).pull({ value: null });
    expect(first.requests).toHaveLength(1000);
    expect(stopped.hasMore).toBe(true);
    expect(envelopeStates(stopped.cursor.value).items).toMatchObject({ p: 'token-1000' });

    const second = new FixtureTransport(route);
    const finished = await connector(spec(listing()), second).pull({ value: stopped.cursor.value });
    expect(second.requests[0]!.url.searchParams.get('pageToken')).toBe('token-1000');
    expect(finished.hasMore).toBe(false);
  });
});

describe('SpecConnector parent streams', () => {
  const projects = stream({
    name: 'projects',
    request: { path: '/v1/projects' },
    mapping: null,
  });
  const tasks = stream({
    name: 'tasks',
    request: { path: '/v1/projects/{parent.pid}/tasks' },
    parent: { stream: 'projects', bind: { pid: '/id' } },
  });

  it('binds the parent record into each child request and emits nothing for a mapping-null parent', async () => {
    const transport = new FixtureTransport((request) =>
      request.url.pathname === '/v1/projects'
        ? { body: { items: [{ id: 'p1' }, { id: 'p/2' }] } }
        : { body: { items: [item(request.url.pathname.length)] } },
    );
    const result = await connector(spec(projects, tasks), transport).pull({ value: null });
    expect(transport.requests.map((r) => r.url.pathname)).toEqual([
      '/v1/projects',
      '/v1/projects/p1/tasks',
      '/v1/projects/p%2F2/tasks',
    ]);
    expect(result.facts).toHaveLength(2);
    expect(result.facts.every((f) => f.sourceFactId.startsWith('example:unknown:created:'))).toBe(
      true,
    );
  });

  it('skips the children of a parent record whose bound value is missing', async () => {
    const transport = new FixtureTransport((request) =>
      request.url.pathname === '/v1/projects'
        ? { body: { items: [{ name: 'no id' }, { id: 'p1' }, { id: { nested: 1 } }] } }
        : { body: { items: [] } },
    );
    await connector(spec(projects, tasks), transport).pull({ value: null });
    expect(transport.requests.map((r) => r.url.pathname)).toEqual([
      '/v1/projects',
      '/v1/projects/p1/tasks',
    ]);
  });

  it('finishes a multi-stream spec with an envelope that holds each stream cursor', async () => {
    const recorded = {
      ...projects,
      cursor: {
        source: 'record_max',
        pointer: '/updated',
        param: 'since',
        in: 'query',
        format: 'iso8601',
        onGone: 'fail',
        dropsParams: [],
      },
    };
    const transport = new FixtureTransport((request) =>
      request.url.pathname === '/v1/projects'
        ? { body: { items: [{ id: 'p1', updated: '2026-08-01T00:00:00.000Z' }] } }
        : { body: { items: [] } },
    );
    const result = await connector(
      spec(stream({ ...recorded, mapping: null }), tasks),
      transport,
    ).pull({ value: null });
    expect(envelopeStates(result.cursor.value).projects).toMatchObject({
      c: '2026-08-01T00:00:00.000Z',
      m: null,
      p: null,
    });
  });
});

describe('SpecConnector egress', () => {
  const nextUrlStream = (type: 'next_url' | 'link_header') =>
    listing({
      paginator: type === 'next_url' ? { type, nextUrlPointer: '/next' } : { type },
      cursor: null,
      request: {},
    });

  const hostsOf = (transport: FixtureTransport) => transport.requests.map((r) => r.url.host);

  const refusedLinks = [
    'https://api.other.test/x',
    'https://api.example.test.evil.test/x',
    'http://api.example.test/x',
    'https://user@api.example.test/x',
    'https://api.example.test:8443/x',
  ];

  it.each(refusedLinks)('next_url refuses %s and sends nothing to it', async (link) => {
    const transport = new FixtureTransport([{ body: { items: [], next: link } }]);
    const error = await rejection(
      connector(spec(nextUrlStream('next_url')), transport).pull({ value: null }),
    );
    expect(error).toMatchObject({ code: 'egress_host_refused' });
    expect(hostsOf(transport)).toEqual(['api.example.test']);
  });

  it.each(refusedLinks)('link_header refuses %s and sends nothing to it', async (link) => {
    const transport = new FixtureTransport([
      { body: { items: [] }, headers: { Link: `<${link}>; rel="next"` } },
    ]);
    const error = await rejection(
      connector(spec(nextUrlStream('link_header')), transport).pull({ value: null }),
    );
    expect(error).toMatchObject({ code: 'egress_host_refused' });
    expect(hostsOf(transport)).toEqual(['api.example.test']);
  });

  it('follows an allowed next_url with a plain GET and no body', async () => {
    const transport = new FixtureTransport([
      { body: { items: [], next: 'https://api.example.test/v1/items?page=2' } },
      { body: { items: [] } },
    ]);
    await connector(spec(nextUrlStream('next_url')), transport).pull({ value: null });
    expect(transport.requests[1]).toMatchObject({ method: 'GET', body: null });
    expect(transport.requests[1]!.url.toString()).toBe('https://api.example.test/v1/items?page=2');
  });

  it.each([
    ['cursor', CURSOR_PAGER],
    [
      'page_number',
      { type: 'page_number', param: 'page', in: 'query', start: 1, lastPagePointer: '/last' },
    ],
    ['offset', { type: 'offset', param: 'offset', limitParam: 'limit', in: 'query', limit: 10 }],
  ])(
    'a %s spec whose request host is outside the manifest fails at construction',
    (_type, paginator) => {
      const outside = listing({ paginator, request: { host: 'api.other.test' }, cursor: null });
      expect(() => connector(spec(outside), new FixtureTransport([]))).toThrow(
        expect.objectContaining({ code: 'egress_host_refused' }),
      );
    },
  );

  it('refuses a stored envelope whose page URL points at another host, before any request', async () => {
    const stored = JSON.stringify({
      v: 1,
      streams: {
        items: JSON.stringify({
          c: null,
          m: null,
          d: false,
          p: 'https://api.other.test/x',
          i: null,
          k: null,
          w: { s: YEAR_BEFORE, e: WINDOW_END },
        }),
      },
    });
    const transport = new FixtureTransport([{ body: { items: [] } }]);
    const error = await rejection(
      connector(spec(nextUrlStream('next_url')), transport).pull({ value: stored }),
    );
    expect(error).toMatchObject({ code: 'egress_host_refused' });
    expect(transport.requests).toHaveLength(0);
  });

  it('throws egress_host_refused for an unparseable next link without echoing it', async () => {
    const transport = new FixtureTransport([{ body: { items: [], next: `not a url ${MARKER}` } }]);
    const error = await rejection(
      connector(spec(nextUrlStream('next_url')), transport).pull({ value: null }),
    );
    expect(error).toMatchObject({ code: 'egress_host_refused' });
    expect(error.cause).toBeUndefined();
    expect(errorChain(error)).not.toContain(MARKER);
  });
});

describe('SpecConnector error text is content-free', () => {
  const planted = () =>
    listing({
      request: {
        query: { q: '{connection.externalTenantId}' },
        headers: { 'X-Tenant': '{connection.externalTenantId}' },
      },
      paginator: { type: 'next_url', nextUrlPointer: '/next' },
      cursor: null,
    });

  const drive = async (reply: FixtureReply) => {
    const transport = new FixtureTransport([reply]);
    return rejection(
      connector(spec(planted()), transport, { externalTenantId: MARKER }).pull({ value: null }),
    );
  };

  it.each([
    ['a 500', { status: 500, body: { error: MARKER } }],
    ['a 429', { status: 429, body: { error: MARKER } }],
    ['a host refusal', { body: { items: [], next: `https://api.other.test/${MARKER}` } }],
    ['a non-JSON body', { rawBody: `${MARKER}{` }],
    ['an unparseable next link', { body: { items: [], next: MARKER } }],
  ] as Array<[string, FixtureReply]>)(
    'after %s no error text carries the marker or the host',
    async (_label, reply) => {
      const error = await drive(reply);
      const text = errorChain(error);
      expect(text).not.toContain(MARKER);
      expect(text).not.toContain('api.example.test');
      expect(text).not.toContain('api.other.test');
    },
  );
});

describe('SpecConnector generic shapes end to end', () => {
  it('emits the item records for a one-stream spec', async () => {
    const withStatus = stream({
      mapping: {
        shape: 'item',
        containerLabel: 'unknown',
        idPointer: '/id',
        titlePointer: '/title',
        bodyPointer: null,
        authorIdPointer: '/author',
        createdAtPointer: '/created',
        updatedAtPointer: '/updated',
        status: { pointer: '/status', map: { done: 'closed' } },
        sensitivity: { restrictedScope: { mode: 'always' }, namesPointers: [] },
      },
    });
    const body = { items: [item(7, { status: 'done', updated: '2026-08-02T00:00:00.000Z' })] };
    const result = await connector(spec(withStatus), new FixtureTransport([{ body }])).pull({
      value: null,
    });
    expect(result.containers).toEqual([
      { sourceContainerId: 'example:unknown:7', shape: 'stateful', label: 'unknown' },
    ]);
    expect(result.facts.map((f) => f.sourceFactId)).toEqual([
      'example:unknown:created:7',
      'example:unknown:edited:7:2026-08-02T00:00:00.000Z',
      'example:unknown:status:7:2026-08-02T00:00:00.000Z',
    ]);
  });

  it('emits comment records in the parent item container for a parent and comment spec', async () => {
    const parent = stream({ name: 'tasks', request: { path: '/v1/tasks' } });
    const comments = stream({
      name: 'comments',
      request: { path: '/v1/tasks/{parent.tid}/comments' },
      parent: { stream: 'tasks', bind: { tid: '/id' } },
      mapping: {
        shape: 'comment',
        parentIdPointer: '/id',
        idPointer: '/id',
        bodyPointer: '/text',
        authorIdPointer: '/author',
        createdAtPointer: '/created',
        sensitivity: { restrictedScope: { mode: 'always' }, namesPointers: [] },
      },
    });
    const transport = new FixtureTransport((request) =>
      request.url.pathname === '/v1/tasks'
        ? { body: { items: [item('t1')] } }
        : {
            body: {
              items: [
                { id: 'c1', text: 'hello', author: 'u2', created: '2026-08-03T00:00:00.000Z' },
              ],
            },
          },
    );
    const result = await connector(spec(parent, comments), transport).pull({ value: null });
    const commentFact = result.facts.find((f) => f.sourceFactId === 'example:comment:c1');
    expect(commentFact).toMatchObject({
      containerRefs: ['example:unknown:t1'],
      sourceThreadId: 'example:unknown:t1',
      content: { body: 'hello' },
    });
    expect(result.containers.map((c) => c.sourceContainerId)).toEqual(['example:unknown:t1']);
  });
});

describe('SpecConnector refuses a spec that does not pass the schema', () => {
  const unchecked = (...streams: unknown[]) =>
    ({ specVersion: 1, kind: 'example', identity: null, streams }) as unknown as ConnectorSpec;

  const rejected = (candidate: ConnectorSpec): ConnectorSpecError => {
    try {
      connector(candidate, new FixtureTransport([]));
    } catch (error) {
      return error as ConnectorSpecError;
    }
    throw new Error('expected the constructor to throw');
  };

  it('refuses a spec with a runtime-owned header', () => {
    const base = listing();
    const withCookie = { ...base, request: { ...base.request, headers: { Cookie: 'a=b' } } };
    const error = rejected(unchecked(withCookie));
    expect(error).toBeInstanceOf(ConnectorSpecError);
    expect(error.code).toBe('spec_invalid');
    expect(error.message).toBe('spec_invalid');
    expect(error.cause).toBeUndefined();
    expect(error.context).toBeUndefined();
  });

  it('refuses a spec whose parent names a later stream', () => {
    const early = { ...stream({ name: 'tasks' }), parent: { stream: 'projects', bind: {} } };
    const late = stream({ name: 'projects' });
    expect(rejected(unchecked(early, late)).code).toBe('spec_invalid');
  });

  it('refuses a spec with an unknown template token', () => {
    const base = listing();
    const bad = { ...base, request: { ...base.request, query: { q: '{record.id}' } } };
    expect(rejected(unchecked(bad)).code).toBe('spec_invalid');
  });

  it('refuses a spec written for another kind', () => {
    const other = { ...spec(listing()), kind: 'someone_else' } as ConnectorSpec;
    expect(rejected(other).code).toBe('spec_invalid');
  });

  it('does not echo spec content in the error', () => {
    const base = listing();
    const bad = { ...base, request: { ...base.request, headers: { Cookie: MARKER } } };
    expect(errorChain(rejected(unchecked(bad)))).not.toContain(MARKER);
  });
});

describe('SpecConnector caps and budget across walks', () => {
  const parent = stream({
    name: 'projects',
    request: { path: '/v1/projects' },
    paginator: CURSOR_PAGER,
    mapping: null,
  });
  const child = (name: string) =>
    stream({
      name,
      request: { path: `/v1/projects/{parent.pid}/${name}` },
      parent: { stream: 'projects', bind: { pid: '/id' } },
    });
  const projectRecords = (from: number, count: number) =>
    Array.from({ length: count }, (_, index) => ({ id: `p${from + index}` }));

  it('counts pages per stream across every parent record and pauses at 1000', async () => {
    const route = (request: { url: URL }) => {
      if (request.url.pathname === '/v1/projects') {
        const second = request.url.searchParams.get('pageToken') === 'second';
        return {
          body: {
            items: projectRecords(second ? 600 : 0, 600),
            ...(second ? {} : { next: 'second' }),
          },
        };
      }
      return { body: { items: [] } };
    };
    const transport = new FixtureTransport(route);
    const result = await connector(spec(parent, child('tasks')), transport).pull({ value: null });
    expect(result.hasMore).toBe(true);
    const tasks = transport.requests.filter((r) => r.url.pathname.endsWith('/tasks'));
    expect(tasks).toHaveLength(1000);
    const state = envelopeStates(result.cursor.value);
    expect(state['projects']).toMatchObject({ p: 'second', i: 399 });
    expect(state['tasks']).toMatchObject({ k: 'p999', p: null });

    const rest = new FixtureTransport(route);
    const finished = await connector(spec(parent, child('tasks')), rest).pull({
      value: result.cursor.value,
    });
    expect(finished.hasMore).toBe(false);
    expect(rest.requests.filter((r) => r.url.pathname.endsWith('/tasks'))).toHaveLength(200);
  });

  it('stops at a record boundary once the budget is reached, even when every child is one page', async () => {
    const route = (request: { url: URL }) =>
      request.url.pathname === '/v1/projects'
        ? { body: { items: projectRecords(0, 6).map((r) => item(r.id)) } }
        : { body: { items: [item(request.url.pathname.replaceAll('/', '_'))] } };
    const connectorSpec = spec(
      stream({ name: 'projects', request: { path: '/v1/projects' } }),
      child('tasks'),
    );
    const firstTransport = new FixtureTransport(route);
    const first = await connector(connectorSpec, firstTransport).pull(
      { value: null },
      { maxFacts: 3 },
    );
    expect(first.hasMore).toBe(true);
    expect(first.facts).toHaveLength(4);
    expect(firstTransport.requests).toHaveLength(3);
    const state = envelopeStates(first.cursor.value);
    expect(state['projects']).toMatchObject({ p: null, i: 1 });
    expect(state['tasks']).toMatchObject({ k: 'p1', p: null });

    const secondTransport = new FixtureTransport(route);
    const second = await connector(connectorSpec, secondTransport).pull(
      { value: first.cursor.value },
      { maxFacts: 100 },
    );
    expect(second.hasMore).toBe(false);
    const childPaths = secondTransport.requests
      .map((r) => r.url.pathname)
      .filter((path) => path.endsWith('/tasks'));
    expect(childPaths).toEqual(['p2', 'p3', 'p4', 'p5'].map((id) => `/v1/projects/${id}/tasks`));
    expect(second.facts).toHaveLength(8);
  });

  it('stops gracefully at the per-pull fetch cap when no fact budget is given', async () => {
    const route = (request: { url: URL }) =>
      request.url.pathname === '/v1/projects'
        ? { body: { items: projectRecords(0, 1000) } }
        : { body: { items: [] } };
    const siblings = spec(parent, child('a'), child('b'), child('c'));
    const firstTransport = new FixtureTransport(route);
    const stopped = await connector(siblings, firstTransport).pull({ value: null });
    expect(stopped.hasMore).toBe(true);
    expect(firstTransport.requests.length).toBeGreaterThanOrEqual(2000);
    expect(firstTransport.requests.length).toBeLessThanOrEqual(2004);

    const secondTransport = new FixtureTransport(route);
    const finished = await connector(siblings, secondTransport).pull({
      value: stopped.cursor.value,
    });
    expect(finished.hasMore).toBe(false);
    const asked = new Set(
      [...firstTransport.requests, ...secondTransport.requests].map((r) => r.url.pathname),
    );
    for (let id = 0; id < 1000; id += 1) {
      for (const name of ['a', 'b', 'c']) {
        expect(asked.has(`/v1/projects/p${id}/${name}`)).toBe(true);
      }
    }
  });
});
