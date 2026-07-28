import { BaseConnector } from '../BaseConnector.js';
import type { ConnectorContext, PullOptions, PullResult, SyncCursor, WebhookEvent } from '../connector.js';
import type { NormalizedRecords, NormalizedResource } from '../normalized.js';
import type { LinearApiClient } from './client.js';
export declare class LinearConnector extends BaseConnector {
    private readonly client;
    readonly kind = "linear";
    constructor(context: ConnectorContext, client: LinearApiClient);
    listResources(): Promise<NormalizedResource[]>;
    pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult>;
    normalizeWebhook(event: WebhookEvent): NormalizedRecords;
}
//# sourceMappingURL=LinearConnector.d.ts.map