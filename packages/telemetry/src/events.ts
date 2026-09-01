// SPDX-License-Identifier: Apache-2.0
import type { ErrorReport } from '@folklore/errors';

export const TelemetryEvent = {
  OrgCreated: 'org.created',
  OrgRecoveryKeySet: 'org.recovery_key_set',
  CoProcessingConsentRecorded: 'co_processing_consent.recorded',
  MarketingOptInRecordFailed: 'marketing_opt_in.record_failed',
  SourceConnected: 'source.connected',
  SourceRoutingConflict: 'source.routing_conflict',
  MemberInvited: 'member.invited',
  BetaInviteCreated: 'beta_invite.created',
  BetaInviteAccepted: 'beta_invite.accepted',
  DirectoryImported: 'directory.imported',
  SubscriptionCreated: 'subscription.created',
  SubscriptionStatusChanged: 'subscription.status_changed',
  SubscriptionSeatsChanged: 'subscription.seats_changed',
  WikiViewed: 'wiki.viewed',
  ReviewActioned: 'review.actioned',
  ReviewSnippetsDegraded: 'review.snippets_degraded',
  FactIngested: 'fact.ingested',
  FactScored: 'fact.scored',
  FactPromoted: 'fact.promoted',
  AssociationDrainRun: 'association.drain.run',
  ThemeResolved: 'theme.resolved',
  ThemeInference: 'theme.inference',
  ThemeGraphEdgeFailed: 'theme.graph_edge_failed',
  ThemeMerged: 'theme.merged',
  ThemeMergeReviewed: 'theme.merge_reviewed',
  ThemeMergeGraphFailed: 'theme.merge_graph_failed',
  ThemeMergeReconcileFailed: 'theme.merge_reconcile_failed',
  ThemeMergeReconcileUnresolved: 'theme.merge_reconcile_unresolved',
  InferenceEmbed: 'inference.embed',
  InferenceGenerate: 'inference.generate',
  InferenceReceiptVerified: 'inference.receipt_verified',
  InferenceModelRejected: 'inference.model_rejected',
  InferenceAttestationFailed: 'inference.attestation_failed',
  InferenceError: 'inference.error',
  InferenceReceiptVerificationStagedOff: 'inference.receipt_verification_staged_off',
  WikiSynthesized: 'wiki.synthesized',
  WikiRichBlocksSynthesized: 'wiki.rich_blocks.synthesized',
  WikiCritiqueCompleted: 'wiki.critique.completed',
  WikiLinkPreview: 'wiki.link_preview',
  NotificationSent: 'notification.sent',
  NotificationSendFailed: 'notification.send_failed',
  WorkerError: 'worker.error',
  DeploymentCheckin: 'deployment.checkin',
  OrgUsage: 'org.usage',
  TenantDataDeleted: 'tenant.data_deleted',
  ErrorCaptured: 'error.captured',
} as const;

/** Actor-visible lifecycle: org → sources → members → directory → billing → reading. */
type ProductEvents = {
  'org.created': {
    orgId: string;
    plan: string;
    region?: string;
    tier?: string;
    processingTier?: string;
  };
  'org.recovery_key_set': { orgId: string; rotated: boolean };
  'co_processing_consent.recorded': { orgId: string; tier: string; disclosureVersion: string };
  'source.connected': { orgId: string; sourceKind: string; hasRefreshToken: boolean };
  'member.invited': { orgId: string; role: string; count: number };
  'beta_invite.created': Record<string, never>;
  'beta_invite.accepted': { betaInviteId: string };
  'directory.imported': {
    orgId: string;
    provider: string;
    peopleCount: number;
    groupCount: number;
  };
  'subscription.created': { orgId: string; status: string };
  'subscription.status_changed': { orgId: string; status: string };
  'subscription.seats_changed': { orgId: string; seats: number };
  'wiki.viewed': { orgId: string; themeId: string; audience: string; blockCount: number };
  'review.actioned': { orgId: string; action: 'assign' | 'remove' };
  'theme.merge_reviewed': { orgId: string; action: 'approve' | 'reject' };
};

