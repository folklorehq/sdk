// SPDX-License-Identifier: Apache-2.0
import { UNMATCHED_ROUTE_TEMPLATE, type DurationBucket, type RequestMethod } from '@folklore/core';
import type { ErrorReport } from '@folklore/errors';

export const TelemetryEvent = {
  OrgCreated: 'org.created',
  WorkspaceDeleted: 'workspace.deleted',
  AccountDeleted: 'account.deleted',
  OrgRecoveryKeySet: 'org.recovery_key_set',
  CoProcessingConsentRecorded: 'co_processing_consent.recorded',
  MarketingOptInRecordFailed: 'marketing_opt_in.record_failed',
  SourceConnected: 'source.connected',
  SourceRoutingConflict: 'source.routing_conflict',
  MemberInvited: 'member.invited',
  MemberInvitesRevoked: 'member.invites_revoked',
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
  AssociationJudged: 'association.judged',
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
  WikiFirstPageReady: 'wiki.first_page.ready',
  WikiRichBlocksSynthesized: 'wiki.rich_blocks.synthesized',
  WikiCritiqueCompleted: 'wiki.critique.completed',
  WikiLinkPreview: 'wiki.link_preview',
  NotificationSent: 'notification.sent',
  NotificationSendFailed: 'notification.send_failed',
  WorkerError: 'worker.error',
  DeploymentCheckin: 'deployment.checkin',
  EnclaveEventLoopDelay: 'enclave.event_loop_delay',
  OrgUsage: 'org.usage',
  TenantDataDeleted: 'tenant.data_deleted',
  ErrorCaptured: 'error.captured',
  ApiRequest: 'api.request',
  AgentAccessPolicyChanged: 'agent_access.policy_changed',
  AgentAccessPolicyWriteRefused: 'agent_access.policy_write_refused',
  AgentAccessConfigInvalid: 'agent_access.config_invalid',
} as const;

// Telemetry imports nothing from contracts (the private agent-access module stays out of the SDK mirror); the control-plane vocabulary test pins these to it.
export const AGENT_ACCESS_TELEMETRY_MODES = ['off', 'answers', 'answers_and_pages'] as const;
export const AGENT_ACCESS_TELEMETRY_SENSITIVITIES = [
  'public',
  'team_scoped',
  'restricted',
  'confidential',
] as const;
export const AGENT_ACCESS_TELEMETRY_WRITE_DENIALS = [
  'forbidden',
  'unavailable',
  'billing',
  'mode_unavailable',
  'revision_conflict',
] as const;
export const AGENT_ACCESS_TELEMETRY_CONFIG_CODES = ['org_allowlist_invalid'] as const;

export type InvitePresetLabel = 'admin' | 'member' | 'custom';
export type InviteRevocationCause =
  | 'member_suspended'
  | 'invite_permission_removed'
  | 'inviter_no_longer_permitted'
  | 'inviter_cannot_readmit';

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
  // A user withdrew a workspace that held nothing live (self-serve), or the account deletion that
  // withdrew it. Content-free: an org id and a count.
  'workspace.deleted': { orgId: string; deploymentsDeleted: number };
  // A user deleted their own account. `tombstoned` = the row was kept as an FK anchor for an
  // append-only ledger it appears in (hash-chained admin audit, the legacy identity gate); the
  // account itself is gone either way. `platformTenantsRetained` counts platform fixtures that were
  // detached and left running rather than deleted.
  'account.deleted': {
    accountId: string;
    workspacesDeleted: number;
    platformTenantsRetained: number;
    tombstoned: boolean;
  };
  'co_processing_consent.recorded': { orgId: string; tier: string; disclosureVersion: string };
  'source.connected': { orgId: string; sourceKind: string; hasRefreshToken: boolean };
  'member.invited': { orgId: string; role: InvitePresetLabel; count: number };
  'member.invites_revoked': { orgId: string; count: number; cause: InviteRevocationCause };
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
  'wiki.viewed': { orgId: string; audience: string; blockCount: number };
  'review.actioned': { orgId: string; action: 'assign' | 'remove' };
  'theme.merge_reviewed': { orgId: string; action: 'approve' | 'reject' };
  'agent_access.policy_changed': {
    orgId: string;
    mode: (typeof AGENT_ACCESS_TELEMETRY_MODES)[number];
    maxSensitivity: (typeof AGENT_ACCESS_TELEMETRY_SENSITIVITIES)[number];
    allowedAgentCount: number;
    widening: boolean;
  };
  'agent_access.policy_write_refused': {
    orgId: string;
    reason: (typeof AGENT_ACCESS_TELEMETRY_WRITE_DENIALS)[number];
  };
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
  'association.judged': { orgId: string; assigned: number; removed: number; recorded: number };
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
  'enclave.event_loop_delay': {
    loopDelayP50Ms: number;
    loopDelayP99Ms: number;
    loopDelayMaxMs: number;
    loopSamples: number;
    seconds: number;
  };
  'wiki.synthesized': {
    orgId: string;
    themeId: string;
    audiences: number;
    withdrawnAudiences: number;
  };
  'wiki.first_page.ready': { orgId: string; secondsSinceFirstPull: number };
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
  'api.request': {
    method: RequestMethod;
    routeTemplate: string;
    statusCode: number;
    durationBucket: DurationBucket;
  };
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
  'agent_access.config_invalid': { code: (typeof AGENT_ACCESS_TELEMETRY_CONFIG_CODES)[number] };
  'error.captured': ErrorReport;
};

