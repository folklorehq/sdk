import { BaseConnector } from '../BaseConnector.js';
import type { ConnectorContext, PullOptions, PullResult, SyncCursor, WebhookEvent } from '../connector.js';
import type { NormalizedRecords, NormalizedResource } from '../normalized.js';
import type { IntercomApiClient } from './client.js';
export declare class IntercomConnector extends BaseConnector {
    private readonly client;
    readonly kind = "intercom";
    constructor(context: ConnectorContext, client: IntercomApiClient);
    listResources(): Promise<NormalizedResource[]>;
    pull(cursor: SyncCursor, options?: PullOptions): Promise<PullResult>;
    normalizeWebhook(event: WebhookEvent): NormalizedRecords;
}
//# sourceMappingURL=IntercomConnector.d.ts.map