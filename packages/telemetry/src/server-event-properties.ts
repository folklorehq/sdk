// SPDX-License-Identifier: Apache-2.0
import {
  DURATION_BUCKETS,
  REQUEST_METHODS,
  isHttpStatus,
  isRouteTemplateShape,
} from '@folklore/core';
import { isErrorReport } from '@folklore/errors';
import {
  AGENT_ACCESS_TELEMETRY_AGENTS,
  AGENT_ACCESS_TELEMETRY_ASSURANCES,
  AGENT_ACCESS_TELEMETRY_CONFIG_CODES,
  AGENT_ACCESS_TELEMETRY_MODES,
  AGENT_ACCESS_TELEMETRY_OAUTH_ERRORS,
  AGENT_ACCESS_TELEMETRY_REFUSALS,
  AGENT_ACCESS_TELEMETRY_REVOCATIONS,
  AGENT_ACCESS_TELEMETRY_SENSITIVITIES,
  AGENT_ACCESS_TELEMETRY_WRITE_DENIALS,
  BROWSER_CLIENT_ERROR_ORIGINS,
  BROWSER_SOURCE_CONNECT_FAILURES,
  CLIENT_ERROR_NAMES,
  ONBOARDING_STEPS,
  ROUTE_VIEW_SURFACES,
  isBrowserSourceKind,
  type ServerTelemetryEventName,
} from './events.js';

type PropertyValidator = (value: unknown) => boolean;
type EventPropertiesValidator = (properties: Record<string, unknown>) => boolean;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// ACI's non-UUID fixture form has a fixed prefix and digits only, so it cannot encode prose.
const ACI_SESSION_ID_PATTERN = /^sess-[0-9]{1,20}$/;
const SOURCE_KINDS = new Set([
  'github',
  'code',
  'slack',
  'linear',
  'notion',
  'intercom',
  'jira',
  'zoom',
  'meeting',
  'confluence',
  'google_drive',
  'microsoft365',
  'email',
  'gmail',
  'microsoft365_mail',
  'google_calendar',
  'microsoft365_calendar',
  'figma',
  'clickup',
  'msteams',
  'sharepoint',
  'azure_devops',
]);
const INFERENCE_MODELS = new Set([
  'moonshotai/kimi-k3',
  'moonshotai/kimi-k2.6',
  'z-ai/glm-5.3',
  'z-ai/glm-5.2',
  'z-ai/glm-5.1',
  'qwen/qwen3-32b',
  'qwen/qwen3-embedding-8b',
  'nomic-embed-text',
  'qwen2.5:7b',
]);
const BROWSER_PAGE_PATTERN = /^(?:\/[a-z]{0,30}|not_found)$/;
const BROWSER_CTA_PATTERN = /^[a-z][a-z_]{0,39}$/;
const REJECTED_MODELS = new Set([
  'deepseek-v4-pro',
  'moonshot/kimi-k3',
  'qwen/qwen3-14b',
  'qwen/qwen3-max',
]);
const ERROR_REPORT_TYPES = new Set([
  'validation_error',
  'not_found',
  'forbidden',
  'conflict',
  'rate_limit',
  'external_service_error',
  'service_unavailable',
  'encryption_context_mismatch',
  'configuration_error',
  'internal_error',
]);
const ATTESTATION_REASONS = new Set([
  'response carried no receipt id',
  'receipt workload_id does not match pinned attestation',
  'receipt keyset digest does not match pinned attestation',
  'receipt has no upstream.verified event',
  'upstream verification was not required',
  'verified upstream event carried no session id',
  'receipt is unsigned',
  'receipt signature did not match any attested signing key',
  'attestation fetch failed',
  'receipt fetch failed',
  'attestation response had an unexpected shape',
  'receipt response had an unexpected shape',
]);
// Only a fixed fetch label plus a three-digit HTTP status may vary, so the value cannot carry prose.
const ATTESTATION_HTTP_REASON_PATTERN = /^(?:attestation|receipt) fetch returned [1-5][0-9]{2}$/;
const UPSTREAM_RESULT_REASONS = new Set([
  'upstream not verified (result=failed)',
  'upstream not verified (result=unverified)',
  'upstream not verified (result=rejected)',
  'upstream not verified (result=error)',
  'upstream not verified (result=unknown)',
  'upstream not verified (result=undefined)',
  'upstream not verified (result=null)',
]);

const uuid: PropertyValidator = (value) => typeof value === 'string' && UUID_PATTERN.test(value);
const sessionId: PropertyValidator = (value) =>
  typeof value === 'string' && (UUID_PATTERN.test(value) || ACI_SESSION_ID_PATTERN.test(value));
const bool: PropertyValidator = (value) => typeof value === 'boolean';
const count: PropertyValidator = (value) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const oneOf =
  (values: ReadonlySet<string>): PropertyValidator =>
  (value) =>
    typeof value === 'string' && values.has(value);