/** Pipeline stage durations, throughput, and fleet check-in vitals — no content. */
type OpsEvents = {
  'fact.ingested': { orgId: string; sourceKind: string };
  'fact.scored': {
    orgId: string;
    confidence: 'high' | 'medium' | 'low' | 'override';
    hnswExpanded: boolean;
  };
  'fact.promoted': { orgId: string; containerId: string };
  'association.drain.run': { count: number; durationMs: number };
  'theme.resolved': { orgId: string; fallback: boolean };
  'theme.inference': { orgId: string; fallback: boolean };
  'theme.merged': { orgId: string; trigger: 'auto' | 'approved' };
  'inference.embed': { model: string; latencyMs: number };
  'inference.generate': {
    model: string;
    latencyMs: number;
    inputTokens?: number;
    outputTokens?: number;
  };
  'inference.receipt_verified': { sessionId: string };
  'wiki.synthesized': { orgId: string; themeId: string };
  'wiki.rich_blocks.synthesized': {
    orgId: string;
    themeId: string;
    diagramSeen: number;
    diagramEmitted: number;
    diagramDropped: number;
    graphSeen: number;
    graphEmitted: number;
    graphDropped: number;
    graphRepaired: number;
    chartSeen: number;
    chartEmitted: number;
    chartDropped: number;
    chartRepaired: number;
    codeSeen: number;
    codeEmitted: number;
    codeDropped: number;
    embedSeen: number;
    embedEmitted: number;
    embedDropped: number;
    canvasSeen: number;
    canvasEmitted: number;
    canvasDropped: number;
  };
  // `failed` = the gate did not run, so the page published unreviewed; `revision_failed` = it found
  // defects the repair pass never fixed. Exactly one of themeId/teamId is set (per-theme vs team page).
  'wiki.critique.completed': {
    orgId: string;
    themeId?: string;
    teamId?: string;
    outcome: 'issues_found' | 'revision_failed' | 'clean' | 'failed';
    // Faithfulness defects only; a missing diagram counts under visualIssueCount, never here.
    issueCount: number;
    visualIssueCount: number;
    // The visual-coverage pass's own verdict, on its own axis: a down warrant judge shows up here
    // rather than restating `outcome`. `skipped` = the faithfulness gate did not complete.
    coverageOutcome: 'clean' | 'blocks_added' | 'failed' | 'skipped';
  };
  'wiki.link_preview': { orgId: string; outcome: 'preview' | 'empty'; latencyMs: number };
  'notification.sent': { orgId: string; channel: 'email' | 'slack' };
  'deployment.checkin': {
    deploymentId: string;
    seatCount: number;
    queueDepth: number;
    linkedAccountCount: number;
  };
  'tenant.data_deleted': {
    deploymentId: string;
    orgId: string;
    objectsDeleted: number;
    kmsShredScheduled: boolean;
  };
  'org.usage': {
    deploymentId: string;
    orgId: string;
    factCount: number;
    internalIdentityCount: number;
    hnswElements: number;
    themeCount: number;
    resynthesizedRecent: number;
    factsRecent: number;
    activeSourceCount: number;
  };
};

/** Content-free error taxonomy — a triage trail keyed by kind + component. */
type ErrorEvents = {
  'theme.graph_edge_failed': { orgId: string; kind: string };
  'theme.merge_graph_failed': { orgId: string };
  'theme.merge_reconcile_failed': { orgId: string };
  'theme.merge_reconcile_unresolved': { orgId: string };
  'inference.model_rejected': { model: string };
  'inference.attestation_failed': { reason: string };
  'inference.error': { model: string; errorType: string };
  // Content-free: a boot-time marker that this deployment runs inference with receipt verification
  // staged off (commissioning). `mode` is a fixed enum, never customer content.
  'inference.receipt_verification_staged_off': { mode: 'commissioning' | 'non_production' };
  'notification.send_failed': { orgId: string; channel: 'email' | 'slack'; errorType: string };
  // A volunteered marketing opt-in couldn't be recorded after the org committed. Content-free, so the
  // fail-safe swallow (org creation still succeeds) stays observable without an error-kind string.
  'marketing_opt_in.record_failed': Record<string, never>;
  // Review queue's snippet seam threw a non-AppError; rows rendered snippet-less (never a 500).
  'review.snippets_degraded': { orgId: string };
  'worker.error': { component: string; errorType: string; orgId?: string };
  // The PostgreSQL owner and routing entry failed to converge. Never send the external ID.
  'source.routing_conflict': {
    orgId: string;
    sourceKind: string;
    rejectedBy: 'postgres_upsert' | 'postgres_upsert_failed' | 'routing_reconciliation_failed';
  };
  'error.captured': ErrorReport;
};

export const BrowserTelemetryEvent = {
  SourceConnectStarted: 'source.connect_started',
  SourceConnectFailed: 'source.connect_failed',
  SignInCompleted: 'sign_in_completed',
  ClientError: 'client_error',
} as const;

export type BrowserSourceKind =
  | 'github'
  | 'code'
  | 'slack'
  | 'linear'
  | 'notion'
  | 'jira'
  | 'intercom'
  | 'confluence'
  | 'google_drive'
  | 'gmail'
  | 'microsoft365'
  | 'microsoft365_mail'
  | 'google_calendar'
  | 'microsoft365_calendar';

