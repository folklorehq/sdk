import type { ConnectorContext } from '../connector.js';
import type { NormalizedRecords } from '../normalized.js';
import { ConnectorRegistry, type PullConnectorDeps } from './ConnectorRegistry.js';
export declare function getDefaultConnectorRegistry(): ConnectorRegistry;
export declare function normalizeWebhookEvent(source: string, eventType: string, payload: unknown, ctx: ConnectorContext): NormalizedRecords;
export declare function createPullConnector(kind: string, deps: PullConnectorDeps): import("../connector.js").Connector | null;
export declare function listPullConnectorKinds(): string[];
export type { PullConnectorDeps, ConnectorRegistration } from './ConnectorRegistry.js';
export { ConnectorRegistry } from './ConnectorRegistry.js';
//# sourceMappingURL=index.d.ts.map