export const BrowserTelemetryEvent = {
  SourceConnectStarted: 'source.connect_started',
  SourceConnectFailed: 'source.connect_failed',
  SignInCompleted: 'sign_in_completed',
  ClientError: 'client_error',
  PageViewed: 'page_viewed',
  CtaClicked: 'cta_clicked',
  RouteViewed: 'route_viewed',
  OnboardingStepViewed: 'onboarding_step_viewed',
} as const;

export const BROWSER_SURFACES = ['web', 'console', 'operator', 'box'] as const;
export type BrowserSurface = (typeof BROWSER_SURFACES)[number];

export interface BrowserCatalog {
  readonly routeTemplates: ReadonlySet<string>;
  readonly pages: ReadonlySet<string>;
  readonly ctas: ReadonlySet<string>;
}

export const CLIENT_ERROR_NAMES = [
  'Error',
  'TypeError',
  'RangeError',
  'ReferenceError',
  'SyntaxError',
  'URIError',
  'EvalError',
  'AggregateError',
  'DOMException',
  'AbortError',
  'NetworkError',
  'SecurityError',
  'NotAllowedError',
  'QuotaExceededError',
  'InvalidStateError',
  'NotFoundError',
  'TimeoutError',
  'ChunkLoadError',
  'UnknownError',
  'other',
] as const;
export type ClientErrorName = (typeof CLIENT_ERROR_NAMES)[number];

export const ONBOARDING_STEPS = ['sources', 'roster', 'invite', 'done'] as const;
export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ROUTE_VIEW_SURFACES = ['console', 'operator', 'box'] as const;
export type RouteViewSurface = (typeof ROUTE_VIEW_SURFACES)[number];

const CLIENT_ERROR_NAME_SET: ReadonlySet<string> = new Set(CLIENT_ERROR_NAMES);
const OTHER_CLIENT_ERROR_NAME: ClientErrorName = 'other';

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
  client_error: { origin: BrowserClientErrorOrigin; errorName: ClientErrorName };
  page_viewed: { eventSchemaVersion: 1; page: string };
  cta_clicked: { eventSchemaVersion: 1; cta: string; page: string };
  route_viewed: { eventSchemaVersion: 1; surface: RouteViewSurface; routeTemplate: string };
  onboarding_step_viewed: { eventSchemaVersion: 1; step: OnboardingStep };
};

export type BrowserEventProperties<K extends BrowserTelemetryEventName> = K extends 'route_viewed'
  ? Omit<TelemetryEventMap[K], 'surface'>
  : TelemetryEventMap[K];

export type TelemetryEventMap = ProductEvents & OpsEvents & ErrorEvents & BrowserEvents;

export type TelemetryEventName = keyof TelemetryEventMap;

export type BrowserTelemetryEventName = keyof BrowserEvents;

export type ServerTelemetryEventName =
  | (typeof TelemetryEvent)[keyof typeof TelemetryEvent]
  | BrowserTelemetryEventName;

const SERVER_TELEMETRY_EVENTS = new Set<string>([
  ...Object.values(TelemetryEvent),
  ...Object.values(BrowserTelemetryEvent),
]);

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

export const BROWSER_SOURCE_CONNECT_FAILURES = new Set<BrowserSourceConnectFailure>([
  'cancelled',
  'failed',
  'network',
  'provider',
  'unauthorized',
  'unsupported',
]);

export const BROWSER_CLIENT_ERROR_ORIGINS = new Set<BrowserClientErrorOrigin>([
  'error_boundary',
  'window_error',
  'unhandled_rejection',
]);

const BROWSER_EVENT_PROPERTY_KEYS: Record<BrowserTelemetryEventName, readonly string[]> = {
  'source.connect_started': ['eventSchemaVersion', 'sourceKind'],
  'source.connect_failed': ['eventSchemaVersion', 'sourceKind', 'reason'],
  sign_in_completed: [],
  client_error: ['origin', 'errorName'],
  page_viewed: ['eventSchemaVersion', 'page'],
  cta_clicked: ['eventSchemaVersion', 'cta', 'page'],
  route_viewed: ['eventSchemaVersion', 'routeTemplate'],
  onboarding_step_viewed: ['eventSchemaVersion', 'step'],
};

