// SPDX-License-Identifier: Apache-2.0
import type { ErrorReport } from '@folklore/errors';

export const TelemetryEvent = {
  OrgCreated: 'org.created',
  OrgRecoveryKeySet: 'org.recovery_key_set',
  CoProcessingConsentRecorded: 'co_processing_consent.recorded',
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
    version: string;
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
  'notification.send_failed': { orgId: string; channel: 'email' | 'slack'; errorType: string };
  'worker.error': { component: string; errorType: string; orgId?: string };
  // The PostgreSQL owner and routing entry failed to converge. Never send the external ID.
  'source.routing_conflict': {
    orgId: string;
    sourceKind: string;
    rejectedBy: 'postgres_upsert' | 'postgres_upsert_failed' | 'routing_reconciliation_failed';
  };
  'error.captured': ErrorReport;
};

export type TelemetryEventMap = ProductEvents & OpsEvents & ErrorEvents;

export type TelemetryEventName = keyof TelemetryEventMap;
