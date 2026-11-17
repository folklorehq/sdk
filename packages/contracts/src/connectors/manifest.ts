// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';
import { resourceScopeUnitSchema } from './resource-scope.js';
import { isFramingHeader } from './custom/read-semantics.js';

export const CONNECTOR_MANIFEST_VERSION = 1;

export const connectorReleaseSchema = z.enum(['beta', 'dark', 'retired', 'planned']);
export const connectorAudienceSchema = z.enum(['org', 'member']);

export const FORBIDDEN_HOST_SUFFIXES = [
  '.internal',
  '.local',
  '.localhost',
  '.amazonaws.com',
] as const;

const hostAllowed = (host: string) =>
  !FORBIDDEN_HOST_SUFFIXES.some((suffix) => host === suffix.slice(1) || host.endsWith(suffix));

// A DNS name with an alphabetic TLD: IP literals are refused.
export const hostSchema = z
  .string()
  .regex(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/)
  .refine(hostAllowed, 'forbidden host suffix');
export const suffixSchema = z
  .string()
  .regex(/^(?:\.[a-z0-9-]+)+\.[a-z]{2,}$/)
  .refine(hostAllowed, 'forbidden host suffix');

const urlHostAllowed = (value: string): boolean => {
  try {
    return hostSchema.safeParse(new URL(value).hostname).success;
  } catch {
    return false;
  }
};

export const httpsHostUrlSchema = z
  .string()
  .url()
  .startsWith('https://')
  .refine(urlHostAllowed, 'URL host refused');
export const containerLabelNameSchema = z.string().regex(/^[a-z][a-z0-9_]{1,40}$/);
const envNameSchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/);
const kindNameSchema = z.string().regex(/^[a-z][a-z0-9_]{1,31}$/);

export const enclaveRedeemSchema = z
  .object({
    tokenEndpoint: httpsHostUrlSchema,
    identityEndpoint: httpsHostUrlSchema,
    refreshRequired: z.boolean(),
  })
  .strict();

export const connectorAuthSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('oauth2'),
      authUrl: httpsHostUrlSchema,
      scopes: z.array(z.string().min(1)).readonly(),
      scopeParam: z.enum(['scope', 'user_scope']),
      pkce: z.enum(['required', 'disabled']),
      clientIdEnv: envNameSchema,
      extraAuthParams: z.record(z.string()).optional(),
      authorizeParameterMode: z.enum(['standard', 'client-state-only']).optional(),
      redeem: enclaveRedeemSchema.nullable(),
    })
    .strict(),
  z
    .object({
      type: z.literal('github_app'),
      appSlugEnv: envNameSchema,
      redeem: enclaveRedeemSchema,
    })
    .strict(),
  z.object({ type: z.literal('inherits'), from: kindNameSchema }).strict(),
]);

// Framing headers are classified by the custom-definition checker, so they stay out of this shared set and are refused separately for identity lookups.
export const FORBIDDEN_HEADER =
  /^(?:authorization|proxy-[a-z-]*|cookie|host|x-forwarded-[a-z-]*|forwarded|x-real-ip|expect)$/i;

export const headerNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9-]{1,64}$/)
  .refine((name) => !FORBIDDEN_HEADER.test(name), 'header is owned by the runtime');

export const jsonPointerSchema = z.string().regex(/^(\/[^/~]*(~[01][^/~]*)*)*$/);

// The edge lower-cases header names before lookup, so a mixed-case name could never match.
const webhookHeaderNameSchema = headerNameSchema.refine((name) => name === name.toLowerCase());

export const webhookBuiltinVerifierSchema = z.enum([
  'atlassian_connect_jwt',
  'google_channel_token',
  'graph_client_state',
  'ses_sns',
  'zoom_or_recall',
]);

export const webhookVerifierSchema = z.discriminatedUnion('scheme', [
  z
    .object({
      scheme: z.literal('hmac_body'),
      algorithm: z.enum(['sha256', 'sha1']),
      header: webhookHeaderNameSchema,
      prefix: z.enum(['sha256=', 'sha1=']).nullable(),
      encoding: z.enum(['hex', 'base64']),
    })
    .strict(),
  z
    .object({
      scheme: z.literal('hmac_timestamped'),
      header: webhookHeaderNameSchema,
      timestampHeader: webhookHeaderNameSchema,
      toleranceSeconds: z.number().int().min(1).max(300),
    })
    .strict(),
  z.object({ scheme: z.literal('svix') }).strict(),
  z.object({ scheme: z.literal('builtin'), id: webhookBuiltinVerifierSchema }).strict(),
]);

