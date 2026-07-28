import type { Logger } from '@folklore/core';
import type { Connector, ConnectorContext, WebhookEvent } from '../connector.js';
import type { NormalizedRecords } from '../normalized.js';
/** Enclave/runtime deps for constructing a pull-capable connector instance. */
export interface PullConnectorDeps {
    logger: Logger;
    token: string;
    httpsProxyAgent?: unknown;
    gmailLabelAllowlist?: string[];
    m365FolderAllowlist?: string[];
}
export type WebhookConnectorFactory = (ctx: ConnectorContext) => Connector;
export type PullConnectorFactory = (deps: PullConnectorDeps) => Connector;
export interface ConnectorRegistration {
    readonly kind: string;
    readonly createForWebhook?: WebhookConnectorFactory;
    readonly createForPull?: PullConnectorFactory;
}
export declare class ConnectorRegistry {
    private readonly byKind;
    register(registration: ConnectorRegistration): void;
    normalizeWebhook(kind: string, event: WebhookEvent, ctx: ConnectorContext): NormalizedRecords;
    createPullConnector(kind: string, deps: PullConnectorDeps): Connector | null;
    listPullKinds(): string[];
}
//# sourceMappingURL=ConnectorRegistry.d.ts.map