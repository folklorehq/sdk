import { BaseConnector } from '../BaseConnector.js';
import type { ConnectorContext, PullOptions, PullResult, SyncCursor, WebhookEvent } from '../connector.js';
import type { NormalizedRecords, NormalizedResource } from '../normalized.js';
export declare class MeetingConnector extends BaseConnector {
    readonly kind = "meeting";
    constructor(context: ConnectorContext);
    listResources(): Promise<NormalizedResource[]>;
    pull(_cursor: SyncCursor, _options?: PullOptions): Promise<PullResult>;
    normalizeWebhook(event: WebhookEvent): NormalizedRecords;
}
//# sourceMappingURL=MeetingConnector.d.ts.map