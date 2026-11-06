// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import {
  hasEncodedPath,
  hasFramingHeader,
  overridesMethod,
  requestHasWriteVerb,
} from '../custom/stream-read-rules.js';
import { noUnsafeCharacters } from '../custom/custom-definition.js';
import { hostSchema, httpsHostUrlSchema } from '../manifest.js';
import { resourceScopeUnitSchema } from '../resource-scope.js';
import { connectorSpecSchema } from '../stream-spec.js';
import { FIRSTPARTY_CONTAINER_LABEL, FIRSTPARTY_SLOT_KINDS } from './firstparty-slot-kinds.js';

export const FIRSTPARTY_DEFINITION_VERSION = 1;
export const FIRSTPARTY_MAX_STREAMS = 8;
export const FIRSTPARTY_MAX_API_HOSTS = 4;
export const FIRSTPARTY_ICON_KEYS = [
  'database',
  'ticket',
  'chat',
  'calendar',
  'file',
  'chart',
  'users',
  'wrench',
  'box',
] as const;
export type FirstpartyIconKey = (typeof FIRSTPARTY_ICON_KEYS)[number];

// The allow-list holds none of the protocol-owned names: client_id, redirect_uri, response_type, state, scope, code_challenge*, request, request_uri, response_mode, nonce.
export const FIRSTPARTY_AUTHORIZE_PARAM_NAMES = [
  'access_type',
  'prompt',
  'audience',
  'owner',
  'duration',
  'include_granted_scopes',
] as const;

const MAX_DISPLAY_NAME_LENGTH = 40;
const MAX_SCOPES = 32;
const MAX_TOKEN_URL_LENGTH = 200;
const MAX_VALUE_LENGTH = 128;

// Printable ASCII without a quote or backslash, so canonical JSON adds no escape bytes.
export const firstpartySafeAscii = (max: number) =>
  z.string().regex(new RegExp(`^[\\x21\\x23-\\x5b\\x5d-\\x7e]{1,${max}}$`));

export const firstpartyTokenUrlSchema = httpsHostUrlSchema.refine(
  (url) => url.length <= MAX_TOKEN_URL_LENGTH && !/["\\]/.test(url),
);

// api_key_header and bearer_token wait for static credential entry; a one-member union keeps the discriminator.
export const firstpartyAuthSchema = z.discriminatedUnion('mode', [
  z
    .object({
      mode: z.literal('oauth2_authorization_code'),
      authorizeUrl: httpsHostUrlSchema,
      tokenUrl: firstpartyTokenUrlSchema,
      scopes: z.array(firstpartySafeAscii(MAX_VALUE_LENGTH)).max(MAX_SCOPES).readonly(),
      pkce: z.enum(['required', 'disabled']),
      clientId: firstpartySafeAscii(MAX_VALUE_LENGTH),
      tokenEndpointAuth: z.enum(['client_secret_basic', 'client_secret_post']),
      refresh: z.boolean(),
      extraAuthParams: z
        .record(z.enum(FIRSTPARTY_AUTHORIZE_PARAM_NAMES), firstpartySafeAscii(MAX_VALUE_LENGTH))
        .optional(),
    })
    .strict(),
]);

const baseDefinitionSchema = z
  .object({
    definitionVersion: z.literal(FIRSTPARTY_DEFINITION_VERSION),
    slot: z.enum(FIRSTPARTY_SLOT_KINDS),
    displayName: z
      .string()
      .min(1)
      .max(MAX_DISPLAY_NAME_LENGTH)
      .refine(noUnsafeCharacters, 'unsafe character'),
    iconKey: z.enum(FIRSTPARTY_ICON_KEYS).nullable(),
    hosts: z
      .object({
        authorize: hostSchema,
        api: z.array(hostSchema).min(1).max(FIRSTPARTY_MAX_API_HOSTS).readonly(),
        token: hostSchema,
      })
      .strict(),
    auth: firstpartyAuthSchema,
    spec: connectorSpecSchema,
    resourceScope: z.object({ unit: resourceScopeUnitSchema }).strict().nullable(),
  })
  .strict();

type BaseDefinition = z.infer<typeof baseDefinitionSchema>;

const hostnameOf = (url: string): string => new URL(url).hostname;

// Widened to string: the public SDK registry does not carry the slot label.
const isOtherLabel = (label: string): boolean => label !== FIRSTPARTY_CONTAINER_LABEL;

function violatedCodes(definition: BaseDefinition): string[] {
  const { spec, hosts, auth } = definition;
  const mappings = spec.streams.flatMap((stream) => (stream.mapping ? [stream.mapping] : []));
  const checks: ReadonlyArray<readonly [string, boolean]> = [
    ['firstparty_spec_kind_mismatch', spec.kind !== definition.slot],
    ['firstparty_identity_forbidden', spec.identity !== null],
    ['firstparty_stream_count', spec.streams.length > FIRSTPARTY_MAX_STREAMS],
    ['firstparty_method_refused', spec.streams.some((s) => s.request.method !== 'GET')],
    ['firstparty_write_verb', spec.streams.some(requestHasWriteVerb)],
    ['firstparty_method_override', spec.streams.some(overridesMethod)],
    ['firstparty_framing_header', spec.streams.some(hasFramingHeader)],
    ['firstparty_path_encoded', spec.streams.some(hasEncodedPath)],
    ['firstparty_host_outside_api', spec.streams.some((s) => !hosts.api.includes(s.request.host))],
    ['firstparty_hosts_duplicate', new Set(hosts.api).size !== hosts.api.length],
    ['firstparty_stream_auth_mismatch', spec.streams.some((s) => s.auth !== 'bearer')],
    ['firstparty_authorize_host_mismatch', hostnameOf(auth.authorizeUrl) !== hosts.authorize],
    ['firstparty_token_host_mismatch', hostnameOf(auth.tokenUrl) !== hosts.token],
    ['firstparty_shape_refused', mappings.some((m) => m.shape === 'calendar_event')],
    [
      'firstparty_label_refused',
      mappings.some((m) => m.shape === 'item' && isOtherLabel(m.containerLabel)),
    ],
  ];
  return checks.filter(([, violated]) => violated).map(([code]) => code);
}

export const firstpartyDefinitionSchema = baseDefinitionSchema.superRefine((definition, ctx) => {
  for (const message of violatedCodes(definition)) ctx.addIssue({ code: 'custom', message });
});

export type FirstpartyDefinition = z.infer<typeof firstpartyDefinitionSchema>;
