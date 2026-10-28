// SPDX-License-Identifier: Apache-2.0
import { describe, expect, it } from 'vitest';
import { ConnectorSpecError } from '@folklore/errors';
import { buildSpecRequest, type TemplateValues } from '../../src/definition/request-builder.js';
import { FIXTURE_HOST, stream } from './fixtures/streams.js';

const WINDOW = { start: '2025-10-27T12:00:00.000Z', end: '2026-10-27T12:00:00.000Z' };

function values(change: Partial<TemplateValues> = {}): TemplateValues {
  return {
    cursor: null,
    page: null,
    window: WINDOW,
    parent: {},
    externalTenantId: null,
    ...change,
  };
}

function cursorSpec(where: 'query' | 'body', dropsParams: string[] = []) {
  return {
    source: 'record_max',
    pointer: '/updated',
    param: 'since',
    in: where,
    format: 'iso8601',
    onGone: 'fail',
    dropsParams,
  };
}

function thrown(run: () => unknown): ConnectorSpecError {
  try {
    run();
  } catch (error) {
    return error as ConnectorSpecError;
  }
  throw new Error('expected the call to throw');
}

describe('buildSpecRequest path encoding', () => {
  const pathStream = (path: string) =>
    stream({ request: { path }, parent: { stream: 'p', bind: { id: '/id' } } });

  it('percent-encodes a path value so it cannot add a segment', () => {
    const request = buildSpecRequest(
      pathStream('/v1/x-{parent.id}/y'),
      values({ parent: { id: 'a/b' } }),
      null,
    );
    expect(request.url.pathname).toBe('/v1/x-a%2Fb/y');
  });

  it('encodes dots inside a segment', () => {
    const request = buildSpecRequest(
      pathStream('/v1/x-{parent.id}/y'),
      values({ parent: { id: '..' } }),
      null,
    );
    expect(request.url.pathname).toBe('/v1/x-%2E%2E/y');
    const single = buildSpecRequest(
      pathStream('/v1/x-{parent.id}/y'),
      values({ parent: { id: '.' } }),
      null,
    );
    expect(single.url.pathname).toBe('/v1/x-%2E/y');
  });

  it.each(['.', '..'])('refuses a value that makes a whole segment the dot segment %s', (id) => {
    const error = thrown(() =>
      buildSpecRequest(pathStream('/v1/{parent.id}/y'), values({ parent: { id } }), null),
    );
    expect(error.code).toBe('spec_path_invalid');
  });

  it('keeps an already percent-encoded value literal by encoding its percent sign', () => {
    const request = buildSpecRequest(
      pathStream('/v1/{parent.id}/y'),
      values({ parent: { id: '%2e%2e' } }),
      null,
    );
    expect(request.url.pathname).toBe('/v1/%252e%252e/y');
  });

  it('refuses two values that join into a dot segment', () => {
    const joined = stream({
      request: { path: '/v1/{parent.a}{parent.b}/y' },
      parent: { stream: 'p', bind: { a: '/a', b: '/b' } },
    });
    expect(() => buildSpecRequest(joined, values({ parent: { a: '.', b: '.' } }), null)).toThrow(
      ConnectorSpecError,
    );
  });

  it('substitutes the tenant id in a path', () => {
    const tenant = stream({ request: { path: '/t/{connection.externalTenantId}/x' } });
    expect(buildSpecRequest(tenant, values({ externalTenantId: 'acme' }), null).url.pathname).toBe(
      '/t/acme/x',
    );
  });

  it('refuses a path token that expands to nothing instead of producing //', () => {
    const tenant = stream({ request: { path: '/t/{connection.externalTenantId}/x' } });
    const error = thrown(() => buildSpecRequest(tenant, values(), null));
    expect(error.code).toBe('spec_path_invalid');
    expect(error.cause).toBeUndefined();
    expect(error.context).toBeUndefined();
    const parentless = stream({
      request: { path: '/v1/{parent.id}/y' },
      parent: { stream: 'p', bind: { id: '/id' } },
    });
    expect(() => buildSpecRequest(parentless, values({ parent: { id: '' } }), null)).toThrow(
      ConnectorSpecError,
    );
  });

  it.each([
    ['a backslash', '/v1/a\\b'],
    ['a tab', '/v1/a\tb'],
    ['a NUL', '/v1/a\u0000b'],
    ['a DEL', '/v1/a\u007fb'],
  ])('refuses %s that reached the path without passing the schema', (_label, path) => {
    const unchecked = { ...stream(), request: { ...stream().request, path } };
    expect(thrown(() => buildSpecRequest(unchecked, values(), null)).code).toBe(
      'spec_path_invalid',
    );
  });

  it('encodes a backslash or control character inside a value', () => {
    const request = buildSpecRequest(
      stream({
        request: { path: '/v1/x-{parent.id}' },
        parent: { stream: 'p', bind: { id: '/id' } },
      }),
      values({ parent: { id: 'a\\b\tc' } }),
      null,
    );
    expect(request.url.pathname).toBe('/v1/x-a%5Cb%09c');
  });

  it('keeps an empty query or body token empty', () => {
    const tokens = stream({ request: { query: { a: '{cursor}' } } });
    expect(buildSpecRequest(tokens, values(), null).url.searchParams.get('a')).toBe('');
  });

  it('targets https on the spec host', () => {
    const request = buildSpecRequest(stream(), values(), null);
    expect(request.url.origin).toBe(`https://${FIXTURE_HOST}`);
    expect(request.method).toBe('GET');
    expect(request.stream).toBe('items');
    expect(request.auth).toBe('bearer');
    expect(request.body).toBeNull();
  });
});

