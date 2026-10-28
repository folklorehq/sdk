// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { containerLabelSchema } from './container-labels.js';
import { hostSchema, type ConnectorManifest } from './manifest.js';

export const STREAM_SPEC_VERSION = 1;
export const SPEC_MAX_RECORDS_PER_PAGE = 1000;
export const SPEC_MAX_STREAM_STATE_BYTES = 2048;
export const SPEC_MAX_ENVELOPE_BYTES = 8192;

export const jsonPointerSchema = z.string().regex(/^(\/[^/~]*(~[01][^/~]*)*)*$/);

// {record.*} is reserved for edge descriptors and refused here.
export const SPEC_TEMPLATE_TOKEN =
  /\{parent\.[A-Za-z0-9_]{1,64}\}|\{connection\.externalTenantId\}|\{cursor\}|\{page\}|\{window\.(?:start|end)\}/g;
const PARENT_TOKEN = /\{parent\.([A-Za-z0-9_]{1,64})\}/g;
const TEMPLATE_MAX_LENGTH = 256;
export const RESERVED_PARAM_NAMES: ReadonlySet<string> = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);
export const paramNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9_$.-]{1,64}$/)
  .refine((name) => !RESERVED_PARAM_NAMES.has(name), 'reserved parameter name');
export const FORBIDDEN_HEADER =
  /^(?:authorization|proxy-authorization|cookie|host|x-forwarded-[a-z-]*)$/i;

export const templateSchema = z
  .string()
  .max(TEMPLATE_MAX_LENGTH)
  .refine((v) => !/[\r\n]/.test(v), 'CR or LF in a template')
  .refine((v) => !/[{}]/.test(v.replace(SPEC_TEMPLATE_TOKEN, '')), 'unknown template token');

// WHATWG URL parsing treats a backslash as a separator and drops tabs, so neither may reach a path.
export const hasPathControl = (value: string): boolean =>
  [...value].some(
    (char) => char === '\\' || char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f,
  );

export const pathTemplateSchema = templateSchema
  .refine((v) => !hasPathControl(v), 'backslash or control character in a path')
  .refine((v) => v.startsWith('/'), 'path must start with /')
  .refine((v) => !/[?#]/.test(v) && !v.split('/').includes('..'), 'query, fragment or .. in path');

const headerNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9-]{1,64}$/)
  .refine((name) => !FORBIDDEN_HEADER.test(name), 'header is owned by the runtime');

export const requestSpecSchema = z
  .object({
    method: z.enum(['GET', 'POST']),
    host: hostSchema,
    path: pathTemplateSchema,
    query: z.record(paramNameSchema, templateSchema).optional(),
    body: z.record(paramNameSchema, templateSchema).optional(),
    headers: z.record(headerNameSchema, templateSchema).optional(),
  })
  .strict();

const paramLocationSchema = z.enum(['query', 'body']);
const restrictedScopeSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('always') }).strict(),
  z
    .object({
      mode: z.literal('public_when'),
      pointer: jsonPointerSchema,
      publicValues: z
        .array(z.union([z.string(), z.boolean()]))
        .min(1)
        .readonly(),
    })
    .strict(),
]);
const sensitivitySchema = z
  .object({
    restrictedScope: restrictedScopeSchema,
    namesPointers: z.array(jsonPointerSchema).max(4).readonly(),
  })
  .strict();
const transitionTypeSchema = z.enum(['opened', 'closed', 'merged', 'reopened', 'cancelled']);

export const factMappingSchema = z.discriminatedUnion('shape', [
  z
    .object({
      shape: z.literal('item'),
      containerLabel: containerLabelSchema,
      idPointer: jsonPointerSchema,
      titlePointer: jsonPointerSchema,
      bodyPointer: jsonPointerSchema.nullable(),
      authorIdPointer: jsonPointerSchema,
      createdAtPointer: jsonPointerSchema,
      updatedAtPointer: jsonPointerSchema,
      status: z
        .object({ pointer: jsonPointerSchema, map: z.record(transitionTypeSchema) })
        .strict()
        .nullable(),
      sensitivity: sensitivitySchema,
    })
    .strict(),
  z
    .object({
      shape: z.literal('comment'),
      parentIdPointer: jsonPointerSchema,
      idPointer: jsonPointerSchema,
      bodyPointer: jsonPointerSchema,
      authorIdPointer: jsonPointerSchema,
      createdAtPointer: jsonPointerSchema,
      sensitivity: sensitivitySchema,
    })
    .strict(),
  z.object({ shape: z.literal('calendar_event'), namespace: z.enum(['gcal']) }).strict(),
]);

