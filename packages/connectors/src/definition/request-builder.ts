// SPDX-License-Identifier: Apache-2.0
import { SPEC_TEMPLATE_TOKEN, hasPathControl, type StreamSpec } from '@folklore/contracts';
import type { TransportRequest } from '@folklore/core';
import { ConnectorSpecError } from '@folklore/errors';

export interface TemplateValues {
  readonly cursor: string | null;
  readonly page: string | null;
  readonly window: { readonly start: string; readonly end: string };
  readonly parent: Readonly<Record<string, string>>;
  readonly externalTenantId: string | null;
}

export interface PagingParam {
  readonly param: string;
  readonly in: 'query' | 'body';
  readonly value: string;
}

type Encode = (value: string) => string;

const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;
const LINE_BREAK = /[\r\n]/;
const PARENT_TOKEN_PREFIX = '{parent.';
const JSON_CONTENT_TYPE = 'application/json';

export function buildSpecRequest(
  stream: StreamSpec,
  values: TemplateValues,
  paging: PagingParam | null,
): TransportRequest {
  const params = placedParams(stream, values, paging);
  const path = expand(stream.request.path, values, encodePathValue);
  assertSafePath(path);
  const url = new URL(`https://${stream.request.host}${path}`);
  url.search = params.query.toString();
  const body = stream.request.method === 'POST' ? JSON.stringify(params.body) : null;
  return {
    method: stream.request.method,
    url,
    headers: specHeaders(stream, values, body !== null),
    body,
    auth: stream.auth,
    stream: stream.name,
  };
}

export function buildFollowRequest(
  stream: StreamSpec,
  url: URL,
  values: TemplateValues,
): TransportRequest {
  return {
    method: 'GET',
    url,
    headers: specHeaders(stream, values, false),
    body: null,
    auth: stream.auth,
    stream: stream.name,
  };
}

class PlacedParams {
  readonly query = new URLSearchParams();
  readonly body: Record<string, string> = Object.create(null) as Record<string, string>;

  add(where: 'query' | 'body', name: string, value: string): void {
    if (where === 'query') this.query.append(name, value);
    else this.body[name] = value;
  }
}

function placedParams(
  stream: StreamSpec,
  values: TemplateValues,
  paging: PagingParam | null,
): PlacedParams {
  const params = new PlacedParams();
  const dropped = new Set(values.cursor === null ? [] : (stream.cursor?.dropsParams ?? []));
  for (const [name, template] of Object.entries(stream.request.query ?? {})) {
    if (!dropped.has(name)) params.add('query', name, expand(template, values, identity));
  }
  for (const [name, template] of Object.entries(stream.request.body ?? {})) {
    if (!dropped.has(name)) params.add('body', name, expand(template, values, identity));
  }
  if (values.cursor !== null && stream.cursor) {
    params.add(stream.cursor.in, stream.cursor.param, values.cursor);
  }
  if (stream.paginator.type === 'offset') {
    params.add(stream.paginator.in, stream.paginator.limitParam, String(stream.paginator.limit));
  }
  if (paging) params.add(paging.in, paging.param, paging.value);
  return params;
}

function specHeaders(
  stream: StreamSpec,
  values: TemplateValues,
  hasBody: boolean,
): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, template] of Object.entries(stream.request.headers ?? {})) {
    const value = expand(template, values, identity);
    if (LINE_BREAK.test(value))
      throw new ConnectorSpecError('header_value_refused', { header: name });
    headers[name] = value;
  }
  const hasContentType = Object.keys(headers).some((name) => name.toLowerCase() === 'content-type');
  if (hasBody && !hasContentType) headers['Content-Type'] = JSON_CONTENT_TYPE;
  return headers;
}

function expand(template: string, values: TemplateValues, encode: Encode): string {
  return template.replace(SPEC_TEMPLATE_TOKEN, (token) => encode(tokenValue(token, values)));
}

function tokenValue(token: string, values: TemplateValues): string {
  if (token.startsWith(PARENT_TOKEN_PREFIX)) {
    const name = token.slice(PARENT_TOKEN_PREFIX.length, -1);
    return Object.hasOwn(values.parent, name) ? (values.parent[name] ?? '') : '';
  }
  switch (token) {
    case '{cursor}':
      return values.cursor ?? '';
    case '{page}':
      return values.page ?? '';
    case '{window.start}':
      return values.window.start;
    case '{window.end}':
      return values.window.end;
    default:
      return values.externalTenantId ?? '';
  }
}

const identity: Encode = (value) => value;

// A dot is encoded too, so a value can never read as a relative segment; an empty value would
// join two slashes into a segment the spec never declared.
const encodePathValue: Encode = (value) => {
  if (value === '') throw new ConnectorSpecError('spec_path_invalid');
  return encodeURIComponent(value).replaceAll('.', '%2E');
};

// URL parsing collapses %2E%2E, reads a backslash as a slash and drops tabs, so none may reach the parser.
function assertSafePath(path: string): void {
  const dotSegment = path.split('/').some((segment) => DOT_SEGMENT.test(segment));
  if (dotSegment || hasPathControl(path)) throw new ConnectorSpecError('spec_path_invalid');
}