const literal = (...values: readonly string[]): PropertyValidator => oneOf(new Set(values));
const matches =
  (pattern: RegExp): PropertyValidator =>
  (value) =>
    typeof value === 'string' && pattern.test(value);
const schemaVersion1: PropertyValidator = (value) => value === 1;
const httpStatus: PropertyValidator = isHttpStatus;
const browserSourceKind: PropertyValidator = (value) =>
  typeof value === 'string' && isBrowserSourceKind(value);
const sourceKind = oneOf(SOURCE_KINDS);
const model = oneOf(INFERENCE_MODELS);
const rejectedModel = oneOf(REJECTED_MODELS);

function propertyContract(
  required: Readonly<Record<string, PropertyValidator>>,
  optional: Readonly<Record<string, PropertyValidator>> = {},
): EventPropertiesValidator {
  const allowed = new Set([...Object.keys(required), ...Object.keys(optional)]);
  return (properties) => {
    const keys = Object.keys(properties);
    return (
      keys.every((key) => allowed.has(key)) &&
      Object.entries(required).every(
        ([key, validate]) => key in properties && validate(properties[key]),
      ) &&
      Object.entries(optional).every(
        ([key, validate]) => !(key in properties) || validate(properties[key]),
      )
    );
  };
}

const orgId = { orgId: uuid };
const orgOnly = propertyContract(orgId);
const richBlockCountFields = {
  diagramSeen: count,
  diagramEmitted: count,
  diagramDropped: count,
  graphSeen: count,
  graphEmitted: count,
  graphDropped: count,
  graphRepaired: count,
  chartSeen: count,
  chartEmitted: count,
  chartDropped: count,
  chartRepaired: count,
  codeSeen: count,
  codeEmitted: count,
  codeDropped: count,
  embedSeen: count,
  embedEmitted: count,
  embedDropped: count,
  canvasSeen: count,
  canvasEmitted: count,
  canvasDropped: count,
};

const synthesizedContract = propertyContract({
  ...orgId,
  themeId: uuid,
  audiences: count,
  withdrawnAudiences: count,
});