export const paginatorSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('none') }).strict(),
  z
    .object({
      type: z.literal('page_number'),
      param: paramNameSchema,
      in: paramLocationSchema,
      start: z.number().int().min(0),
      lastPagePointer: jsonPointerSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('cursor'),
      param: paramNameSchema,
      in: paramLocationSchema,
      nextPointer: jsonPointerSchema,
    })
    .strict(),
  z
    .object({
      type: z.literal('offset'),
      param: paramNameSchema,
      limitParam: paramNameSchema,
      in: paramLocationSchema,
      limit: z.number().int().min(1).max(500),
    })
    .strict(),
  z.object({ type: z.literal('next_url'), nextUrlPointer: jsonPointerSchema }).strict(),
  z.object({ type: z.literal('link_header') }).strict(),
]);

export const cursorSpecSchema = z
  .object({
    source: z.enum(['record_max', 'response_final']),
    pointer: jsonPointerSchema,
    param: paramNameSchema,
    in: paramLocationSchema,
    format: z.enum(['iso8601', 'epoch_ms', 'opaque']),
    onGone: z.enum(['restart', 'fail']),
    dropsParams: z.array(paramNameSchema).max(8).readonly(),
  })
  .strict();

type RequestSpec = z.infer<typeof requestSpecSchema>;

function requestTemplates(request: RequestSpec): string[] {
  return [
    request.path,
    ...Object.values(request.query ?? {}),
    ...Object.values(request.body ?? {}),
    ...Object.values(request.headers ?? {}),
  ];
}

const streamShapeSchema = z
  .object({
    specVersion: z.literal(STREAM_SPEC_VERSION),
    name: z.string().regex(/^[a-z][a-z0-9_]{0,31}$/),
    request: requestSpecSchema,
    auth: z.enum(['bearer', 'raw_token', 'none']),
    paginator: paginatorSchema,
    recordSelector: jsonPointerSchema,
    cursor: cursorSpecSchema.nullable(),
    parent: z
      .object({ stream: z.string(), bind: z.record(paramNameSchema, jsonPointerSchema) })
      .strict()
      .nullable(),
    mapping: factMappingSchema.nullable(),
  })
  .strict();

function sendsBody(stream: z.infer<typeof streamShapeSchema>): boolean {
  const paging = 'in' in stream.paginator ? stream.paginator.in : null;
  return stream.request.body !== undefined || paging === 'body' || stream.cursor?.in === 'body';
}

export const streamSpecSchema = streamShapeSchema.superRefine((stream, ctx) => {
  // A followed URL is only ever fetched with GET, so a POST body is never re-sent to it.
  if (
    stream.request.method === 'POST' &&
    ['next_url', 'link_header'].includes(stream.paginator.type)
  ) {
    ctx.addIssue({ code: 'custom', message: 'next_url and link_header need GET' });
  }
  if (stream.request.method === 'GET' && sendsBody(stream)) {
    ctx.addIssue({ code: 'custom', message: 'a GET request has no body to carry a parameter' });
  }
  const bound = new Set(Object.keys(stream.parent?.bind ?? {}));
  for (const template of requestTemplates(stream.request)) {
    for (const [, name] of template.matchAll(PARENT_TOKEN)) {
      if (name === undefined || !bound.has(name)) {
        ctx.addIssue({ code: 'custom', message: 'parent token not in parent.bind' });
      }
    }
  }
});

export const identitySpecSchema = z
  .object({
    idPointer: jsonPointerSchema,
    externalTenantIdPointer: jsonPointerSchema.nullable(),
    emailPointer: jsonPointerSchema.nullable(),
    displayNamePointer: jsonPointerSchema.nullable(),
  })
  .strict();

