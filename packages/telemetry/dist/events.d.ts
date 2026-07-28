import type { ErrorReport } from '@folklore/errors';
export declare const TelemetryEvent: {
    readonly OrgCreated: "org.created";
    readonly OrgRecoveryKeySet: "org.recovery_key_set";
    readonly CoProcessingConsentRecorded: "co_processing_consent.recorded";
    readonly SourceConnected: "source.connected";
    readonly MemberInvited: "member.invited";
    readonly BetaInviteCreated: "beta_invite.created";
    readonly BetaInviteAccepted: "beta_invite.accepted";
    readonly DirectoryImported: "directory.imported";
    readonly SubscriptionCreated: "subscription.created";
    readonly SubscriptionStatusChanged: "subscription.status_changed";
    readonly SubscriptionSeatsChanged: "subscription.seats_changed";
    readonly WikiViewed: "wiki.viewed";
    readonly ReviewActioned: "review.actioned";
    readonly FactIngested: "fact.ingested";
    readonly FactScored: "fact.scored";
    readonly FactPromoted: "fact.promoted";
    readonly AssociationDrainRun: "association.drain.run";
    readonly ThemeResolved: "theme.resolved";
    readonly ThemeInference: "theme.inference";
    readonly ThemeGraphEdgeFailed: "theme.graph_edge_failed";
    readonly ThemeMerged: "theme.merged";
    readonly ThemeMergeReviewed: "theme.merge_reviewed";
    readonly ThemeMergeGraphFailed: "theme.merge_graph_failed";
    readonly ThemeMergeReconcileFailed: "theme.merge_reconcile_failed";
    readonly ThemeMergeReconcileUnresolved: "theme.merge_reconcile_unresolved";
    readonly InferenceEmbed: "inference.embed";
    readonly InferenceGenerate: "inference.generate";
    readonly InferenceReceiptVerified: "inference.receipt_verified";
    readonly InferenceModelRejected: "inference.model_rejected";
    readonly InferenceAttestationFailed: "inference.attestation_failed";
    readonly InferenceError: "inference.error";
    readonly WikiSynthesized: "wiki.synthesized";
    readonly WikiRichBlocksSynthesized: "wiki.rich_blocks.synthesized";
    readonly WikiLinkPreview: "wiki.link_preview";
    readonly NotificationSent: "notification.sent";
    readonly NotificationSendFailed: "notification.send_failed";
    readonly WorkerError: "worker.error";
    readonly DeploymentCheckin: "deployment.checkin";
    readonly OrgUsage: "org.usage";
    readonly TenantDataDeleted: "tenant.data_deleted";
    readonly ErrorCaptured: "error.captured";
};
/** Actor-visible lifecycle: org → sources → members → directory → billing → reading. */
type ProductEvents = {
    'org.created': {
        orgId: string;
        plan: string;
        region?: string;
        tier?: string;
        processingTier?: string;
    };
    'org.recovery_key_set': {
        orgId: string;
        rotated: boolean;
    };
    'co_processing_consent.recorded': {
        orgId: string;
        tier: string;
        disclosureVersion: string;
    };
    'source.connected': {
        orgId: string;
        sourceKind: string;
        hasRefreshToken: boolean;
    };
    'member.invited': {
        orgId: string;
        role: string;
        count: number;
    };
    'beta_invite.created': Record<string, never>;
    'beta_invite.accepted': {
        betaInviteId: string;
    };
    'directory.imported': {
        orgId: string;
        provider: string;
        peopleCount: number;
        groupCount: number;
    };
    'subscription.created': {
        orgId: string;
        status: string;
    };
    'subscription.status_changed': {
        orgId: string;
        status: string;
    };
    'subscription.seats_changed': {
        orgId: string;
        seats: number;
    };
    'wiki.viewed': {
        orgId: string;
        themeId: string;
        audience: string;
        blockCount: number;
    };
    'review.actioned': {
        orgId: string;
        action: 'assign' | 'remove';
    };
    'theme.merge_reviewed': {
        orgId: string;
        action: 'approve' | 'reject';
    };
};
/** Pipeline stage durations, throughput, and fleet check-in vitals — no content. */
type OpsEvents = {
    'fact.ingested': {
        orgId: string;
        sourceKind: string;
    };
    'fact.scored': {
        orgId: string;
        confidence: 'high' | 'medium' | 'low' | 'override';
        hnswExpanded: boolean;
    };
    'fact.promoted': {
        orgId: string;
        containerId: string;
    };
    'association.drain.run': {
        count: number;
        durationMs: number;
    };
    'theme.resolved': {
        orgId: string;
        fallback: boolean;
    };
    'theme.inference': {
        orgId: string;
        fallback: boolean;
    };
    'theme.merged': {
        orgId: string;
        trigger: 'auto' | 'approved';
    };
    'inference.embed': {
        model: string;
        latencyMs: number;
    };
    'inference.generate': {
        model: string;
        latencyMs: number;
        inputTokens?: number;
        outputTokens?: number;
    };
    'inference.receipt_verified': {
        sessionId: string;
    };
    'wiki.synthesized': {
        orgId: string;
        themeId: string;
    };
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
    'wiki.link_preview': {
        orgId: string;
        outcome: 'preview' | 'empty';
        latencyMs: number;
    };
    'notification.sent': {
        orgId: string;
        channel: 'email' | 'slack';
    };
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
/** Content-free error taxonomy (ADL #18) — a triage trail keyed by kind + component. */
type ErrorEvents = {
    'theme.graph_edge_failed': {
        orgId: string;
        kind: string;
    };
    'theme.merge_graph_failed': {
        orgId: string;
    };
    'theme.merge_reconcile_failed': {
        orgId: string;
    };
    'theme.merge_reconcile_unresolved': {
        orgId: string;
    };
    'inference.model_rejected': {
        model: string;
    };
    'inference.attestation_failed': {
        reason: string;
    };
    'inference.error': {
        model: string;
        errorType: string;
    };
    'notification.send_failed': {
        orgId: string;
        channel: 'email' | 'slack';
        errorType: string;
    };
    'worker.error': {
        component: string;
        errorType: string;
        orgId?: string;
    };
    'error.captured': ErrorReport;
};
export type TelemetryEventMap = ProductEvents & OpsEvents & ErrorEvents;
export type TelemetryEventName = keyof TelemetryEventMap;
export {};
//# sourceMappingURL=events.d.ts.map