describe('buildSpecRequest query, body and headers', () => {
  it('builds the query with URLSearchParams so reserved characters round-trip', () => {
    const request = buildSpecRequest(
      stream({
        request: { query: { q: '{parent.term}', from: '{window.start}', to: '{window.end}' } },
        parent: { stream: 'p', bind: { term: '/t' } },
      }),
      values({ parent: { term: 'a&b=c d#e' } }),
      null,
    );
    expect(request.url.searchParams.get('q')).toBe('a&b=c d#e');
    expect(request.url.searchParams.get('from')).toBe(WINDOW.start);
    expect(request.url.searchParams.get('to')).toBe(WINDOW.end);
    expect(request.url.hash).toBe('');
  });

  it('serializes the body with JSON.stringify', () => {
    const request = buildSpecRequest(
      stream({
        request: { method: 'POST', body: { jql: '{parent.term}', fixed: 'x' } },
        parent: { stream: 'p', bind: { term: '/t' } },
      }),
      values({ parent: { term: 'a "quoted" \\ value' } }),
      null,
    );
    expect(request.body).toBe(JSON.stringify({ jql: 'a "quoted" \\ value', fixed: 'x' }));
    expect(request.headers['Content-Type']).toBe('application/json');
  });

  it('builds the body without a prototype so a __proto__ key stays plain data', () => {
    const unchecked = {
      ...stream({ request: { method: 'POST' } }),
      request: {
        ...stream({ request: { method: 'POST' } }).request,
        body: JSON.parse('{"__proto__":"x"}') as Record<string, string>,
      },
    };
    const request = buildSpecRequest(unchecked, values(), null);
    expect(request.body).toBe('{"__proto__":"x"}');
    expect(Object.getPrototypeOf(JSON.parse(request.body!))).toBe(Object.prototype);
  });

  it('sends an empty JSON object for a POST with no body keys', () => {
    expect(buildSpecRequest(stream({ request: { method: 'POST' } }), values(), null).body).toBe(
      '{}',
    );
  });

  it('passes spec headers through', () => {
    const request = buildSpecRequest(
      stream({
        request: {
          headers: { Accept: 'application/json', 'X-Tenant': '{connection.externalTenantId}' },
        },
      }),
      values({ externalTenantId: 'acme' }),
      null,
    );
    expect(request.headers).toEqual({ Accept: 'application/json', 'X-Tenant': 'acme' });
  });

  it.each([
    ['carriage return', 'a\rb'],
    ['line feed', 'a\nb'],
  ])('refuses a header value holding a %s without echoing it', (_label, value) => {
    const marker = `CANARY-7f3a${value}`;
    const error = thrown(() =>
      buildSpecRequest(
        stream({
          request: { headers: { 'X-Tenant': '{connection.externalTenantId}' } },
        }),
        values({ externalTenantId: marker }),
        null,
      ),
    );
    expect(error).toBeInstanceOf(ConnectorSpecError);
    expect(error.code).toBe('header_value_refused');
    expect(error.context).toEqual({ header: 'X-Tenant' });
    const everything = `${error.message}${JSON.stringify(error.context)}${String(error)}`;
    expect(everything).not.toContain('CANARY-7f3a');
    expect(everything).not.toContain(FIXTURE_HOST);
    expect(error.cause).toBeUndefined();
  });
});