export type StreamSpec = z.infer<typeof streamSpecSchema>;

function duplicateNameIssues(streams: readonly StreamSpec[], ctx: z.RefinementCtx): void {
  const seen = new Set<string>();
  for (const stream of streams) {
    if (seen.has(stream.name)) {
      ctx.addIssue({ code: 'custom', message: 'duplicate stream name' });
    }
    seen.add(stream.name);
  }
}

function parentOrderIssues(streams: readonly StreamSpec[], ctx: z.RefinementCtx): void {
  const position = new Map(streams.map((stream, index) => [stream.name, index]));
  streams.forEach((stream, index) => {
    if (stream.parent === null) return;
    const parentIndex = position.get(stream.parent.stream);
    if (parentIndex === undefined || parentIndex >= index) {
      ctx.addIssue({ code: 'custom', message: 'parent must be an earlier stream' });
    }
  });
}

function unmappedLeafIssues(streams: readonly StreamSpec[], ctx: z.RefinementCtx): void {
  const parents = new Set(
    streams.flatMap((stream) => (stream.parent ? [stream.parent.stream] : [])),
  );
  for (const stream of streams) {
    if (stream.mapping === null && !parents.has(stream.name)) {
      ctx.addIssue({ code: 'custom', message: 'a stream with no mapping must be a parent' });
    }
  }
}

function commentParentIssues(streams: readonly StreamSpec[], ctx: z.RefinementCtx): void {
  const byName = new Map(streams.map((stream) => [stream.name, stream]));
  for (const stream of streams) {
    if (stream.mapping?.shape !== 'comment') continue;
    const parent = stream.parent ? byName.get(stream.parent.stream) : undefined;
    if (parent?.mapping?.shape !== 'item') {
      ctx.addIssue({ code: 'custom', message: 'a comment stream needs an item parent' });
    }
  }
}

function dropsParamsIssues(streams: readonly StreamSpec[], ctx: z.RefinementCtx): void {
  for (const stream of streams) {
    const sent = new Set([
      ...Object.keys(stream.request.query ?? {}),
      ...Object.keys(stream.request.body ?? {}),
    ]);
    for (const name of stream.cursor?.dropsParams ?? []) {
      if (!sent.has(name)) {
        ctx.addIssue({ code: 'custom', message: 'dropsParams names a key the request lacks' });
      }
    }
  }
}

export const connectorSpecSchema = z
  .object({
    specVersion: z.literal(STREAM_SPEC_VERSION),
    kind: z.string(),
    identity: identitySpecSchema.nullable(),
    streams: z.array(streamSpecSchema).min(1).readonly(),
  })
  .strict()
  .superRefine((spec, ctx) => {
    duplicateNameIssues(spec.streams, ctx);
    parentOrderIssues(spec.streams, ctx);
    unmappedLeafIssues(spec.streams, ctx);
    commentParentIssues(spec.streams, ctx);
    dropsParamsIssues(spec.streams, ctx);
  });

export type ConnectorSpec = z.infer<typeof connectorSpecSchema>;
export type FactMapping = z.infer<typeof factMappingSchema>;

export function specHostsWithin(spec: ConnectorSpec, manifest: ConnectorManifest): boolean {
  return spec.streams.every((stream) => manifest.egress.apiHosts.includes(stream.request.host));
}

export const specStreamStateSchema = z
  .object({
    c: z.string().max(512).nullable(),
    m: z.string().max(512).nullable(),
    d: z.boolean(),
    p: z.string().max(512).nullable(),
    i: z.number().int().min(0).max(SPEC_MAX_RECORDS_PER_PAGE).nullable(),
    k: z.string().max(256).nullable(),
    w: z.object({ s: z.string().datetime(), e: z.string().datetime() }).strict().nullable(),
  })
  .strict();

export type SpecStreamState = z.infer<typeof specStreamStateSchema>;

export const cursorEnvelopeSchema = z
  .object({
    v: z.literal(1),
    streams: z.record(z.string().max(SPEC_MAX_STREAM_STATE_BYTES)),
    legacy: z.string().max(4096).optional(),
  })
  .strict();