export const webhookSelectorSchema = z
  .discriminatedUnion('from', [
    z.object({ from: z.literal('header'), name: webhookHeaderNameSchema }).strict(),
    z.object({ from: z.literal('body'), pointer: jsonPointerSchema }).strict(),
  ])
  .nullable();

export const webhookHandshakeSchema = z
  .object({
    type: z.literal('builtin'),
    id: z.enum([
      'slack_url_verification',
      'notion_verification',
      'zoom_url_validation',
      'intercom_ping',
      'graph_validation',
      'drive_sync',
    ]),
  })
  .strict()
  .nullable();

export const webhookTenantKeySchema = z.enum([
  'github_installation',
  'slack_team',
  'notion_workspace',
  'intercom_workspace',
  'jwt_iss',
  'zoom_account',
]);

export const connectorWebhookSchema = z
  .object({
    routing: z.enum(['payload', 'url']),
    registration: z.enum(['app_wide', 'per_connection', 'customer_configured', 'platform']),
    verifier: webhookVerifierSchema,
    tenantKey: webhookTenantKeySchema.nullable(),
    eventType: webhookSelectorSchema,
    deliveryId: webhookSelectorSchema,
    handshake: webhookHandshakeSchema,
  })
  .strict();

export type WebhookVerifier = z.infer<typeof webhookVerifierSchema>;
export type WebhookSelector = z.infer<typeof webhookSelectorSchema>;
export type ConnectorWebhook = z.infer<typeof connectorWebhookSchema>;

export const webhookEventTypeSchema = z.string().regex(/^[A-Za-z0-9_.:-]{1,64}$/);

// These keep their payload extractors and handshakes; every other declarative kind is URL-routed.
export const CODE_ROUTED_WEBHOOK_KINDS = Object.freeze([
  'github',
  'slack',
  'notion',
  'intercom',
  'jira',
] as const);

// A positive set: a scheme added later is not declarative until it is listed here.
const DECLARATIVE_SCHEMES: ReadonlySet<WebhookVerifier['scheme']> = new Set([
  'hmac_body',
  'hmac_timestamped',
  'svix',
]);

export function isDeclarativeWebhook(webhook: ConnectorWebhook): boolean {
  return DECLARATIVE_SCHEMES.has(webhook.verifier.scheme);
}

function verifierHeaders(verifier: WebhookVerifier): string[] {
  if (verifier.scheme === 'hmac_body') return [verifier.header];
  if (verifier.scheme === 'hmac_timestamped') return [verifier.header, verifier.timestampHeader];
  return [];
}

// A selected value leaves the edge in plaintext, so it may never be the signature itself.
function selectsSignatureHeader(webhook: ConnectorWebhook): boolean {
  const signed = verifierHeaders(webhook.verifier);
  return [webhook.eventType, webhook.deliveryId].some(
    (selector) => selector?.from === 'header' && signed.includes(selector.name),
  );
}

export const connectorPullSchema = z
  .object({
    // null: pulled on connect or by the kind's own scheduler, not on the shared cadence.
    cadenceMinutes: z.number().int().positive().nullable(),
    documentBodies: z.boolean(),
  })
  .strict();

export const connectorSettingsSchema = z.enum([
  'none',
  'codebase_selection',
  'mail_label_allowlist',
  'mail_folder_allowlist',
  'resource_scope',
]);

export const connectorUiSchema = z
  .object({
    connectable: z.boolean(),
    description: z.string().min(1).max(120).nullable(),
    scopePreview: z.array(z.string().min(1).max(60)).readonly(),
  })
  .strict()
  .refine((ui) => !ui.connectable || (ui.description !== null && ui.scopePreview.length > 0), {
    message: 'a connectable kind needs a description and a scope preview',
  });

export const identityLookupSchema = z
  .object({
    method: z.enum(['GET', 'POST']),
    url: httpsHostUrlSchema,
    graphqlQuery: z.string().min(1).max(512).optional(),
    headers: z
      .record(
        headerNameSchema.refine((name) => !isFramingHeader(name), 'framing header'),
        z.string().regex(/^[\x20-\x7e]{1,128}$/),
      )
      .optional(),
    idPointer: jsonPointerSchema.min(1),
    namePointer: jsonPointerSchema.min(1).optional(),
  })
  .strict()
  .refine((lookup) => lookup.graphqlQuery === undefined || lookup.method === 'POST', {
    message: 'a GraphQL lookup is a POST',
  });

// Revocation is best effort and sends each declared token as a form `token` field to a host in egress.apiHosts.
export const identityRevokeSchema = z
  .object({
    url: httpsHostUrlSchema,
    tokens: z
      .array(z.enum(['refresh_token', 'access_token']))
      .min(1)
      .max(2)
      .readonly(),
  })
  .strict();

