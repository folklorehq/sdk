// SPDX-License-Identifier: Apache-2.0
import { z } from 'zod';

export const CONNECTOR_MANIFEST_VERSION = 1;

export const connectorReleaseSchema = z.enum(['beta', 'dark', 'retired', 'planned']);
export const connectorAudienceSchema = z.enum(['org', 'member']);

// A DNS name with an alphabetic TLD: IP literals are refused.
export const hostSchema = z.string().regex(/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/);
export const suffixSchema = z.string().regex(/^(?:\.[a-z0-9-]+)+\.[a-z]{2,}$/);
const httpsUrlSchema = z.string().url().startsWith('https://');
const envNameSchema = z.string().regex(/^[A-Z][A-Z0-9_]*$/);
const kindNameSchema = z.string().regex(/^[a-z][a-z0-9_]{1,31}$/);

export const enclaveRedeemSchema = z
  .object({
    tokenEndpoint: httpsUrlSchema,
    identityEndpoint: httpsUrlSchema,
    refreshRequired: z.boolean(),
  })
  .strict();

export const connectorAuthSchema = z.discriminatedUnion('type', [
  z
    .object({
      type: z.literal('oauth2'),
      authUrl: httpsUrlSchema,
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
  })
  .strict();

export type ConnectorManifest = z.infer<typeof connectorManifestSchema>;
