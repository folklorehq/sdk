// SPDX-License-Identifier: Apache-2.0
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { z } from 'zod';
import { hostSchema } from '../manifest.js';
import {
  connectorSpecSchema,
  factMappingSchema,
  jsonPointerSchema,
  paramNameSchema,
  FORBIDDEN_HEADER,
  RESERVED_PARAM_NAMES,
} from '../stream-spec.js';
import { isFramingHeader, isMethodOverrideHeader } from './read-semantics.js';

export const CUSTOM_DEFINITION_VERSION = 1;
export const CUSTOM_SLOT_KINDS = [
  'custom_1',
  'custom_2',
  'custom_3',
  'custom_4',
  'custom_5',
  'custom_6',
  'custom_7',
  'custom_8',
  'custom_9',
  'custom_10',
] as const;
export type CustomSlotKind = (typeof CUSTOM_SLOT_KINDS)[number];
export const CUSTOM_CONTAINER_LABEL = 'custom_record';
export const CUSTOM_MAX_STREAMS = 8;
export const CUSTOM_MAX_POST_READS = 8;
export const CUSTOM_MAX_ORG_HOSTS = 10;
// The connection's own credential is scrubbed from records at any length, unlike the HAR substring floor.
export const CUSTOM_CREDENTIAL_SCRUB_MIN = 1;
// Fixed ceilings, whatever a tier or the control plane allows.
export const CUSTOM_INITIAL_PULL_RECORDS = 5000;
export const CUSTOM_DAILY_RECORDS = 2000;
export const CUSTOM_EXPORT_MAX_BYTES = 25 * 1024 * 1024;

const C0_LIMIT = 0x20;
const DELETE_CHAR = 0x7f;
const C1_FIRST = 0x80;
const C1_LAST = 0x9f;
const INVISIBLE_RANGES: ReadonlyArray<readonly [number, number]> = [
  [0x200b, 0x200f],
  [0x2028, 0x202e],
  [0x2060, 0x2064],
  [0x2066, 0x2069],
  [0xfeff, 0xfeff],
];

const isUnsafeCode = (code: number): boolean =>
  code < C0_LIMIT ||
  code === DELETE_CHAR ||
  (code >= C1_FIRST && code <= C1_LAST) ||
  INVISIBLE_RANGES.some(([first, last]) => code >= first && code <= last);

// Control, zero-width, line-separator and bidi-override characters can disguise text shown to an admin.
const noUnsafeCharacters = (value: string): boolean =>
  [...value].every((char) => !isUnsafeCode(char.codePointAt(0) ?? 0));

export const isCustomSlotKind = (kind: string): kind is CustomSlotKind =>
  (CUSTOM_SLOT_KINDS as readonly string[]).includes(kind);

// The runtime may set Authorization for a credential; every other runtime-owned header stays refused.
const credentialHeaderSchema = z
  .string()
  .regex(/^[A-Za-z0-9-]{1,64}$/)
  .refine(
    (name) => name.toLowerCase() === 'authorization' || !FORBIDDEN_HEADER.test(name),
    'header refused',
  )
  .refine((name) => !isFramingHeader(name) && !isMethodOverrideHeader(name), 'header refused');

const csrfHeaderNameSchema = z
  .string()
  .regex(/^X-[A-Za-z0-9-]{1,62}$/)
  .refine((name) => !FORBIDDEN_HEADER.test(name), 'header is owned by the runtime')
  .refine((name) => !isMethodOverrideHeader(name), 'header is owned by the runtime');

const notReserved = (name: string): boolean => !RESERVED_PARAM_NAMES.has(name.toLowerCase());
const loginFieldSchema = z
  .string()
  .regex(/^[A-Za-z0-9_.[\]-]{1,64}$/)
  .refine(notReserved, 'reserved field name');
const loginPagePathSchema = z.string().regex(/^\/[A-Za-z0-9/_.~-]{0,255}$/);
const csrfNameSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/);
const csrfFieldNameSchema = csrfNameSchema.refine(notReserved, 'reserved field name');
const cookieNameSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/);
const MAX_EXTRA_LOGIN_FIELDS = 8;
const MAX_SESSION_COOKIES = 4;
const LOGIN_COLLISION_MESSAGE = 'login field collision';