const SERVER_TELEMETRY_PROPERTY_VALIDATORS = {
  'org.created': propertyContract(
    { orgId: uuid, plan: literal('trial', 'beta', 'growth', 'business', 'enterprise') },
    {
      region: literal('us-east-1'),
      tier: literal('dev', 'staging', 'startup', 'growth', 'enterprise', 'shared', 'dedicated'),
      processingTier: literal('shared', 'dedicated'),
    },
  ),
  'org.recovery_key_set': propertyContract({ ...orgId, rotated: bool }),
  'co_processing_consent.recorded': propertyContract({
    ...orgId,
    tier: literal('shared'),
    disclosureVersion: literal('2026-07-13'),
  }),
  'marketing_opt_in.record_failed': propertyContract({}),
  'source.connected': propertyContract({ ...orgId, sourceKind, hasRefreshToken: bool }),
  'source.scope_changed': propertyContract({
    ...orgId,
    sourceKind,
    mode: literal('all', 'selected'),
    addedCount: count,
    removedCount: count,
  }),
  'source.scope_change_failed': propertyContract({
    ...orgId,
    sourceKind,
    reason: literal('conflict', 'invalid', 'unavailable'),
  }),
  'source.sync_paused': propertyContract({ ...orgId, sourceKind }),
  'source.sync_resumed': propertyContract({ ...orgId, sourceKind }),
  'source.sync_pause_failed': propertyContract({
    ...orgId,
    sourceKind,
    reason: literal('conflict', 'unavailable'),
  }),
  'source.routing_conflict': propertyContract({
    ...orgId,
    sourceKind,
    rejectedBy: literal(
      'postgres_upsert',
      'postgres_upsert_failed',
      'routing_reconciliation_failed',
    ),
  }),
  'agent_access.policy_changed': propertyContract({
    ...orgId,
    mode: literal(...AGENT_ACCESS_TELEMETRY_MODES),
    maxSensitivity: literal(...AGENT_ACCESS_TELEMETRY_SENSITIVITIES),
    allowedAgentCount: count,
    widening: bool,
  }),
  'agent_access.policy_write_refused': propertyContract({
    ...orgId,
    reason: literal(...AGENT_ACCESS_TELEMETRY_WRITE_DENIALS),
  }),
  'agent_access.config_invalid': propertyContract({
    code: literal(...AGENT_ACCESS_TELEMETRY_CONFIG_CODES),
  }),
  'agent_access.consent_decided': propertyContract({
    ...orgId,
    agent: literal(...AGENT_ACCESS_TELEMETRY_AGENTS),
    decision: literal('allow', 'deny'),
    redirectAssurance: literal(...AGENT_ACCESS_TELEMETRY_ASSURANCES),
  }),
  'agent_access.authorization_refused': propertyContract({
    reason: literal(...AGENT_ACCESS_TELEMETRY_REFUSALS),
    phase: literal('consent', 'token'),
  }),
  'agent_access.connection_created': propertyContract({
    ...orgId,
    agent: literal(...AGENT_ACCESS_TELEMETRY_AGENTS),
    scopeCount: count,
  }),
  'agent_access.token_issued': propertyContract({
    ...orgId,
    agent: literal(...AGENT_ACCESS_TELEMETRY_AGENTS),
    grantType: literal('authorization_code', 'refresh_token'),
  }),
  'agent_access.connections_revoked': propertyContract({
    ...orgId,
    reason: literal(...AGENT_ACCESS_TELEMETRY_REVOCATIONS),
    count,
  }),
  'agent_access.oauth_error': propertyContract({
    phase: literal('authorization', 'token', 'revocation', 'server'),
    errorCode: literal(...AGENT_ACCESS_TELEMETRY_OAUTH_ERRORS),
  }),
  'agent_access.sweep_run': propertyContract({
    outcome: literal('completed', 'failed'),
    deleted: count,
    reconciled: count,
    destroyed: count,
    durationMs: count,
  }),
  'member.invited': propertyContract({
    ...orgId,
    role: literal('admin', 'member', 'custom'),
    count,
  }),
  'member.invites_revoked': propertyContract({
    ...orgId,
    count,
    cause: literal(
      'member_suspended',
      'invite_permission_removed',
      'inviter_no_longer_permitted',
      'inviter_cannot_readmit',
    ),
  }),
  'beta_invite.created': propertyContract({}),
  'beta_invite.accepted': propertyContract({ betaInviteId: uuid }),
  'directory.imported': propertyContract({
    ...orgId,
    provider: literal('merge'),
    peopleCount: count,
    groupCount: count,
  }),
  'subscription.created': propertyContract({
    ...orgId,
    status: literal('trialing', 'active', 'past_due', 'canceled', 'suspended'),
  }),
  'subscription.status_changed': propertyContract({
    ...orgId,
    status: literal('trialing', 'active', 'past_due', 'canceled', 'suspended'),
  }),
  'subscription.seats_changed': propertyContract({ ...orgId, seats: count }),
  'wiki.viewed': propertyContract({
    ...orgId,
    audience: (value) => value === 'all-members' || uuid(value),
    blockCount: count,
  }),
  'review.actioned': propertyContract({ ...orgId, action: literal('assign', 'remove') }),
  'review.snippets_degraded': orgOnly,
  'fact.ingested': propertyContract({ ...orgId, sourceKind }),
  'fact.scored': propertyContract({
    ...orgId,
    confidence: literal('high', 'medium', 'low', 'override'),
    hnswExpanded: bool,
  }),
  'fact.promoted': propertyContract({ ...orgId, containerId: uuid }),
  'association.drain.run': propertyContract({ count, durationMs: count }),
  'association.judged': propertyContract({
    ...orgId,
    assigned: count,
    removed: count,
    recorded: count,
  }),
  'theme.resolved': propertyContract({ ...orgId, fallback: bool }),
  'theme.inference': propertyContract({ ...orgId, fallback: bool }),
  'theme.graph_edge_failed': propertyContract({
    ...orgId,
    kind: literal(
      'container_grouping',
      'fact_theme',
      'theme_related',
      'aggregate_node',
      'theme_parent',
    ),
  }),
  'theme.merged': propertyContract({ ...orgId, trigger: literal('auto', 'approved') }),
  'theme.merge_reviewed': propertyContract({
    ...orgId,
    action: literal('approve', 'reject'),
  }),
  'theme.merge_graph_failed': orgOnly,
  'theme.merge_reconcile_failed': orgOnly,
  'theme.merge_reconcile_unresolved': orgOnly,
  'inference.embed': propertyContract({ model, latencyMs: count }),
  'inference.generate': propertyContract(
    { model, latencyMs: count },
    { inputTokens: count, outputTokens: count },
  ),
  'inference.receipt_verified': propertyContract({ sessionId }),
  'enclave.event_loop_delay': propertyContract({
    loopDelayP50Ms: count,
    loopDelayP99Ms: count,
    loopDelayMaxMs: count,
    loopSamples: count,
    seconds: count,
  }),
  'inference.model_rejected': propertyContract({ model: rejectedModel }),
  'inference.attestation_failed': propertyContract({
    reason: (value) =>
      typeof value === 'string' &&
      (ATTESTATION_REASONS.has(value) ||
        UPSTREAM_RESULT_REASONS.has(value) ||
        ATTESTATION_HTTP_REASON_PATTERN.test(value)),
  }),
  'inference.error': propertyContract({
    model,
    errorType: literal('embed_failed', 'generate_failed', 'structured_failed'),
  }),
  'inference.receipt_verification_staged_off': propertyContract({
    mode: literal('commissioning', 'non_production'),
  }),
  'wiki.synthesized': (properties) =>
    synthesizedContract(properties) &&
    (properties.withdrawnAudiences as number) <= (properties.audiences as number),
  'wiki.first_page.ready': propertyContract({ ...orgId, secondsSinceFirstPull: count }),
  'wiki.rich_blocks.synthesized': propertyContract({
    ...orgId,
    themeId: uuid,
    ...richBlockCountFields,
  }),
  'wiki.critique.completed': (properties) => {
    const base = propertyContract(
      {
        ...orgId,
        outcome: literal('issues_found', 'revision_failed', 'clean', 'failed'),
        issueCount: count,
        visualIssueCount: count,
        coverageOutcome: literal('clean', 'blocks_added', 'failed', 'skipped'),
      },
      { themeId: uuid, teamId: uuid },
    );
    return base(properties) && 'themeId' in properties !== 'teamId' in properties;
  },
  'wiki.link_preview': propertyContract({
    ...orgId,
    outcome: literal('preview', 'empty'),
    latencyMs: count,
  }),
  'notification.sent': propertyContract({ ...orgId, channel: literal('email', 'slack') }),
  'notification.send_failed': propertyContract({
    ...orgId,
    channel: literal('email', 'slack'),
    errorType: literal('timeout', 'provider_error', 'network_error', 'unknown'),
  }),
  'worker.error': propertyContract(
    {
      component: literal('agent', 'api', 'control-plane-server', 'http', 'unknown', 'worker'),
      errorType: oneOf(ERROR_REPORT_TYPES),
    },
    { orgId: uuid },
  ),
  'deployment.checkin': propertyContract({
    deploymentId: uuid,
    seatCount: count,
    queueDepth: count,
    linkedAccountCount: count,
  }),
  'org.usage': propertyContract({
    deploymentId: uuid,
    ...orgId,
    factCount: count,
    internalIdentityCount: count,
    hnswElements: count,
    themeCount: count,
    resynthesizedRecent: count,
    factsRecent: count,
    activeSourceCount: count,
  }),
  'tenant.data_deleted': propertyContract({
    deploymentId: uuid,
    ...orgId,
    objectsDeleted: count,
    kmsShredScheduled: bool,
  }),
  'workspace.deleted': propertyContract({ ...orgId, deploymentsDeleted: count }),
  'account.deleted': propertyContract({
    accountId: uuid,
    workspacesDeleted: count,
    platformTenantsRetained: count,
    tombstoned: bool,
  }),
  'error.captured': isErrorReport,
  'api.request': propertyContract({
    method: literal(...REQUEST_METHODS),
    routeTemplate: isRouteTemplateShape,
    statusCode: httpStatus,
    durationBucket: literal(...DURATION_BUCKETS),
  }),
  'source.connect_started': propertyContract({
    eventSchemaVersion: schemaVersion1,
    sourceKind: browserSourceKind,
  }),
  'source.connect_failed': propertyContract({
    eventSchemaVersion: schemaVersion1,
    sourceKind: browserSourceKind,
    reason: oneOf(BROWSER_SOURCE_CONNECT_FAILURES),
  }),
  'source.settings_viewed': propertyContract({
    eventSchemaVersion: schemaVersion1,
    sourceKind: browserSourceKind,
  }),
  sign_in_completed: propertyContract({}),
  client_error: propertyContract({
    origin: oneOf(BROWSER_CLIENT_ERROR_ORIGINS),
    errorName: literal(...CLIENT_ERROR_NAMES),
  }),
  page_viewed: propertyContract({
    eventSchemaVersion: schemaVersion1,
    page: matches(BROWSER_PAGE_PATTERN),
  }),
  cta_clicked: propertyContract({
    eventSchemaVersion: schemaVersion1,
    cta: matches(BROWSER_CTA_PATTERN),
    page: matches(BROWSER_PAGE_PATTERN),
  }),
  route_viewed: propertyContract({
    eventSchemaVersion: schemaVersion1,
    surface: literal(...ROUTE_VIEW_SURFACES),
    routeTemplate: isRouteTemplateShape,
  }),
  onboarding_step_viewed: propertyContract({
    eventSchemaVersion: schemaVersion1,
    step: literal(...ONBOARDING_STEPS),
  }),
} satisfies Record<ServerTelemetryEventName, EventPropertiesValidator>;

export function areServerTelemetryPropertiesValid(
  event: ServerTelemetryEventName,
  properties: Record<string, unknown>,
): boolean {
  try {
    return SERVER_TELEMETRY_PROPERTY_VALIDATORS[event](properties);
  } catch {
    return false;
  }
}
