// SPDX-License-Identifier: Apache-2.0
import { isErrorReport } from '@folklore/errors';
import type { ServerTelemetryEventName } from './events.js';

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
  'z-ai/glm-5.2',
  'qwen/qwen3-32b',
  'qwen/qwen3-embedding-8b',
  'nomic-embed-text',
  'qwen2.5:7b',
]);
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
  'source.routing_conflict': propertyContract({
    ...orgId,
    sourceKind,
    rejectedBy: literal(
      'postgres_upsert',
      'postgres_upsert_failed',
      'routing_reconciliation_failed',
    ),
  }),
  'member.invited': propertyContract({
    ...orgId,
    role: literal('admin', 'member'),
    count,
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
    themeId: uuid,
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
  'wiki.synthesized': propertyContract({ ...orgId, themeId: uuid }),
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
  'error.captured': isErrorReport,
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