// A member links by the explicit OAuth button only; the lookup runs once with the redeemed token, which is then discarded.
export const connectorIdentitySchema = z
  .object({
    live: z.boolean(),
    authorEmailSuggestions: z.literal(true).optional(),
    authUrl: httpsHostUrlSchema,
    scopes: z.array(z.string().min(1)).readonly(),
    scopeParam: z.enum(['scope', 'user_scope']),
    pkce: z.enum(['required', 'disabled']),
    clientIdEnv: envNameSchema.optional(),
    fallbackToSource: z.boolean(),
    extraAuthParams: z.record(z.string()).optional(),
    lookup: identityLookupSchema,
    revoke: identityRevokeSchema.optional(),
  })
  .strict();

// UNWIRED: no caller until customer-defined connectors are wired. Sealed data, never a provider the enclave links members through.
export const customConnectorIdentitySchema = z.null();

export const connectorManifestSchema = z
  .object({
    manifestVersion: z.literal(CONNECTOR_MANIFEST_VERSION),
    kind: kindNameSchema,
    displayName: z.string().min(1).max(40),
    release: connectorReleaseSchema,
    audience: connectorAudienceSchema,
    emitsFacts: z.boolean(),
    threadRefs: z.boolean(),
    sourceDirs: z.array(z.string().regex(/^[a-z0-9-]+$/)).readonly(),
    icon: z
      .object({ slug: z.string(), color: z.string().regex(/^[0-9A-F]{6}$/) })
      .strict()
      .nullable(),
    ui: connectorUiSchema,
    auth: connectorAuthSchema.nullable(),
    egress: z
      .object({
        apiHosts: z.array(hostSchema).readonly(),
        cdnSuffixes: z.array(suffixSchema).readonly(),
      })
      .strict(),
    webhook: connectorWebhookSchema.nullable(),
    pull: connectorPullSchema.nullable(),
    settings: connectorSettingsSchema,
    containerLabels: z.array(containerLabelNameSchema).readonly().optional(),
    instances: z.literal('many').optional(),
    resourceScope: z.object({ unit: resourceScopeUnitSchema }).strict().optional(),
    identity: connectorIdentitySchema.optional(),
  })
  .strict()
  .superRefine((manifest, ctx) => {
    const identity = manifest.identity;
    if (!identity) return;
    const lookupHost = new URL(identity.lookup.url).hostname;
    if (!manifest.egress.apiHosts.includes(lookupHost)) {
      ctx.addIssue({
        code: 'custom',
        path: ['identity', 'lookup', 'url'],
        message: 'host not in egress.apiHosts',
      });
    }
    if (
      identity.revoke &&
      !manifest.egress.apiHosts.includes(new URL(identity.revoke.url).hostname)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['identity', 'revoke', 'url'],
        message: 'host not in egress.apiHosts',
      });
    }
    if (identity.clientIdEnv !== undefined && identity.fallbackToSource) {
      ctx.addIssue({
        code: 'custom',
        path: ['identity', 'clientIdEnv'],
        message: 'a source-app identity flow has no client of its own',
      });
    }
    const hasClient = identity.clientIdEnv !== undefined || identity.fallbackToSource;
    if (!hasClient || (identity.fallbackToSource && manifest.auth?.type !== 'oauth2')) {
      ctx.addIssue({
        code: 'custom',
        path: ['identity', 'fallbackToSource'],
        message: 'no OAuth client to use',
      });
    }
  })
  .superRefine((manifest, ctx) => {
    const webhook = manifest.webhook;
    if (!webhook || !isDeclarativeWebhook(webhook)) return;
    if (selectsSignatureHeader(webhook)) {
      ctx.addIssue({
        code: 'custom',
        path: ['webhook'],
        message: 'a selector names the signature header',
      });
    }
    if ((CODE_ROUTED_WEBHOOK_KINDS as readonly string[]).includes(manifest.kind)) return;
    if (webhook.routing === 'url' && webhook.tenantKey === null && webhook.handshake === null) {
      return;
    }
    ctx.addIssue({
      code: 'custom',
      path: ['webhook'],
      message: 'a declarative webhook is URL-routed with no tenant key and no handshake',
    });
  })
  .refine((m) => (m.resourceScope !== undefined) === (m.settings === 'resource_scope'), {
    message: 'resourceScope is declared if and only if settings is resource_scope',
    path: ['resourceScope'],
  })
  .refine(
    (m) =>
      m.settings !== 'resource_scope' || (m.audience === 'org' && m.emitsFacts && m.pull !== null),
    {
      message: 'resource_scope needs an org kind that emits facts and pulls',
      path: ['settings'],
    },
  );

export type ConnectorManifest = z.infer<typeof connectorManifestSchema>;
