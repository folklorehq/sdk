import { BaseConnector } from '../base-connector.js';
import type { ConnectorContext, PullOptions, PullResult, SyncCursor, WebhookEvent } from '../connector.js';
import type { NormalizedRecords, NormalizedResource } from '../normalized.js';
import type { SlackClient } from './client.js';
export declare class SlackConnector extends BaseConnector {
    private readonly client;
    readonly kind = "slack";
    constructor(context: ConnectorContext, client: SlackClient);
    listResources(): Promise<NormalizedResource[]>;
    pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult>;
    normalizeWebhook(event: WebhookEvent): NormalizedRecords;
}
//# sourceMappingURL=connector.d.ts.map