// A plain union: two variants share from: 'cookie', which a discriminated union cannot express.
export const csrfSourceSchema = z.union([
  z
    .object({
      from: z.literal('hidden_input'),
      pagePath: loginPagePathSchema,
      inputName: csrfNameSchema,
      sendAs: z.literal('field'),
      fieldName: csrfFieldNameSchema,
    })
    .strict(),
  z
    .object({
      from: z.literal('cookie'),
      pagePath: loginPagePathSchema,
      cookieName: csrfNameSchema,
      sendAs: z.literal('field'),
      fieldName: csrfFieldNameSchema,
    })
    .strict(),
  z
    .object({
      from: z.literal('cookie'),
      pagePath: loginPagePathSchema,
      cookieName: csrfNameSchema,
      sendAs: z.literal('header'),
      headerName: csrfHeaderNameSchema,
    })
    .strict(),
]);

type FormLoginShape = {
  readonly usernameField: string;
  readonly passwordField: string;
  readonly extraFields: Readonly<Record<string, string>>;
  readonly csrf: z.infer<typeof csrfSourceSchema> | null;
};

// An extra or csrf field must never overwrite a credential field the runtime fills.
const loginFieldsAreDistinct = (login: FormLoginShape): boolean => {
  const csrfField = login.csrf?.sendAs === 'field' ? [login.csrf.fieldName] : [];
  const names = [
    login.usernameField,
    login.passwordField,
    ...Object.keys(login.extraFields),
    ...csrfField,
  ].map((name) => name.toLowerCase());
  return new Set(names).size === names.length;
};

const formLoginObjectSchema = z
  .object({
    mode: z.literal('form_login'),
    path: z.string().regex(/^\/[A-Za-z0-9/_.~-]{0,255}$/),
    encoding: z.enum(['form', 'json']),
    usernameField: loginFieldSchema,
    passwordField: loginFieldSchema,
    extraFields: z
      .record(loginFieldSchema, z.string().max(256).refine(noUnsafeCharacters, 'unsafe character'))
      .refine((fields) => Object.keys(fields).length <= MAX_EXTRA_LOGIN_FIELDS),
    sessionCookies: z.array(cookieNameSchema).min(1).max(MAX_SESSION_COOKIES).readonly(),
    csrf: csrfSourceSchema.nullable(),
  })
  .strict();

export const formLoginSchema = formLoginObjectSchema.refine(
  loginFieldsAreDistinct,
  LOGIN_COLLISION_MESSAGE,
);

// A discriminated union takes plain objects only, so the login collision check is repeated on the union.
export const customAuthSchema = z
  .discriminatedUnion('mode', [
    z
      .object({
        mode: z.literal('api_key_header'),
        header: credentialHeaderSchema,
        prefix: z.string().regex(/^[A-Za-z0-9 _-]{0,32}$/),
      })
      .strict(),
    z.object({ mode: z.literal('api_key_query'), param: paramNameSchema }).strict(),
    z.object({ mode: z.literal('basic') }).strict(),
    z
      .object({
        mode: z.literal('oauth_client_credentials'),
        tokenPath: z.string().regex(/^\/[A-Za-z0-9/_.-]{0,127}$/),
        scope: z
          .string()
          .regex(/^[\x21-\x7e ]{0,256}$/)
          .nullable(),
        clientAuth: z.enum(['basic', 'body']),
      })
      .strict(),
    z.object({ mode: z.literal('session_cookie'), cookieName: cookieNameSchema }).strict(),
    formLoginObjectSchema,
  ])
  .refine(
    (auth) => auth.mode !== 'form_login' || loginFieldsAreDistinct(auth),
    LOGIN_COLLISION_MESSAGE,
  );

export const customHostsSchema = z
  .object({
    api: hostSchema,
    token: hostSchema.nullable(),
    login: hostSchema.nullable(),
    docs: hostSchema.nullable(),
  })
  .strict();

const streamIndexSchema = z
  .number()
  .int()
  .min(0)
  .max(CUSTOM_MAX_STREAMS - 1);

export const postReadDecisionSchema = z
  .object({
    stream: streamIndexSchema,
    basis: z.enum(['openapi_operation', 'path_pattern']),
  })
  .strict();

const rootedPathSchema = z.string().regex(/^\/[A-Za-z0-9/_.~-]{0,255}$/);
const MAX_EXPORT_EVERY_HOURS = 168;

