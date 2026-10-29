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

const httpsHostUrlSchema = z
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

export const webhookSignatureSchema = z.enum([
  'github',
  'slack',
  'linear',
  'intercom',
  'jira',
  'confluence',
  'notion',
  'meeting',
  'svix',
  'google_channel_token',
  'graph_client_state',
  'zoom',
  'ses_sns',
]);

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
    signature: webhookSignatureSchema,
    tenantKey: webhookTenantKeySchema.nullable(),
  })
  .strict();

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

// Framing headers are classified by the custom-definition checker, so they stay out of this shared set and are refused separately for identity lookups.
export const FORBIDDEN_HEADER =
  /^(?:authorization|proxy-[a-z-]*|cookie|host|x-forwarded-[a-z-]*|forwarded|x-real-ip|expect)$/i;

export const headerNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9-]{1,64}$/)
  .refine((name) => !FORBIDDEN_HEADER.test(name), 'header is owned by the runtime');

export const jsonPointerSchema = z.string().regex(/^(\/[^/~]*(~[01][^/~]*)*)*$/);

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
