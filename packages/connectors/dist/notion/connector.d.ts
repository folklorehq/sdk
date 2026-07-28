import { BaseConnector } from '../base-connector.js';
import type { ConnectorContext, PullOptions, PullResult, SyncCursor, WebhookEvent } from '../connector.js';
import type { NormalizedRecords, NormalizedResource } from '../normalized.js';
import type { NotionApiClient } from './client.js';
export declare class NotionConnector extends BaseConnector {
    private readonly client;
    readonly kind = "notion";
    constructor(context: ConnectorContext, client: NotionApiClient);
    listResources(): Promise<NormalizedResource[]>;
    pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult>;
    normalizeWebhook(event: WebhookEvent): NormalizedRecords;
}
//# sourceMappingURL=connector.d.ts.map