describe('buildSpecRequest cursor and paging', () => {
  const dropping = { query: { timeMin: '{window.start}', timeMax: '{window.end}', keep: 'yes' } };

  it('sends dropsParams only while there is no stored cursor', () => {
    const spec = stream({ request: dropping, cursor: cursorSpec('query', ['timeMin', 'timeMax']) });
    const fresh = buildSpecRequest(spec, values({ cursor: null }), null);
    expect([...fresh.url.searchParams.keys()]).toEqual(['timeMin', 'timeMax', 'keep']);
    const resumed = buildSpecRequest(spec, values({ cursor: 'tok' }), null);
    expect([...resumed.url.searchParams.keys()]).toEqual(['keep', 'since']);
    expect(resumed.url.searchParams.get('since')).toBe('tok');
  });

  it('puts the cursor in the body when cursor.in is body', () => {
    const spec = stream({
      request: { method: 'POST', body: { drop: 'x', keep: 'y' } },
      cursor: cursorSpec('body', ['drop']),
    });
    const request = buildSpecRequest(spec, values({ cursor: 'tok' }), null);
    expect(request.body).toBe(JSON.stringify({ keep: 'y', since: 'tok' }));
    expect([...request.url.searchParams.keys()]).toEqual([]);
  });

  it('puts the page parameter where paginator.in says', () => {
    const inQuery = buildSpecRequest(stream(), values(), {
      param: 'pageToken',
      in: 'query',
      value: 'abc',
    });
    expect(inQuery.url.searchParams.get('pageToken')).toBe('abc');
    const inBody = buildSpecRequest(stream({ request: { method: 'POST' } }), values(), {
      param: 'start_cursor',
      in: 'body',
      value: 'abc',
    });
    expect(inBody.body).toBe(JSON.stringify({ start_cursor: 'abc' }));
    expect(inBody.url.search).toBe('');
  });

  it('adds the offset limit parameter to every offset request', () => {
    const offset = stream({
      paginator: { type: 'offset', param: 'offset', limitParam: 'limit', in: 'query', limit: 50 },
    });
    const request = buildSpecRequest(offset, values(), {
      param: 'offset',
      in: 'query',
      value: '0',
    });
    expect(request.url.searchParams.get('limit')).toBe('50');
    expect(request.url.searchParams.get('offset')).toBe('0');
  });

  it('substitutes the cursor and page tokens', () => {
    const tokens = stream({ request: { query: { a: '{cursor}', b: '{page}' } } });
    const request = buildSpecRequest(tokens, values({ cursor: 'c1', page: 'p2' }), null);
    expect(request.url.searchParams.get('a')).toBe('c1');
    expect(request.url.searchParams.get('b')).toBe('p2');
    const empty = buildSpecRequest(tokens, values(), null);
    expect(empty.url.searchParams.get('a')).toBe('');
  });
});