const BROWSER_EVENT_SURFACES: Record<BrowserTelemetryEventName, readonly BrowserSurface[]> = {
  'source.connect_started': ['console', 'box'],
  'source.connect_failed': ['console', 'box'],
  sign_in_completed: ['console', 'operator', 'box'],
  client_error: ['console', 'operator', 'box'],
  page_viewed: ['web'],
  cta_clicked: ['web'],
  route_viewed: ROUTE_VIEW_SURFACES,
  onboarding_step_viewed: ['console'],
};

export const CATALOG_BACKED_BROWSER_EVENTS: ReadonlySet<string> =
  new Set<BrowserTelemetryEventName>([
    'page_viewed',
    'cta_clicked',
    'route_viewed',
    'onboarding_step_viewed',
  ]);

const ONBOARDING_STEP_SET: ReadonlySet<string> = new Set(ONBOARDING_STEPS);
const CATALOG_PROPERTY_KEYS: ReadonlySet<string> = new Set([
  'page',
  'cta',
  'routeTemplate',
  'step',
]);

export function isBrowserTelemetryEvent(event: string): event is BrowserTelemetryEventName {
  return Object.prototype.hasOwnProperty.call(BROWSER_EVENT_PROPERTY_KEYS, event);
}

export function isBrowserSourceKind(value: string): value is BrowserSourceKind {
  return BROWSER_SOURCE_KINDS.has(value as BrowserSourceKind);
}

export function browserTelemetryPropertyKeys(event: BrowserTelemetryEventName): readonly string[] {
  return BROWSER_EVENT_PROPERTY_KEYS[event];
}

export function clientErrorName(value: unknown): ClientErrorName {
  if (!(value instanceof Error)) return OTHER_CLIENT_ERROR_NAME;
  try {
    const name = value.name;
    return CLIENT_ERROR_NAME_SET.has(name) && isGlobalConstructor(value.constructor)
      ? (name as ClientErrorName)
      : OTHER_CLIENT_ERROR_NAME;
  } catch {
    return OTHER_CLIENT_ERROR_NAME;
  }
}

// An application-defined subclass is "other" even when it inherits a listed name.
function isGlobalConstructor(constructor: unknown): boolean {
  return (
    typeof constructor === 'function' &&
    constructor.name !== '' &&
    (globalThis as unknown as Record<string, unknown>)[constructor.name] === constructor
  );
}

export function isBrowserEventAllowedFrom(
  event: BrowserTelemetryEventName,
  surface: BrowserSurface,
): boolean {
  return isBrowserTelemetryEvent(event) && BROWSER_EVENT_SURFACES[event].includes(surface);
}

export function isBrowserTelemetryProperty(
  event: BrowserTelemetryEventName,
  key: string,
  value: unknown,
  catalog?: BrowserCatalog,
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
      CLIENT_ERROR_NAME_SET.has(value)
    );
  }
  if (CATALOG_PROPERTY_KEYS.has(key)) return isCatalogProperty(event, key, value, catalog);
  return (
    event === BrowserTelemetryEvent.SourceConnectFailed &&
    key === 'reason' &&
    typeof value === 'string' &&
    BROWSER_SOURCE_CONNECT_FAILURES.has(value as BrowserSourceConnectFailure)
  );
}

function isCatalogProperty(
  event: BrowserTelemetryEventName,
  key: string,
  value: unknown,
  catalog: BrowserCatalog | undefined,
): boolean {
  if (catalog === undefined || typeof value !== 'string') return false;
  switch (key) {
    case 'page':
      return (
        (event === BrowserTelemetryEvent.PageViewed ||
          event === BrowserTelemetryEvent.CtaClicked) &&
        catalog.pages.has(value)
      );
    case 'cta':
      return event === BrowserTelemetryEvent.CtaClicked && catalog.ctas.has(value);
    case 'routeTemplate':
      return (
        event === BrowserTelemetryEvent.RouteViewed &&
        (value === UNMATCHED_ROUTE_TEMPLATE || catalog.routeTemplates.has(value))
      );
    case 'step':
      return event === BrowserTelemetryEvent.OnboardingStepViewed && ONBOARDING_STEP_SET.has(value);
    default:
      return false;
  }
}

export function areBrowserTelemetryPropertiesValid(
  event: BrowserTelemetryEventName,
  properties: Record<string, unknown>,
  catalog?: BrowserCatalog,
): boolean {
  if (!isBrowserTelemetryEvent(event)) return false;
  const allowedKeys = browserTelemetryPropertyKeys(event);
  return (
    Object.keys(properties).length === allowedKeys.length &&
    allowedKeys.every(
      (key) =>
        key in properties && isBrowserTelemetryProperty(event, key, properties[key], catalog),
    )
  );
}