type BrowserSourceConnectFailure =
  | 'cancelled'
  | 'failed'
  | 'network'
  | 'provider'
  | 'unauthorized'
  | 'unsupported';

type BrowserClientErrorOrigin = 'error_boundary' | 'window_error' | 'unhandled_rejection';

type BrowserEvents = {
  'source.connect_started': { eventSchemaVersion: 1; sourceKind: BrowserSourceKind };
  'source.connect_failed': {
    eventSchemaVersion: 1;
    sourceKind: BrowserSourceKind;
    reason: BrowserSourceConnectFailure;
  };
  sign_in_completed: Record<string, never>;
  client_error: { origin: BrowserClientErrorOrigin; errorName: string };
};

export type TelemetryEventMap = ProductEvents & OpsEvents & ErrorEvents & BrowserEvents;

export type TelemetryEventName = keyof TelemetryEventMap;

export type ServerTelemetryEventName = (typeof TelemetryEvent)[keyof typeof TelemetryEvent];

export type BrowserTelemetryEventName = keyof BrowserEvents;

const SERVER_TELEMETRY_EVENTS = new Set<string>(Object.values(TelemetryEvent));

export function isServerTelemetryEvent(value: unknown): value is ServerTelemetryEventName {
  return typeof value === 'string' && SERVER_TELEMETRY_EVENTS.has(value);
}

const BROWSER_SOURCE_KINDS = new Set<BrowserSourceKind>([
  'github',
  'code',
  'slack',
  'linear',
  'notion',
  'jira',
  'intercom',
  'confluence',
  'google_drive',
  'gmail',
  'microsoft365',
  'microsoft365_mail',
  'google_calendar',
  'microsoft365_calendar',
]);

const BROWSER_SOURCE_CONNECT_FAILURES = new Set<BrowserSourceConnectFailure>([
  'cancelled',
  'failed',
  'network',
  'provider',
  'unauthorized',
  'unsupported',
]);

const BROWSER_CLIENT_ERROR_ORIGINS = new Set<BrowserClientErrorOrigin>([
  'error_boundary',
  'window_error',
  'unhandled_rejection',
]);

const BROWSER_EVENT_PROPERTY_KEYS: Record<BrowserTelemetryEventName, readonly string[]> = {
  'source.connect_started': ['eventSchemaVersion', 'sourceKind'],
  'source.connect_failed': ['eventSchemaVersion', 'sourceKind', 'reason'],
  sign_in_completed: [],
  client_error: ['origin', 'errorName'],
};

export function isBrowserTelemetryEvent(event: string): event is BrowserTelemetryEventName {
  return Object.prototype.hasOwnProperty.call(BROWSER_EVENT_PROPERTY_KEYS, event);
}

export function isBrowserSourceKind(value: string): value is BrowserSourceKind {
  return BROWSER_SOURCE_KINDS.has(value as BrowserSourceKind);
}

export function browserTelemetryPropertyKeys(event: BrowserTelemetryEventName): readonly string[] {
  return BROWSER_EVENT_PROPERTY_KEYS[event];
}

export function isBrowserTelemetryProperty(
  event: BrowserTelemetryEventName,
  key: string,
  value: unknown,
): boolean {
  if (key === 'eventSchemaVersion') return value === 1;
  if (key === 'sourceKind') {
    return typeof value === 'string' && BROWSER_SOURCE_KINDS.has(value as BrowserSourceKind);
  }
  if (key === 'origin') {
    return (
      event === BrowserTelemetryEvent.ClientError &&
      typeof value === 'string' &&
      BROWSER_CLIENT_ERROR_ORIGINS.has(value as BrowserClientErrorOrigin)
    );
  }
  if (key === 'errorName') {
    return (
      event === BrowserTelemetryEvent.ClientError &&
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 64 &&
      /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(value)
    );
  }
  return (
    event === BrowserTelemetryEvent.SourceConnectFailed &&
    key === 'reason' &&
    typeof value === 'string' &&
    BROWSER_SOURCE_CONNECT_FAILURES.has(value as BrowserSourceConnectFailure)
  );
}

export function areBrowserTelemetryPropertiesValid(
  event: BrowserTelemetryEventName,
  properties: Record<string, unknown>,
): boolean {
  if (!isBrowserTelemetryEvent(event)) return false;
  const allowedKeys = browserTelemetryPropertyKeys(event);
  return (
    Object.keys(properties).length === allowedKeys.length &&
    allowedKeys.every(
      (key) => key in properties && isBrowserTelemetryProperty(event, key, properties[key]),
    )
  );
}