export const exportSpecSchema = z
  .object({
    format: z.enum(['csv', 'json']),
    delivery: z.discriminatedUnion('type', [
      z
        .object({
          type: z.literal('https_get'),
          path: rootedPathSchema,
          everyHours: z.number().int().min(1).max(MAX_EXPORT_EVERY_HOURS),
        })
        .strict(),
      z.object({ type: z.literal('console_upload') }).strict(),
      z.object({ type: z.literal('email_alias') }).strict(),
    ]),
    csv: z
      .object({ delimiter: z.enum([',', ';', '\t', '|']) })
      .strict()
      .nullable(),
    recordSelector: jsonPointerSchema,
    mapping: factMappingSchema,
  })
  .strict();

// One {id} placeholder, filled with the raw record id and encoded by the stream path rules.
const detailPathSchema = z
  .string()
  .max(256)
  .regex(/^\/[A-Za-z0-9/_.~-]*\{id\}[A-Za-z0-9/_.~-]*$/);

export const deletionTrackingSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('detail_probe'),
      stream: streamIndexSchema,
      detailPath: detailPathSchema,
    })
    .strict(),
  z.object({ mode: z.literal('walk_opt_in'), stream: streamIndexSchema }).strict(),
]);

export const customSourceSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('api'),
      spec: connectorSpecSchema,
      postReads: z.array(postReadDecisionSchema).max(CUSTOM_MAX_POST_READS).readonly(),
      // Empty means no stream is reconciled.
      deletion: z.array(deletionTrackingSchema).max(CUSTOM_MAX_STREAMS).readonly(),
    })
    .strict(),
  z.object({ type: z.literal('export'), export: exportSpecSchema }).strict(),
]);

export const customLimitsSchema = z
  .object({
    initialPullRecords: z.number().int().min(1).max(CUSTOM_INITIAL_PULL_RECORDS),
    dailyRecords: z.number().int().min(1).max(CUSTOM_DAILY_RECORDS),
  })
  .strict();

export const customOriginSchema = z.enum([
  'openapi',
  'base_url_probe',
  'docs_model',
  'har',
  'har_model',
  'export',
]);

const MAX_DISPLAY_NAME_LENGTH = 40;

export const customDefinitionSchema = z
  .object({
    definitionVersion: z.literal(CUSTOM_DEFINITION_VERSION),
    definitionId: z.string().uuid(),
    slot: z.enum(CUSTOM_SLOT_KINDS),
    revision: z.number().int().min(1),
    displayName: z
      .string()
      .min(1)
      .max(MAX_DISPLAY_NAME_LENGTH)
      .refine(noUnsafeCharacters, 'unsafe character'),
    hosts: customHostsSchema,
    auth: customAuthSchema.nullable(),
    source: customSourceSchema,
    limits: customLimitsSchema,
    origin: customOriginSchema,
    attestation: z
      .object({
        licensedAccess: z.literal(true),
        attestedBy: z.string().uuid(),
        attestedAt: z.string().datetime(),
      })
      .strict(),
  })
  .strict();

export type CustomDefinition = z.infer<typeof customDefinitionSchema>;
export type CustomAuth = z.infer<typeof customAuthSchema>;
export type ExportSpec = z.infer<typeof exportSpecSchema>;

export type CustomViolationCode =
  | 'custom_spec_kind_mismatch'
  | 'custom_identity_forbidden'
  | 'custom_host_outside_api'
  | 'custom_auth_mode_refused'
  | 'custom_tenant_token_refused'
  | 'custom_write_verb'
  | 'custom_post_without_read_decision'
  | 'custom_post_read_decision_dangling'
  | 'custom_shape_refused'
  | 'custom_label_refused'
  | 'custom_stream_count'
  | 'custom_exchange_host_mismatch'
  | 'custom_export_delivery_unavailable'
  | 'custom_export_csv_mismatch'
  | 'custom_hosts_duplicate_docs'
  | 'custom_deletion_stream_invalid'
  | 'custom_method_override'
  | 'custom_framing_header'
  | 'custom_path_encoded'
  | 'custom_credential_collision';

const sha256Hex = (value: string): string => bytesToHex(sha256(utf8ToBytes(value)));

export type CustomHostPhase = 'drafting' | 'active';

export function customHostDigests(
  definition: CustomDefinition,
  phase: CustomHostPhase,
): readonly string[] {
  const { api, token, login, docs } = definition.hosts;
  const hosts = [api, token, login, phase === 'drafting' ? docs : null];
  const present = hosts.filter((host): host is string => host !== null);
  return [...new Set(present)].map(sha256Hex);
}

export function customHostBinding(definition: CustomDefinition): string {
  const { api, token, login } = definition.hosts;
  return sha256Hex(`${api}|${token ?? login ?? ''}`);
}
